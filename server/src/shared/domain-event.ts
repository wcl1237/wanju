/**
 * 领域事件总线 — 解耦跨域副作用
 *
 * 使用同步发布-订阅模式，领域服务发布事件，其他服务订阅并处理。
 * 例如：工作流执行完成 → 通知记忆系统记录
 */

export interface DomainEvent {
  /** 事件类型 */
  type: string;
  /** 事件数据 */
  payload: any;
  /** 事件时间 */
  timestamp: number;
}

type EventHandler = (event: DomainEvent) => void | Promise<void>;

class DomainEventBusImpl {
  private handlers = new Map<string, EventHandler[]>();

  /**
   * 订阅事件
   */
  on(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  /**
   * 取消订阅
   */
  off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  }

  /**
   * 发布事件（异步执行所有 handler，不阻塞主流程）
   */
  async emit(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (e: any) {
        console.error(`[DomainEventBus] Handler error for "${event.type}":`, e.message);
      }
    }
  }

  /**
   * 发布事件（fire-and-forget，不等待 handler 完成）
   */
  fire(eventType: string, payload: any): void {
    const event: DomainEvent = {
      type: eventType,
      payload,
      timestamp: Date.now(),
    };
    this.emit(event).catch(e => {
      console.error(`[DomainEventBus] Unhandled error:`, e);
    });
  }
}

/** 全局单例领域事件总线 */
export const DomainEventBus = new DomainEventBusImpl();

// ==================== 预定义事件类型 ====================

export const DOMAIN_EVENTS = {
  WORKFLOW_EXECUTED: 'workflow.executed',
  WORKFLOW_MATCHED: 'workflow.matched',
  AGENT_INVOKED: 'agent.invoked',
  TICKET_CREATED: 'ticket.created',
  KNOWLEDGE_SEARCHED: 'knowledge.searched',
} as const;
