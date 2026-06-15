/**
 * HarnessRuntime — 可编排的处理链运行时
 *
 * 支持三种控制流：
 *   - linear（线性步骤顺序执行）
 *   - condition（条件分支）
 *   - loop（循环直到满足退出条件）
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { IAgentRuntime, RuntimeContext } from './runtime.interface';
import { AIMessage } from '../model/ai.model';
import {
  HarnessRuntimeConfig, HarnessStep,
  LlmStepConfig, ActionStepConfig, WorkflowStepConfig,
  AgentStepConfig, ConditionStepConfig, LoopStepConfig,
} from '../../blueprint/model/blueprint.model';
import { ILLMClient } from '../port/llm.port';
import { WorkflowService } from '../../workflow/service/workflow.service';
import { AgentService } from '../../agent/service/agent.service';
import { ActionContext } from '../action/action.interface';
import { ActionRegistry } from '../action/action-registry';

@Provide()
@Scope(ScopeEnum.Singleton)
export class HarnessRuntime implements IAgentRuntime {
  @Inject('llmClient')
  llmClient: ILLMClient;

  @Inject()
  workflowService: WorkflowService;

  @Inject()
  agentService: AgentService;

  @Inject()
  actionRegistry: ActionRegistry;

  async *execute(
    messages: AIMessage[],
    context: RuntimeContext,
  ): AsyncGenerator<string> {
    const config = context.config as HarnessRuntimeConfig;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userMessage = lastUserMsg?.content || '';

    // Harness 上下文 — 步骤间共享数据
    const harnessCtx: Record<string, any> = {
      userMessage,
      conversationId: context.conversationId,
      userId: context.userId,
    };

    yield `data: ${JSON.stringify({ type: 'harness_start', stepCount: config.chain.length })}\n\n`;

    const actionContext: ActionContext = { conversationId: context.conversationId, userId: context.userId };

    yield* this.executeSteps(config.chain, harnessCtx, actionContext, messages);

    yield `data: ${JSON.stringify({ type: 'harness_end' })}\n\n`;

    // 如果上下文中有 __finalOutput，作为最终回复
    const finalOutput = harnessCtx['__finalOutput'] || harnessCtx['output'] || '';
    if (finalOutput) {
      yield `data: ${JSON.stringify({ type: 'content', content: finalOutput })}\n\n`;
    }

    yield 'data: [DONE]\n\n';
  }

  private async *executeSteps(
    steps: HarnessStep[],
    ctx: Record<string, any>,
    actionContext: ActionContext,
    messages: AIMessage[],
  ): AsyncGenerator<string> {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      yield `data: ${JSON.stringify({ type: 'harness_step', stepIndex: i, stepName: step.name, stepType: step.type })}\n\n`;

      switch (step.type) {
        case 'llm':
          yield* this.executeLlmStep(step.config as LlmStepConfig, ctx);
          break;
        case 'action':
          yield* this.executeActionStep(step.config as ActionStepConfig, ctx, actionContext);
          break;
        case 'workflow':
          yield* this.executeWorkflowStep(step.config as WorkflowStepConfig, ctx, actionContext);
          break;
        case 'agent':
          yield* this.executeAgentStep(step.config as AgentStepConfig, ctx);
          break;
        case 'condition':
          yield* this.executeConditionStep(step.config as ConditionStepConfig, ctx, actionContext, messages);
          break;
        case 'loop':
          yield* this.executeLoopStep(step.config as LoopStepConfig, ctx, actionContext, messages);
          break;
      }
    }
  }

  /** LLM 步骤 */
  private async *executeLlmStep(config: LlmStepConfig, ctx: Record<string, any>): AsyncGenerator<string> {
    const prompt = this.templateReplace(config.prompt, ctx);
    const result = await this.llmClient.complete(prompt, { temperature: config.temperature || 0.7 });
    ctx[config.outputKey] = result;
    ctx['__finalOutput'] = result;
    yield `data: ${JSON.stringify({ type: 'harness_llm', outputKey: config.outputKey, preview: result.slice(0, 200) })}\n\n`;
  }

  /** Action 步骤 */
  private async *executeActionStep(
    config: ActionStepConfig, ctx: Record<string, any>, actionContext: ActionContext
  ): AsyncGenerator<string> {
    const action = this.actionRegistry.getAll().get(config.actionName);
    if (!action) {
      ctx[config.outputKey] = { error: `未知 Action: ${config.actionName}` };
      return;
    }

    const args: Record<string, any> = {};
    for (const [key, template] of Object.entries(config.argsTemplate)) {
      args[key] = this.templateReplace(template, ctx);
    }

    yield `data: ${JSON.stringify({ type: 'tool_start', tool: config.actionName, args })}\n\n`;
    const result = await action.execute(args, actionContext);
    ctx[config.outputKey] = result.output;
    yield `data: ${JSON.stringify({ type: 'tool_result', tool: config.actionName, result: result.ssePayload })}\n\n`;
  }

  /** Workflow 步骤 */
  private async *executeWorkflowStep(
    config: WorkflowStepConfig, ctx: Record<string, any>, actionContext: ActionContext
  ): AsyncGenerator<string> {
    const workflow = await this.workflowService.getById(config.workflowId);
    if (!workflow) {
      ctx[config.outputKey] = '工作流不存在';
      return;
    }

    let output = '';
    for await (const event of this.workflowService.executeWorkflow(
      workflow, ctx['userMessage'] || '', this.actionRegistry.getAll(), actionContext
    )) {
      yield event;
      try {
        const line = event.replace(/^data:\s*/, '').trim();
        if (line) {
          const parsed = JSON.parse(line);
          if (parsed.type === 'content' && parsed.content) output += parsed.content;
        }
      } catch { /* ignore */ }
    }

    ctx[config.outputKey] = output;
  }

  /** Agent 步骤 */
  private async *executeAgentStep(config: AgentStepConfig, ctx: Record<string, any>): AsyncGenerator<string> {
    const agent = await this.agentService.getById(config.agentId);
    if (!agent) {
      ctx[config.outputKey] = 'Agent 不存在';
      return;
    }

    const task = this.templateReplace(config.taskPrompt, ctx);
    const result = await this.llmClient.complete(`${agent.prompt}\n\n任务: ${task}`, { temperature: 0.7, maxTokens: 1000 });
    ctx[config.outputKey] = result;
    ctx['__finalOutput'] = result;
    yield `data: ${JSON.stringify({ type: 'harness_agent', agentName: agent.name, preview: result.slice(0, 200) })}\n\n`;
  }

  /** Condition 步骤 — 条件分支 */
  private async *executeConditionStep(
    config: ConditionStepConfig,
    ctx: Record<string, any>,
    actionContext: ActionContext,
    messages: AIMessage[],
  ): AsyncGenerator<string> {
    const conditionResult = this.evaluateExpression(config.expression, ctx);
    yield `data: ${JSON.stringify({ type: 'harness_condition', expression: config.expression, result: conditionResult })}\n\n`;

    const branch = conditionResult ? config.trueSteps : config.falseSteps;
    if (branch && branch.length > 0) {
      yield* this.executeSteps(branch, ctx, actionContext, messages);
    }
  }

  /** Loop 步骤 — 循环 */
  private async *executeLoopStep(
    config: LoopStepConfig,
    ctx: Record<string, any>,
    actionContext: ActionContext,
    messages: AIMessage[],
  ): AsyncGenerator<string> {
    for (let iter = 0; iter < config.maxIterations; iter++) {
      yield `data: ${JSON.stringify({ type: 'harness_loop', iteration: iter + 1, maxIterations: config.maxIterations })}\n\n`;

      yield* this.executeSteps(config.steps, ctx, actionContext, messages);

      if (config.breakCondition && this.evaluateExpression(config.breakCondition, ctx)) {
        yield `data: ${JSON.stringify({ type: 'harness_loop_break', iteration: iter + 1 })}\n\n`;
        break;
      }
    }
  }

  /** 模板替换 {{variable}} */
  private templateReplace(template: string, ctx: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = ctx[key];
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }

  /** 简单表达式求值 */
  private evaluateExpression(expression: string, ctx: Record<string, any>): boolean {
    const replaced = this.templateReplace(expression, ctx);
    try {
      // 安全的简单表达式：支持 ==, !=, contains, !empty
      if (replaced.includes('==')) {
        const [left, right] = replaced.split('==').map(s => s.trim().replace(/['"]/g, ''));
        return left === right;
      }
      if (replaced.includes('!=')) {
        const [left, right] = replaced.split('!=').map(s => s.trim().replace(/['"]/g, ''));
        return left !== right;
      }
      if (replaced.includes('contains')) {
        const match = replaced.match(/(.+)\s+contains\s+['"](.+)['"]/);
        if (match) return match[1].trim().includes(match[2]);
      }
      if (replaced.trim() === '!empty') return false;
      // 非空非 falsy 值为 true
      return !!replaced && replaced !== 'false' && replaced !== 'undefined' && replaced !== 'null';
    } catch {
      return false;
    }
  }
}
