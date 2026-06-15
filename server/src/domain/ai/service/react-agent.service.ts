import { Provide, Inject, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { CustomerService } from '../../customer/service/customer.service';
import { SkillService } from '../../skill/service/skill.service';
import { SkillToolBridge } from '../../skill/service/skill-tool.bridge';
import { WorkflowService } from '../../workflow/service/workflow.service';
import { AIConfig, AIMessage, AITool } from '../model/ai.model';
import { ILLMClient } from '../port/llm.port';
import { Action, ActionContext } from '../action/action.interface';
import { CreateTicketAction } from '../action/create-ticket.action';
import { SearchKnowledgeAction } from '../action/search-knowledge.action';
import { SaveCustomerInfoAction } from '../action/save-customer-info.action';
import { contentChunkEvent } from '../../workflow/model/sse-events';

const MAX_REACT_ROUNDS = 10;

/**
 * ReAct Agent 服务 — AI 对话核心
 *
 * ReAct 循环: Thought → Action → Observation → Thought → ... → Final Answer
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class ReactAgentService {
  @Inject()
  customerService: CustomerService;

  @Inject()
  skillService: SkillService;

  @Inject()
  skillToolBridge: SkillToolBridge;

  @Inject()
  workflowService: WorkflowService;

  @Inject('action:create_ticket')
  createTicketAction: CreateTicketAction;

  @Inject('action:search_knowledge')
  searchKnowledgeAction: SearchKnowledgeAction;

  @Inject('action:save_customer_info')
  saveCustomerInfoAction: SaveCustomerInfoAction;

  @Inject('llmClient')
  llmClient: ILLMClient;

  @Config('ai')
  aiConfig: AIConfig;

  /** Action 注册表 */
  private get actions(): Map<string, Action> {
    const map = new Map<string, Action>();
    map.set('create_ticket', this.createTicketAction);
    map.set('search_knowledge', this.searchKnowledgeAction);
    map.set('save_customer_info', this.saveCustomerInfoAction);
    return map;
  }

  /** 从 Action 注册表构建 tools 列表 */
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

  /** 构建系统提示词 */
  private async buildSystemPrompt(
    conversationId?: string,
  ): Promise<string> {
    let prompt = this.aiConfig.systemPrompt;

    prompt += `\n\n## 思考与行动规范
你是一个 ReAct (Reasoning + Acting) 智能体。每次回复时请遵循以下规范：

**当你需要调用工具时：**
- 必须在 content 字段中写出你的思考推理过程（为什么要调用这个工具、你的分析判断）
- 思考格式示例："用户要求退款，订单号是 123235。根据退款处理流程，我需要先创建退款工单。"
- 然后通过 tool_calls 调用相应工具

**当你不需要调用工具，直接回复时：**
- 直接在 content 中输出给用户的回复内容
- 不要在回复中包含思考过程，只输出面向用户的自然语言

## 记忆系统说明
你拥有跨对话的长期记忆能力。用户的基础信息和历史互动会自动保存在记忆系统中。
- 如果上下文中包含 [用户基础信息] 或 [用户长期记忆]，说明这是之前对话积累的信息，你应该利用这些信息提供个性化服务
- 如果用户是老用户，可以主动打招呼并引用之前的交互记录（如"上次您提到..."）
- 新获得的用户信息会自动保存到长期记忆，下次对话时可以直接使用

## 用户信息收集指引
你需要在对话过程中自然地引导收集用户信息。遵循以下规则：
1. 不要一开始就要求用户提供所有信息，应在自然对话中逐步收集
2. 在回答用户问题的同时，适时询问相关信息
3. 每当获得新的用户信息，立即调用 save_customer_info 工具保存
4. 必须收集的核心信息：姓名、手机号
5. 不要像填表格一样逐项询问，根据对话上下文自然切入
6. 用户拒绝提供某项信息时，不要反复追问`;

    if (conversationId) {
      const profile = await this.customerService.getByConversation(conversationId);
      if (profile) {
        const fields: string[] = [];
        if (profile.name) fields.push(`姓名: ${profile.name}`);
        if (profile.phone) fields.push(`手机: ${profile.phone}`);
        if (profile.email) fields.push(`邮箱: ${profile.email}`);
        if (profile.company) fields.push(`公司: ${profile.company}`);
        if (profile.position) fields.push(`职位: ${profile.position}`);
        if (profile.requirement) fields.push(`需求: ${profile.requirement}`);

        if (fields.length > 0) {
          prompt += `\n\n## 当前对话已收集的用户信息\n${fields.join('\n')}`;
          const missing: string[] = [];
          if (!profile.name) missing.push('姓名');
          if (!profile.phone) missing.push('手机号');
          if (!profile.email) missing.push('邮箱');
          if (!profile.company) missing.push('公司');
          if (missing.length > 0) {
            prompt += `\n\n还未收集: ${missing.join('、')}。请在合适时机自然询问。`;
          }
        }
      }
    }

    return prompt;
  }

  /**
   * ReAct 流式对话
   */
  async *chatStream(
    messages: AIMessage[],
    conversationId?: string,
    userId?: string
  ): AsyncGenerator<string> {
    const startTime = Date.now();
    console.log(`[ReAct] ━━━ 对话开始 ━━━ conversationId=${conversationId || 'N/A'}`);

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUserMsg?.content || '';
    console.log(`[ReAct] 1️⃣  用户消息: "${userText.slice(0, 50)}${userText.length > 50 ? '...' : ''}"`);

    // 工作流匹配
    const wfStart = Date.now();
    const matchedWorkflow = await this.workflowService.matchWorkflow(userText);
    const wfMs = Date.now() - wfStart;

    if (matchedWorkflow) {
      console.log(`[ReAct] 🔄 工作流匹配: ${matchedWorkflow.icon}${matchedWorkflow.name} [mode=${matchedWorkflow.mode}] (${wfMs}ms)`);
      yield `data: ${JSON.stringify({
        type: 'workflow_match',
        workflowId: matchedWorkflow.id,
        workflowName: matchedWorkflow.name,
        workflowIcon: matchedWorkflow.icon,
        workflowMode: matchedWorkflow.mode,
        timeMs: wfMs,
      })}\n\n`;

      const actionContext: ActionContext = { conversationId, userId };
      let workflowContent = '';

      for await (const event of this.workflowService.executeWorkflow(
        matchedWorkflow, userText, this.actions, actionContext
      )) {
        yield event;
        try {
          const line = event.replace(/^data:\s*/, '').trim();
          if (line) {
            const parsed = JSON.parse(line);
            if (parsed.type === 'content' && parsed.content) {
              workflowContent += parsed.content;
            }
          }
        } catch { /* ignore */ }
      }

      if (matchedWorkflow.mode === 'independent') {
        if (!workflowContent) {
          const summary = `[工作流 "${matchedWorkflow.name}" 已执行完成]`;
          yield `data: ${JSON.stringify({ type: 'content', content: summary })}\n\n`;
        }
        const totalMs = Date.now() - startTime;
        console.log(`[ReAct] ━━━ 独立工作流结束 ━━━ 总耗时 ${totalMs}ms`);
        yield 'data: [DONE]\n\n';
        return;
      }

      if (workflowContent) {
        console.log(`[ReAct] 🔄 replace_input: 工作流输出替代用户消息 → "${workflowContent.slice(0, 60)}..."`);
        yield `data: ${JSON.stringify({
          type: 'workflow_output',
          content: workflowContent,
          mode: 'replace_input',
        })}\n\n`;
        const idx = messages.length - 1 - [...messages].reverse().findIndex(m => m.role === 'user');
        if (idx >= 0) {
          messages[idx] = { ...messages[idx], content: workflowContent };
        }
      }
    } else {
      console.log(`[ReAct] 🔄 工作流匹配: 无命中 (${wfMs}ms)`);
    }

    // 加载 Skill Tool（用户自定义工具）
    const allSkills = await this.skillService.getAllEnabled();
    const mergedActions = new Map(this.actions);
    if (allSkills.length > 0) {
      const skillActions = this.skillToolBridge.toActions(allSkills, this.llmClient);
      for (const [k, v] of skillActions) mergedActions.set(k, v);
      console.log(`[ReAct] 🔧 加载 ${allSkills.length} 个 Skill Tool: ${allSkills.map(s => s.name).join(', ')}`);
    }

    const systemPrompt = await this.buildSystemPrompt(conversationId);

    const fullMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const actionContext: ActionContext = { conversationId, userId };

    for (let round = 0; round < MAX_REACT_ROUNDS; round++) {
      console.log(`[ReAct] 3️⃣  Round ${round + 1} — 调用 LLM...`);
      const thinkStart = Date.now();
      const response = await this.llmClient.chat(fullMessages, { tools: this.buildTools(mergedActions), toolChoice: 'auto' });
      const thinkMs = Date.now() - thinkStart;
      const hasToolCalls = !!(response.toolCalls && response.toolCalls.length > 0);

      if (!hasToolCalls) {
        console.log(`[ReAct] 5️⃣  最终回复 (${thinkMs}ms, ${response.content.length} 字)`);
        yield* this.streamFromContent(response.content);
        console.log(`[ReAct] ━━━ 对话结束 ━━━ 总耗时 ${Date.now() - startTime}ms`);
        yield 'data: [DONE]\n\n';
        return;
      }

      console.log(`[ReAct] 4️⃣  思考完成 (${thinkMs}ms) content="${(response.content || '').slice(0, 80)}"`);
      if (response.content) {
        yield `data: ${JSON.stringify({
          type: 'thinking_end',
          round: round + 1,
          content: response.content,
          timeMs: thinkMs,
        })}\n\n`;
      }

      for (const toolCall of response.toolCalls) {
        const funcName = toolCall.function.name;
        let args: any;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        console.log(`[ReAct] 6️⃣  Action: ${funcName}(${JSON.stringify(args).slice(0, 80)})`);
        yield `data: ${JSON.stringify({ type: 'tool_start', tool: funcName, args })}\n\n`;

        const action = mergedActions.get(funcName);
        let toolResult: string;
        const toolStart = Date.now();

        if (action) {
          const result = await action.execute(args, actionContext);
          toolResult = result.output;
          const toolMs = Date.now() - toolStart;
          console.log(`[ReAct] 7️⃣  Observation: ${funcName} → ${toolResult.slice(0, 80)}... (${toolMs}ms)`);
          yield `data: ${JSON.stringify({ type: 'tool_result', tool: funcName, result: result.ssePayload, timeMs: toolMs })}\n\n`;
        } else {
          toolResult = JSON.stringify({ error: `未知工具: ${funcName}` });
          console.log(`[ReAct] ❌  未知工具: ${funcName}`);
          yield `data: ${JSON.stringify({ type: 'tool_result', tool: funcName, result: { error: '未知工具' } })}\n\n`;
        }

        fullMessages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls,
        });
        fullMessages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
        });
      }

      console.log(`[ReAct] 🔄  Round ${round + 1} 完成，进入下一轮...`);
    }

    // 超过最大轮次
    console.log(`[ReAct] ⚠️  达到最大轮次 ${MAX_REACT_ROUNDS}，强制生成回复`);
    yield* this.streamFinalAnswer(fullMessages);
    console.log(`[ReAct] ━━━ 对话结束 ━━━ 总耗时 ${Date.now() - startTime}ms`);
    yield 'data: [DONE]\n\n';
  }

  /** 将已有内容转为流式输出（使用 content_chunk 协议） */
  private async *streamFromContent(content: string): AsyncGenerator<string> {
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (cleanContent) {
      const chunkSize = 10;
      for (let i = 0; i < cleanContent.length; i += chunkSize) {
        yield contentChunkEvent(cleanContent.slice(i, i + chunkSize));
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
  }

  /** 流式调用 AI 生成最终回复（使用 content_chunk 协议） */
  private async *streamFinalAnswer(messages: AIMessage[]): AsyncGenerator<string> {
    try {
      for await (const chunk of this.llmClient.chatStream(messages)) {
        yield contentChunkEvent(chunk);
      }
    } catch {
      yield `data: ${JSON.stringify({ type: 'error', content: 'AI 服务错误' })}\n\n`;
    }
  }
}
