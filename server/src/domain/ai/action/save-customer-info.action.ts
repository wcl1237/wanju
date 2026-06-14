import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { CustomerService } from '../../customer/service/customer.service';
import { MemoryStoreService } from '../../customer/service/memory-store.service';
import { Action, ActionDefinition, ActionResult, ActionContext } from './action.interface';

@Provide('action:save_customer_info')
@Scope(ScopeEnum.Singleton)
export class SaveCustomerInfoAction implements Action {
  @Inject()
  customerService: CustomerService;

  @Inject()
  memoryStore: MemoryStoreService;

  definition(): ActionDefinition {
    return {
      name: 'save_customer_info',
      description: '当你在对话中收集到用户的个人信息时，调用此工具保存。信息会同时保存到当前对话和用户的长期记忆中（跨对话可用）。可以分多次调用，每次保存已获得的字段，系统会自动合并。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '用户姓名/称呼' },
          phone: { type: 'string', description: '手机号/电话号码' },
          email: { type: 'string', description: '邮箱地址' },
          company: { type: 'string', description: '公司/组织名称' },
          position: { type: 'string', description: '职位/职务' },
          requirement: { type: 'string', description: '用户的核心需求或意向，从对话中提炼总结' },
          extra: { type: 'string', description: '其他补充信息' },
        },
      },
    };
  }

  async execute(args: any, context: ActionContext): Promise<ActionResult> {
    const profile = await this.customerService.saveOrUpdate({
      conversationId: context.conversationId,
      name: args.name,
      phone: args.phone,
      email: args.email,
      company: args.company,
      position: args.position,
      requirement: args.requirement,
      extra: args.extra,
    });

    if (context.userId) {
      const memoryParts: string[] = [];
      if (args.name) memoryParts.push(`用户姓名: ${args.name}`);
      if (args.phone) memoryParts.push(`手机号: ${args.phone}`);
      if (args.email) memoryParts.push(`邮箱: ${args.email}`);
      if (args.company) memoryParts.push(`公司: ${args.company}`);
      if (args.position) memoryParts.push(`职位: ${args.position}`);
      if (args.requirement) memoryParts.push(`需求: ${args.requirement}`);
      if (args.extra) memoryParts.push(`补充: ${args.extra}`);

      if (memoryParts.length > 0) {
        const profileParts = memoryParts.filter(p =>
          p.startsWith('用户姓名') || p.startsWith('手机号') ||
          p.startsWith('邮箱') || p.startsWith('公司') || p.startsWith('职位')
        );
        if (profileParts.length > 0) {
          this.memoryStore.addMemory(
            context.userId, profileParts.join('，'), 'profile'
          ).catch(e => console.error('[SaveCustomerInfo] mem0 profile 写入失败:', e.message));
        }

        if (args.requirement) {
          this.memoryStore.addMemory(
            context.userId, `用户需求: ${args.requirement}`, 'business'
          ).catch(e => console.error('[SaveCustomerInfo] mem0 business 写入失败:', e.message));
        }
      }
    }

    return {
      output: JSON.stringify({
        success: true,
        profileId: profile.id,
        status: profile.status,
        message: profile.status === 'complete'
          ? '用户信息已完整保存（姓名 + 手机号），且已同步到长期记忆'
          : '用户信息已部分保存并同步到长期记忆，继续收集中',
        saved: {
          name: profile.name,
          phone: profile.phone,
          email: profile.email,
          company: profile.company,
          position: profile.position,
          requirement: profile.requirement,
        },
      }),
      ssePayload: {
        status: profile.status,
        saved: {
          name: profile.name,
          phone: profile.phone,
          email: profile.email,
          company: profile.company,
        },
      },
    };
  }
}
