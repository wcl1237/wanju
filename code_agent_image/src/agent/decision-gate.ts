/**
 * DecisionGate — 人机决策点管理
 *
 * 当 Agent 或工作流需要用户做出决策时，DecisionGate 负责：
 * 1. 通过 WebSocket 向客户端发送决策请求
 * 2. 阻塞执行直到收到用户响应（或超时）
 * 3. 返回用户的决策结果
 */
import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { v4 as uuidv4 } from 'uuid';
import { DecisionRequest, DecisionResponse } from '../tools/tool.interface';
import { AgentMessage } from './types';

/** 待决策项（内部） */
interface PendingDecision {
  request: DecisionRequest;
  resolve: (response: DecisionResponse) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

@Provide()
@Scope(ScopeEnum.Request)
export class DecisionGate {
  /** 待处理的决策请求 */
  private pending: Map<string, PendingDecision> = new Map();

  /** WebSocket 消息发送回调 — 由 Controller 层注入 */
  private sendMessage: ((msg: AgentMessage) => void) | null = null;

  /** 设置消息发送器 */
  setSender(sender: (msg: AgentMessage) => void): void {
    this.sendMessage = sender;
  }

  /**
   * 请求用户决策
   *
   * 向客户端发送决策请求，阻塞直到收到响应或超时。
   * Agent 的工具（如 RequestDecisionTool、BashTool 的破坏性确认）通过此方法与用户交互。
   */
  async requestDecision(params: Omit<DecisionRequest, 'id'> & { id?: string }): Promise<DecisionResponse> {
    const request: DecisionRequest = {
      id: params.id || uuidv4(),
      ...params,
    };

    return new Promise<DecisionResponse>((resolve, reject) => {
      const pending: PendingDecision = { request, resolve, reject };

      // 设置超时
      if (request.timeout && request.timeout > 0) {
        pending.timer = setTimeout(() => {
          this.pending.delete(request.id);
          if (request.defaultChoice) {
            resolve({
              decisionId: request.id,
              choice: request.defaultChoice,
            });
          } else {
            reject(new Error(`决策超时 (${request.timeout}ms): ${request.question}`));
          }
        }, request.timeout);
      }

      this.pending.set(request.id, pending);

      // 通过 WebSocket 发送决策请求到客户端
      if (this.sendMessage) {
        this.sendMessage({
          type: 'decision.required',
          decisionId: request.id,
          question: request.question,
          options: request.options,
          context: request.context,
          timeout: request.timeout,
        });
      }
    });
  }

  /**
   * 提交用户决策（由 WebSocket 消息处理器调用）
   */
  submitDecision(decisionId: string, choice: string, data?: unknown): boolean {
    const pending = this.pending.get(decisionId);
    if (!pending) {
      return false;
    }

    // 清除超时
    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    this.pending.delete(decisionId);
    pending.resolve({
      decisionId,
      choice,
      data,
    });

    return true;
  }

  /**
   * 取消所有待决策（如工作流被取消时）
   */
  cancelAll(reason?: string): void {
    for (const [id, pending] of this.pending) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(new Error(reason || '决策已取消'));
    }
    this.pending.clear();
  }

  /** 是否有待处理的决策 */
  hasPending(): boolean {
    return this.pending.size > 0;
  }

  /** 获取所有待决策的 ID */
  getPendingIds(): string[] {
    return Array.from(this.pending.keys());
  }
}
