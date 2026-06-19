/**
 * WorkflowRunner — 工作流执行引擎
 *
 * 遍历工作流步骤，按类型分发执行，管理错误恢复和决策交互。
 */
import { Provide, Inject, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { QueryEngine } from '../agent/query-engine';
import { DecisionGate } from '../agent/decision-gate';
import { ToolRegistry } from '../tools/tool-registry';
import { AgentMessage } from '../agent/types';
import { buildBaseSystemPrompt, buildStepSystemPrompt } from '../agent/system-prompt';
import { WorkflowDefinition, WorkflowStep, AgentTaskConfig, BashCommandConfig, DecisionPointConfig } from './types';
import { WorkflowState } from './workflow-state';
import { exec } from 'child_process';

@Provide()
@Scope(ScopeEnum.Request)
export class WorkflowRunner {
  @Inject()
  queryEngine: QueryEngine;

  @Inject()
  decisionGate: DecisionGate;

  @Inject()
  toolRegistry: ToolRegistry;

  @Config('agent')
  agentConfig: { workspaceDir: string; maxReactRounds: number };

  private state: WorkflowState;
  private sendMessage: ((msg: AgentMessage) => void) | null = null;

  setSender(sender: (msg: AgentMessage) => void): void {
    this.sendMessage = sender;
    this.queryEngine.setSender(sender);
  }

  /**
   * 执行工作流
   */
  async execute(workflow: WorkflowDefinition): Promise<WorkflowState> {
    this.state = WorkflowState.create(workflow);
    this.state.start();

    // 通知客户端工作流开始
    this.sendMessage?.({
      type: 'workflow.started',
      workflowId: workflow.id,
      steps: this.state.getStepInfoList(),
    });

    try {
      while (this.state.hasNextStep()) {
        const step = this.state.nextStep();

        this.sendMessage?.({
          type: 'workflow.step_start',
          stepIndex: step.index,
          stepType: step.type,
          stepName: step.name,
        });

        // 进度更新
        const percent = Math.round((step.index / this.state.getTotalSteps()) * 100);
        this.sendMessage?.({
          type: 'workflow.progress',
          percent,
          message: `执行步骤 ${step.index + 1}/${this.state.getTotalSteps()}: ${step.name}`,
        });

        try {
          const startTime = Date.now();
          const result = await this.executeStep(step);

          this.state.completeStep(step.id, {
            output: result.output,
            artifacts: result.artifacts,
            startTime,
            endTime: Date.now(),
            updatedVariables: result.updatedVariables,
          });

          this.sendMessage?.({
            type: 'workflow.step_end',
            stepIndex: step.index,
            result: { output: result.output?.substring(0, 500), success: true },
          });

        } catch (error) {
          const handled = await this.handleStepError(step, error);
          if (!handled) {
            this.state.fail(`步骤 "${step.name}" 失败: ${error.message}`);
            this.sendMessage?.({
              type: 'workflow.failed',
              workflowId: workflow.id,
              error: `步骤 "${step.name}" 失败: ${error.message}`,
            });
            return this.state;
          }
        }
      }

      this.state.complete();
      this.sendMessage?.({
        type: 'workflow.completed',
        workflowId: workflow.id,
        summary: this.state.getSummary(),
      });

    } catch (error) {
      this.state.fail(error.message);
      this.sendMessage?.({
        type: 'workflow.failed',
        workflowId: workflow.id,
        error: error.message,
      });
    }

    return this.state;
  }

  /** 取消工作流 */
  cancel(): void {
    this.queryEngine.abort();
    this.decisionGate.cancelAll('工作流已取消');
    this.state?.cancel();
  }

  /** 获取当前工作流运行状态（用于重连恢复） */
  getState(): {
    workflowId: string;
    status: string;
    steps: Array<{ id: string; name: string; type: string }>;
    currentStepIndex: number;
    percent: number;
  } | null {
    if (!this.state) return null;
    const totalSteps = this.state.getTotalSteps();
    return {
      workflowId: this.state.workflowId,
      status: this.state.status,
      steps: this.state.getStepInfoList(),
      currentStepIndex: this.state.currentStepIndex,
      percent: totalSteps > 0 ? Math.round((this.state.currentStepIndex / totalSteps) * 100) : 0,
    };
  }

  // ─── 步骤执行分发 ───────────────────────────────────────

  private async executeStep(step: WorkflowStep): Promise<{
    output?: string;
    artifacts?: Array<{ path: string; action: string }>;
    updatedVariables?: Record<string, unknown>;
  }> {
    switch (step.config.type) {
      case 'agent_task':
        return this.executeAgentTask(step, step.config as AgentTaskConfig);
      case 'bash_command':
        return this.executeBashCommand(step, step.config as BashCommandConfig);
      case 'decision_point':
        return this.executeDecisionPoint(step, step.config as DecisionPointConfig);
      default:
        throw new Error(`不支持的步骤类型: ${step.config.type}`);
    }
  }

  /** 执行 Agent 任务 — 启动 ReAct 推理循环 */
  private async executeAgentTask(step: WorkflowStep, config: AgentTaskConfig) {
    const workspaceDir = this.agentConfig.workspaceDir;

    // 构建系统提示
    const basePrompt = buildBaseSystemPrompt(workspaceDir);
    const stepPrompt = buildStepSystemPrompt(
      step.name,
      this.state.resolveVariables(config.prompt),
      this.state.variables,
      this.state.getPreviousResults(),
    );
    const systemPrompt = basePrompt + '\n' + stepPrompt + (config.systemPromptAppend || '');

    // 获取可用工具
    const toolDefs = config.tools
      ? this.toolRegistry.getToolDefinitions(config.tools)
      : this.toolRegistry.getToolDefinitions();

    const result = await this.queryEngine.query({
      messages: [{ role: 'user', content: this.state.resolveVariables(config.prompt) }],
      tools: toolDefs,
      systemPrompt,
      maxTurns: config.maxTurns || this.agentConfig.maxReactRounds,
    });

    return {
      output: result.finalAnswer,
      artifacts: result.files,
    };
  }

  /** 执行 Bash 命令 */
  private async executeBashCommand(step: WorkflowStep, config: BashCommandConfig) {
    const command = this.state.resolveVariables(config.command);
    const timeout = config.timeout || 60000;

    return new Promise<{ output: string }>((resolve, reject) => {
      exec(command, {
        cwd: this.agentConfig.workspaceDir,
        timeout,
        maxBuffer: 1024 * 1024 * 10,
      }, (error, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join('\n');
        const expectedCode = config.expectedExitCode ?? 0;

        if (error && error.code !== expectedCode) {
          reject(new Error(`命令退出码 ${error.code}: ${output}`));
        } else {
          resolve({ output: output || '(无输出)' });
        }
      });
    });
  }

  /** 执行决策点 — 阻塞等待用户输入 */
  private async executeDecisionPoint(step: WorkflowStep, config: DecisionPointConfig) {
    this.state.pause();

    const decision = await this.decisionGate.requestDecision({
      question: this.state.resolveVariables(config.question),
      context: config.context || `工作流 "${this.state.getDefinition().name}" 需要您的决策`,
      options: config.options,
      defaultChoice: config.defaultChoice,
      priority: 'blocking',
    });

    this.state.resume();
    this.state.recordDecision({
      decisionId: decision.decisionId,
      stepId: step.id,
      question: config.question,
      choice: decision.choice,
      timestamp: Date.now(),
    });

    // 将决策结果存入变量
    this.state.setVariable(`decision_${step.id}`, decision.choice);

    return {
      output: `用户决策: ${decision.choice}`,
      updatedVariables: { [`decision_${step.id}`]: decision.choice },
    };
  }

  // ─── 错误处理 ─────────────────────────────────────────

  private async handleStepError(step: WorkflowStep, error: Error): Promise<boolean> {
    const strategy = step.onFailure || 'abort';

    switch (strategy) {
      case 'skip':
        this.state.skipStep(step.id);
        return true;

      case 'retry': {
        const maxRetries = step.maxRetries || 2;
        // 简单重试一次
        try {
          const result = await this.executeStep(step);
          this.state.completeStep(step.id, {
            output: result.output,
            artifacts: result.artifacts,
            startTime: Date.now(),
            endTime: Date.now(),
          });
          return true;
        } catch {
          this.state.failStep(step.id, error.message);
          return false;
        }
      }

      case 'ask_user': {
        const decision = await this.decisionGate.requestDecision({
          question: `步骤 "${step.name}" 执行失败: ${error.message}\n\n请选择处理方式:`,
          context: `错误详情: ${error.message}`,
          options: ['重试', '跳过', '终止工作流'],
          priority: 'blocking',
        });

        if (decision.choice === '重试') {
          return this.handleStepError({ ...step, onFailure: 'retry' }, error);
        } else if (decision.choice === '跳过') {
          this.state.skipStep(step.id);
          return true;
        }
        return false;
      }

      case 'abort':
      default:
        return false;
    }
  }
}
