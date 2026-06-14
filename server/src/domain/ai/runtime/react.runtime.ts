/**
 * ReactRuntime — ReAct 运行时
 *
 * 从 ReactAgentService.chatStream() 重构而来。
 * 配置从 Blueprint 的 ReactRuntimeConfig 读取，不再硬编码。
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { IAgentRuntime, RuntimeContext } from './runtime.interface';
import { AIMessage, AITool } from '../model/ai.model';
import { ReactRuntimeConfig } from '../../blueprint/model/blueprint.model';
import { ILLMClient } from '../port/llm.port';
import { Action, ActionContext } from '../action/action.interface';
import { CustomerService } from '../../customer/service/customer.service';
import { SkillService } from '../../skill/service/skill.service';
import { WorkflowService } from '../../workflow/service/workflow.service';
import { CreateTicketAction } from '../action/create-ticket.action';
import { SearchKnowledgeAction } from '../action/search-knowledge.action';
import { SaveCustomerInfoAction } from '../action/save-customer-info.action';

@Provide()
@Scope(ScopeEnum.Singleton)
export class ReactRuntime implements IAgentRuntime {
  @Inject('llmClient')
  llmClient: ILLMClient;

  @Inject()
  customerService: CustomerService;

  @Inject()
  skillService: SkillService;

  @Inject()
  workflowService: WorkflowService;

  @Inject('action:create_ticket')
  createTicketAction: CreateTicketAction;

  @Inject('action:search_knowledge')
  searchKnowledgeAction: SearchKnowledgeAction;

  @Inject('action:save_customer_info')
  saveCustomerInfoAction: SaveCustomerInfoAction;

  /** 全局 Action 注册表 */
  private get allActions(): Map<string, Action> {
    const map = new Map<string, Action>();
    map.set('create_ticket', this.createTicketAction);
    map.set('search_knowledge', this.searchKnowledgeAction);
    map.set('save_customer_info', this.saveCustomerInfoAction);
    return map;
  }

  async *execute(
    messages: AIMessage[],
    context: RuntimeContext,
  ): AsyncGenerator<string> {
    const config = context.config as ReactRuntimeConfig;
    const startTime = Date.now();
    console.log(`[ReactRuntime] ━━━ 对话开始 ━━━ blueprint=${context.blueprintId}`);

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUserMsg?.content || '';

    // 过滤可用 Actions
    const enabledActions = new Map<string, Action>();
    for (const name of config.actions) {
      const action = this.allActions.get(name);
      if (action) enabledActions.set(name, action);
    }

    // ① 工作流匹配（仅当配置了可触发工作流时才启用）
    if (config.workflowIds && config.workflowIds.length > 0) {
      const matchedWorkflow = await this.workflowService.matchWorkflow(userText);
      if (matchedWorkflow && config.workflowIds.includes(matchedWorkflow.id)) {
        console.log(`[ReactRuntime] 🔄 工作流匹配: ${matchedWorkflow.name}`);
        yield `data: ${JSON.stringify({
          type: 'workflow_match',
          workflowId: matchedWorkflow.id,
          workflowName: matchedWorkflow.name,
          workflowIcon: matchedWorkflow.icon,
          workflowMode: matchedWorkflow.mode,
        })}\n\n`;

        const actionContext: ActionContext = { conversationId: context.conversationId, userId: context.userId };
        let workflowContent = '';

        for await (const event of this.workflowService.executeWorkflow(
          matchedWorkflow, userText, enabledActions, actionContext
        )) {
          yield event;
          try {
            const line = event.replace(/^data:\s*/, '').trim();
            if (line) {
              const parsed = JSON.parse(line);
              if (parsed.type === 'content' && parsed.content) workflowContent += parsed.content;
            }
          } catch { /* ignore */ }
        }

        if (matchedWorkflow.mode === 'independent') {
          if (!workflowContent) {
            yield `data: ${JSON.stringify({ type: 'content', content: `[工作流 "${matchedWorkflow.name}" 已执行完成]` })}\n\n`;
          }
          yield 'data: [DONE]\n\n';
          return;
        }

        if (workflowContent) {
          yield `data: ${JSON.stringify({ type: 'workflow_output', content: workflowContent, mode: 'replace_input' })}\n\n`;
          const idx = messages.length - 1 - [...messages].reverse().findIndex(m => m.role === 'user');
          if (idx >= 0) messages[idx] = { ...messages[idx], content: workflowContent };
        }
      }
    }

    // ② 技能匹配（仅当配置了可触发技能时才启用）
    let matchedSkills: { id: string; name: string; prompt: string; icon: string }[] = [];
    if (config.skillIds && config.skillIds.length > 0) {
      const allMatched = await this.skillService.matchByText(userText);
      matchedSkills = allMatched.filter(s => config.skillIds.includes(s.id));
    }
    const systemPrompt = await this.buildSystemPrompt(config, context.conversationId, matchedSkills);

    if (matchedSkills.length > 0) {
      yield `data: ${JSON.stringify({
        type: 'skill_match',
        skills: matchedSkills.map(s => ({ id: s.id, name: s.name, icon: s.icon })),
      })}\n\n`;
    }

    // ③ ReAct 循环
    const fullMessages: AIMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];
    const tools = this.buildTools(enabledActions);
    const actionContext: ActionContext = { conversationId: context.conversationId, userId: context.userId };

    for (let round = 0; round < config.maxRounds; round++) {
      const response = await this.llmClient.chat(fullMessages, {
        tools: tools.length > 0 ? tools : undefined,
        toolChoice: tools.length > 0 ? 'auto' : undefined,
        temperature: config.temperature,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        yield* this.streamContent(response.content);
        yield 'data: [DONE]\n\n';
        return;
      }

      if (response.content) {
        yield `data: ${JSON.stringify({ type: 'thinking_end', round: round + 1, content: response.content })}\n\n`;
      }

      for (const tc of response.toolCalls) {
        const funcName = tc.function.name;
        let args: any;
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

        yield `data: ${JSON.stringify({ type: 'tool_start', tool: funcName, args })}\n\n`;

        const action = enabledActions.get(funcName);
        let toolResult: string;
        if (action) {
          const result = await action.execute(args, actionContext);
          toolResult = result.output;
          yield `data: ${JSON.stringify({ type: 'tool_result', tool: funcName, result: result.ssePayload })}\n\n`;
        } else {
          toolResult = JSON.stringify({ error: `未知工具: ${funcName}` });
          yield `data: ${JSON.stringify({ type: 'tool_result', tool: funcName, result: { error: '未知工具' } })}\n\n`;
        }

        fullMessages.push({ role: 'assistant', content: response.content || '', tool_calls: response.toolCalls });
        fullMessages.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
      }
    }

    // 超过最大轮次，强制生成回复
    try {
      for await (const chunk of this.llmClient.chatStream(fullMessages)) {
        yield `data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`;
      }
    } catch {
      yield `data: ${JSON.stringify({ type: 'error', content: 'AI 服务错误' })}\n\n`;
    }
    yield 'data: [DONE]\n\n';
  }

  private buildTools(actions: Map<string, Action>): AITool[] {
    return [...actions.values()].map(action => ({
      type: 'function' as const,
      function: {
        name: action.definition().name,
        description: action.definition().description,
        parameters: action.definition().parameters,
      },
    }));
  }

  private async buildSystemPrompt(
    config: ReactRuntimeConfig,
    conversationId?: string,
    matchedSkills: { name: string; prompt: string; icon: string }[] = [],
  ): Promise<string> {
    let prompt = config.systemPrompt;

    prompt += `\n\n## 思考与行动规范
你是一个 ReAct (Reasoning + Acting) 智能体。每次回复时请遵循以下规范：
**当你需要调用工具时：**
- 必须在 content 字段中写出你的思考推理过程
- 然后通过 tool_calls 调用相应工具
**当你不需要调用工具，直接回复时：**
- 直接在 content 中输出给用户的回复内容`;

    if (config.enableMemory) {
      prompt += `\n\n## 记忆系统说明
你拥有跨对话的长期记忆能力。用户的基础信息和历史互动会自动保存在记忆系统中。`;
    }

    if (config.enableCustomerCollection) {
      prompt += `\n\n## 用户信息收集指引
你需要在对话过程中自然地引导收集用户信息。`;

      if (conversationId) {
        const profile = await this.customerService.getByConversation(conversationId);
        if (profile) {
          const fields: string[] = [];
          if (profile.name) fields.push(`姓名: ${profile.name}`);
          if (profile.phone) fields.push(`手机: ${profile.phone}`);
          if (profile.email) fields.push(`邮箱: ${profile.email}`);
          if (fields.length > 0) {
            prompt += `\n\n## 当前对话已收集的用户信息\n${fields.join('\n')}`;
          }
        }
      }
    }

    if (matchedSkills.length > 0) {
      prompt += `\n\n## 已激活技能`;
      for (const skill of matchedSkills) {
        prompt += `\n\n### ${skill.icon} ${skill.name}\n${skill.prompt}`;
      }
    }

    return prompt;
  }

  private async *streamContent(content: string): AsyncGenerator<string> {
    const clean = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!clean) return;
    const chunkSize = 10;
    for (let i = 0; i < clean.length; i += chunkSize) {
      yield `data: ${JSON.stringify({ type: 'content', content: clean.slice(i, i + chunkSize) })}\n\n`;
      await new Promise(r => setTimeout(r, 30));
    }
  }
}
