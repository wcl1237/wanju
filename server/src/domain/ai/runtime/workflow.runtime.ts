/**
 * WorkflowRuntime — 直接执行绑定的工作流
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { IAgentRuntime, RuntimeContext } from './runtime.interface';
import { AIMessage } from '../model/ai.model';
import { WorkflowRuntimeConfig } from '../../blueprint/model/blueprint.model';
import { WorkflowService } from '../../workflow/service/workflow.service';
import { ActionContext } from '../action/action.interface';
import { ActionRegistry } from '../action/action-registry';
import { ILLMClient } from '../port/llm.port';

@Provide()
@Scope(ScopeEnum.Singleton)
export class WorkflowRuntime implements IAgentRuntime {
  @Inject()
  workflowService: WorkflowService;

  @Inject('llmClient')
  llmClient: ILLMClient;

  @Inject()
  actionRegistry: ActionRegistry;

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
      workflow, userText, this.actionRegistry.getAll(), actionContext
    )) {
      yield event;
    }

    yield 'data: [DONE]\n\n';
  }
}
