import { Provide, Inject, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { CustomerService } from './customer.service';
import { SkillService } from './skill.service';
import { WorkflowService } from './workflow.service';
import { AIConfig, AIMessage, AITool } from '../interface';
import { Action, ActionContext } from '../action/base.action';
import { CreateTicketAction } from '../action/create-ticket.action';
import { SearchKnowledgeAction } from '../action/search-knowledge.action';
import { SaveCustomerInfoAction } from '../action/save-customer-info.action';

const MAX_REACT_ROUNDS = 10;

/**
 * AI 对话服务 — ReAct 核心
 *
 * ReAct 循环: Thought → Action → Observation → Thought → ... → Final Answer
 * 支持多轮工具调用，直到 AI 决定给出最终回答
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class AIService {
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
  private getTools(): AITool[] {
    return [...this.actions.values()].map(action => ({
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
    matchedSkills: { name: string; prompt: string; icon: string }[] = [],
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

    // 注入命中技能的 Prompt
    if (matchedSkills.length > 0) {
      prompt += `\n\n## 已激活技能`;
      for (const skill of matchedSkills) {
        prompt += `\n\n### ${skill.icon} ${skill.name}\n${skill.prompt}`;
      }
      prompt += `\n\n请严格按照以上激活的技能指引来回答用户的问题。如果技能指引中要求调用某个工具（如 create_ticket、search_knowledge 等），你必须实际调用该工具，而不是只口头描述流程。`;
    }

    return prompt;
  }

  /**
   * ReAct 流式对话
   *
   * 循环: callLLM → hasToolCalls?
   *   YES → executeActions → yield SSE → append observation → continue
   *   NO  → stream final answer → break
   */
  async *chatStream(
    messages: AIMessage[],
    conversationId?: string,
    userId?: string
  ): AsyncGenerator<string> {
    const startTime = Date.now();
    console.log(`[ReAct] ━━━ 对话开始 ━━━ conversationId=${conversationId || 'N/A'}`);

    // 提取用户最后一条消息用于技能匹配
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUserMsg?.content || '';
    console.log(`[ReAct] 1️⃣  用户消息: "${userText.slice(0, 50)}${userText.length > 50 ? '...' : ''}"`);

    // ====== 工作流匹配（最优先） ======
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

      // 执行工作流引擎
      const actionContext: ActionContext = { conversationId, userId };
      let workflowContent = '';

      for await (const event of this.workflowService.executeWorkflow(
        matchedWorkflow, userText, this.actions, actionContext
      )) {
        yield event;
        // 收集 content 类型的输出（用于 replace_input 模式）
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
        // 独立工作流：工作流返回即全部返回
        // 如果工作流没有产生任何 content 输出，生成一条默认摘要保存到记忆
        if (!workflowContent) {
          const summary = `[工作流 "${matchedWorkflow.name}" 已执行完成]`;
          yield `data: ${JSON.stringify({ type: 'content', content: summary })}\n\n`;
        }
        const totalMs = Date.now() - startTime;
        console.log(`[ReAct] ━━━ 独立工作流结束 ━━━ 总耗时 ${totalMs}ms`);
        yield 'data: [DONE]\n\n';
        return;
      }

      // replace_input 模式：工作流输出替代用户输入，继续 ReAct
      if (workflowContent) {
        console.log(`[ReAct] 🔄 replace_input: 工作流输出替代用户消息 → "${workflowContent.slice(0, 60)}..."`);
        // 发出工作流输出事件，让前端轨迹可以记录
        yield `data: ${JSON.stringify({
          type: 'workflow_output',
          content: workflowContent,
          mode: 'replace_input',
        })}\n\n`;
        // 替换 messages 中最后一条用户消息
        const idx = messages.length - 1 - [...messages].reverse().findIndex(m => m.role === 'user');
        if (idx >= 0) {
          messages[idx] = { ...messages[idx], content: workflowContent };
        }
      }
      // 继续走下面的 ReAct 流程（使用替换后的 messages）
    } else {
      console.log(`[ReAct] 🔄 工作流匹配: 无命中 (${wfMs}ms)`);
    }

    // 匹配技能
    const skillStart = Date.now();
    const matchedSkills = await this.skillService.matchByText(userText);
    const skillMs = Date.now() - skillStart;
    if (matchedSkills.length > 0) {
      console.log(`[ReAct] 2️⃣  技能匹配: ${matchedSkills.map(s => `${s.icon}${s.name}`).join(', ')} (${skillMs}ms)`);
    } else {
      console.log(`[ReAct] 2️⃣  技能匹配: 无命中 (${skillMs}ms)`);
    }

    // 构建系统提示词（含技能 Prompt）
    const systemPrompt = await this.buildSystemPrompt(conversationId, matchedSkills);

    // 通知前端命中了哪些技能
    if (matchedSkills.length > 0) {
      yield `data: ${JSON.stringify({
        type: 'skill_match',
        skills: matchedSkills.map(s => ({ id: s.id, name: s.name, icon: s.icon })),
      })}\n\n`;
    }

    const fullMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const actionContext: ActionContext = { conversationId, userId };

    for (let round = 0; round < MAX_REACT_ROUNDS; round++) {
      console.log(`[ReAct] 3️⃣  Round ${round + 1} — 调用 LLM...`);
      const thinkStart = Date.now();
      const response = await this.callAI(fullMessages, true);
      const thinkMs = Date.now() - thinkStart;
      const hasToolCalls = !!(response.toolCalls && response.toolCalls.length > 0);

      if (!hasToolCalls) {
        // ── Final Answer — 无工具调用，直接输出最终回复，不记录思考 ──
        console.log(`[ReAct] 5️⃣  最终回复 (${thinkMs}ms, ${response.content.length} 字)`);
        yield* this.streamFromContent(response.content);
        console.log(`[ReAct] ━━━ 对话结束 ━━━ 总耗时 ${Date.now() - startTime}ms`);
        yield 'data: [DONE]\n\n';
        return;
      }

      // ── 有工具调用 — 记录思考过程（仅有内容时） ──
      console.log(`[ReAct] 4️⃣  思考完成 (${thinkMs}ms) content="${(response.content || '').slice(0, 80)}"`);
      if (response.content) {
        yield `data: ${JSON.stringify({
          type: 'thinking_end',
          round: round + 1,
          content: response.content,
          timeMs: thinkMs,
        })}\n\n`;
      }

      // Action + Observation: 执行所有工具调用
      for (const toolCall of response.toolCalls) {
        const funcName = toolCall.function.name;
        let args: any;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        console.log(`[ReAct] 6️⃣  Action: ${funcName}(${JSON.stringify(args).slice(0, 80)})`);
        // SSE: 通知前端 action 开始
        yield `data: ${JSON.stringify({ type: 'tool_start', tool: funcName, args })}\n\n`;

        // 查找并执行 Action
        const action = this.actions.get(funcName);
        let toolResult: string;
        const toolStart = Date.now();

        if (action) {
          const result = await action.execute(args, actionContext);
          toolResult = result.output;
          const toolMs = Date.now() - toolStart;
          console.log(`[ReAct] 7️⃣  Observation: ${funcName} → ${toolResult.slice(0, 80)}... (${toolMs}ms)`);
          // SSE: 通知前端 action 结果（含耗时）
          yield `data: ${JSON.stringify({ type: 'tool_result', tool: funcName, result: result.ssePayload, timeMs: toolMs })}\n\n`;
        } else {
          toolResult = JSON.stringify({ error: `未知工具: ${funcName}` });
          console.log(`[ReAct] ❌  未知工具: ${funcName}`);
          yield `data: ${JSON.stringify({ type: 'tool_result', tool: funcName, result: { error: '未知工具' } })}\n\n`;
        }

        // Observation: 将 action 结果追加到消息历史
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
      // 继续下一轮 ReAct — LLM 会看到 observation 后决定下一步
    }

    // 超过最大轮次，强制生成最终回复（不带工具）
    console.log(`[ReAct] ⚠️  达到最大轮次 ${MAX_REACT_ROUNDS}，强制生成回复`);
    yield* this.streamAIResponse(fullMessages);
    console.log(`[ReAct] ━━━ 对话结束 ━━━ 总耗时 ${Date.now() - startTime}ms`);
    yield 'data: [DONE]\n\n';
  }

  /** 调用 AI API（非流式，用于 ReAct 判断） */
  private async callAI(
    messages: AIMessage[],
    withTools: boolean
  ): Promise<{ content: string; toolCalls?: any[] }> {
    const body: any = {
      model: this.aiConfig.model,
      messages: messages.map(m => {
        const msg: any = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
    };

    if (withTools) {
      body.tools = this.getTools();
      body.tool_choice = 'auto';
    }

    // 打印发送给 LLM 的完整 prompt
    console.log(`[LLM Request] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(JSON.stringify({
      model: body.model,
      messages: body.messages,
      tools: body.tools ? body.tools.map((t: any) => t.function?.name) : null,
      tool_choice: body.tool_choice || null,
    }, null, 2));
    console.log(`[LLM Request] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const response = await fetch(`${this.aiConfig.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.aiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const msg = choice.message;

    // 完整打印 LLM 返回（原始结构）
    console.log(`[LLM Response] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(JSON.stringify({
      finish_reason: choice.finish_reason,
      message: {
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls || null,
      },
      usage: data.usage || null,
    }, null, 2));
    console.log(`[LLM Response] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return {
      content: msg.content || '',
      toolCalls: msg.tool_calls,
    };
  }

  /** 流式调用 AI API */
  private async *streamAIResponse(messages: AIMessage[]): AsyncGenerator<string> {
    const body = {
      model: this.aiConfig.model,
      messages: messages.map(m => {
        const msg: any = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
      stream: true,
    };

    const response = await fetch(`${this.aiConfig.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.aiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      yield `data: ${JSON.stringify({ type: 'error', content: `AI 服务错误: ${response.status}` })}\n\n`;
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            const content = delta.content.replace(/<think>[\s\S]*?<\/think>/g, '');
            if (content) {
              yield `data: ${JSON.stringify({ type: 'content', content })}\n\n`;
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  /** 将已有内容转为流式输出 */
  private async *streamFromContent(content: string): AsyncGenerator<string> {
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (cleanContent) {
      const chunkSize = 10;
      for (let i = 0; i < cleanContent.length; i += chunkSize) {
        const chunk = cleanContent.slice(i, i + chunkSize);
        yield `data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`;
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
  }
}
