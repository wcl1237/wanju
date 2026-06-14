/**
 * WorkflowRuntime — 直接执行绑定的工作流
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { IAgentRuntime, RuntimeContext } from './runtime.interface';
import { AIMessage } from '../model/ai.model';
import { WorkflowRuntimeConfig } from '../../blueprint/model/blueprint.model';
import { WorkflowService } from '../../workflow/service/workflow.service';
import { Action, ActionContext } from '../action/action.interface';
import { CreateTicketAction } from '../action/create-ticket.action';
import { SearchKnowledgeAction } from '../action/search-knowledge.action';
import { SaveCustomerInfoAction } from '../action/save-customer-info.action';
import { ILLMClient } from '../port/llm.port';

@Provide()
@Scope(ScopeEnum.Singleton)
export class WorkflowRuntime implements IAgentRuntime {
  @Inject()
  workflowService: WorkflowService;

  @Inject('llmClient')
  llmClient: ILLMClient;

  @Inject('action:create_ticket')
  createTicketAction: CreateTicketAction;

  @Inject('action:search_knowledge')
  searchKnowledgeAction: SearchKnowledgeAction;

  @Inject('action:save_customer_info')
  saveCustomerInfoAction: SaveCustomerInfoAction;

  private get actions(): Map<string, Action> {
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
    const config = context.config as WorkflowRuntimeConfig;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUserMsg?.content || '';

    const workflow = await this.workflowService.getById(config.workflowId);
    if (!workflow) {
      yield `data: ${JSON.stringify({ type: 'content', content: config.fallbackPrompt || '工作流不存在' })}\n\n`;
      yield 'data: [DONE]\n\n';
      return;
    }

    yield `data: ${JSON.stringify({
      type: 'workflow_match',
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowIcon: workflow.icon,
    })}\n\n`;

    const actionContext: ActionContext = { conversationId: context.conversationId, userId: context.userId };

    for await (const event of this.workflowService.executeWorkflow(
      workflow, userText, this.actions, actionContext
    )) {
      yield event;
    }

    yield 'data: [DONE]\n\n';
  }
}
