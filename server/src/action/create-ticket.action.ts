import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { TicketService } from '../service/ticket.service';
import { Action, ActionDefinition, ActionResult, ActionContext } from './base.action';

@Provide('action:create_ticket')
@Scope(ScopeEnum.Singleton)
export class CreateTicketAction implements Action {
  @Inject()
  ticketService: TicketService;

  definition(): ActionDefinition {
    return {
      name: 'create_ticket',
      description: '当用户需要创建工单、反馈问题、提出需求或投诉时，调用此工具创建工单',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '工单标题，简洁描述问题' },
          description: { type: 'string', description: '问题的详细描述' },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: '优先级：low=低, medium=中, high=高, urgent=紧急',
          },
          category: {
            type: 'string',
            enum: ['bug', 'feature', 'question', 'complaint'],
            description: '分类：bug=故障, feature=功能需求, question=咨询, complaint=投诉',
          },
        },
        required: ['title', 'description'],
      },
    };
  }

  async execute(args: any, context: ActionContext): Promise<ActionResult> {
    const ticket = await this.ticketService.createTicket({
      title: args.title || '未命名工单',
      description: args.description || '',
      priority: args.priority || 'medium',
      category: args.category || 'question',
      conversationId: context.conversationId,
    });

    return {
      output: JSON.stringify({
        success: true,
        ticketId: ticket.id,
        ticketNo: ticket.ticketNo,
        title: ticket.title,
        status: ticket.status,
        message: `工单已创建成功，工单编号: ${ticket.ticketNo}`,
      }),
      ssePayload: {
        ticketId: ticket.id,
        ticketNo: ticket.ticketNo,
        title: ticket.title,
      },
    };
  }
}
