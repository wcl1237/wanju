/**
 * ActionRegistry — 集中管理所有 Action 的注册与查询
 *
 * 消除 ReactRuntime / StandaloneRuntime / WorkflowRuntime / HarnessRuntime
 * 中重复的 @Inject Action + allActions() getter 代码。
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { Action } from './action.interface';
import { CreateTicketAction } from './create-ticket.action';
import { SearchKnowledgeAction } from './search-knowledge.action';
import { SaveCustomerInfoAction } from './save-customer-info.action';

@Provide()
@Scope(ScopeEnum.Singleton)
export class ActionRegistry {
  @Inject('action:create_ticket')
  private createTicketAction: CreateTicketAction;

  @Inject('action:search_knowledge')
  private searchKnowledgeAction: SearchKnowledgeAction;

  @Inject('action:save_customer_info')
  private saveCustomerInfoAction: SaveCustomerInfoAction;

  /** 获取所有已注册的 Action */
  getAll(): Map<string, Action> {
    const map = new Map<string, Action>();
    map.set('create_ticket', this.createTicketAction);
    map.set('search_knowledge', this.searchKnowledgeAction);
    map.set('save_customer_info', this.saveCustomerInfoAction);
    return map;
  }

  /** 根据名称列表获取启用的 Action 子集 */
  getEnabled(names: string[]): Map<string, Action> {
    const all = this.getAll();
    const enabled = new Map<string, Action>();
    for (const name of names) {
      const action = all.get(name);
      if (action) enabled.set(name, action);
    }
    return enabled;
  }
}
