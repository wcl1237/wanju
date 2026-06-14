/**
 * StandaloneRuntime — 从 Agent 池选择一个 Agent 直接对话
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { IAgentRuntime, RuntimeContext } from './runtime.interface';
import { AIMessage, AITool } from '../model/ai.model';
import { StandaloneRuntimeConfig } from '../../blueprint/model/blueprint.model';
import { ILLMClient } from '../port/llm.port';
import { AgentService } from '../../agent/service/agent.service';
import { Action, ActionContext } from '../action/action.interface';
import { CreateTicketAction } from '../action/create-ticket.action';
import { SearchKnowledgeAction } from '../action/search-knowledge.action';
import { SaveCustomerInfoAction } from '../action/save-customer-info.action';

@Provide()
@Scope(ScopeEnum.Singleton)
export class StandaloneRuntime implements IAgentRuntime {
  @Inject('llmClient')
  llmClient: ILLMClient;

  @Inject()
  agentService: AgentService;

  @Inject('action:create_ticket')
  createTicketAction: CreateTicketAction;

  @Inject('action:search_knowledge')
  searchKnowledgeAction: SearchKnowledgeAction;

  @Inject('action:save_customer_info')
  saveCustomerInfoAction: SaveCustomerInfoAction;

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
    const config = context.config as StandaloneRuntimeConfig;

    const agent = await this.agentService.getById(config.agentId);
    if (!agent) {
      yield `data: ${JSON.stringify({ type: 'content', content: 'Agent 不存在' })}\n\n`;
      yield 'data: [DONE]\n\n';
      return;
    }

    // 构建可用工具
    const enabledActions = new Map<string, Action>();
    for (const name of config.actions) {
      const action = this.allActions.get(name);
      if (action) enabledActions.set(name, action);
    }

    const tools: AITool[] = [...enabledActions.values()].map(a => ({
      type: 'function' as const,
      function: { name: a.definition().name, description: a.definition().description, parameters: a.definition().parameters },
    }));

    const fullMessages: AIMessage[] = [
      { role: 'system', content: agent.prompt },
      ...messages,
    ];

    const actionContext: ActionContext = { conversationId: context.conversationId, userId: context.userId };
    const MAX_ROUNDS = 5;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await this.llmClient.chat(fullMessages, {
        tools: tools.length > 0 ? tools : undefined,
        toolChoice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.7,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        const clean = (response.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        if (clean) {
          const chunkSize = 10;
          for (let i = 0; i < clean.length; i += chunkSize) {
            yield `data: ${JSON.stringify({ type: 'content', content: clean.slice(i, i + chunkSize) })}\n\n`;
            await new Promise(r => setTimeout(r, 30));
          }
        }
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
        }

        fullMessages.push({ role: 'assistant', content: response.content || '', tool_calls: response.toolCalls });
        fullMessages.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
      }
    }

    yield `data: ${JSON.stringify({ type: 'content', content: 'Agent 已完成处理。' })}\n\n`;
    yield 'data: [DONE]\n\n';
  }
}
