/**
 * IAgentRuntime — 智能体运行时接口
 *
 * 所有运行时类型（ReAct/Workflow/Harness/Standalone）实现此接口。
 * RuntimeFactory 根据 Blueprint 的 runtimeType 创建对应实现。
 */

import { AIMessage } from '../model/ai.model';
import { RuntimeConfig } from '../../blueprint/model/blueprint.model';

/** 运行时上下文 */
export interface RuntimeContext {
  blueprintId: string;
  conversationId?: string;
  userId?: string;
  config: RuntimeConfig;
}

/** 运行时接口 */
export interface IAgentRuntime {
  /** 流式执行对话，返回 SSE 事件 */
  execute(
    messages: AIMessage[],
    context: RuntimeContext,
  ): AsyncGenerator<string>;
}
