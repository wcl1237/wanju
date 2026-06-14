/**
 * Action 基础接口 — ReAct 框架的 Action 层
 * 每个 Action 对应一个 AI 可调用的工具
 */

export interface ActionContext {
  conversationId?: string;
  userId?: string;
}

export interface ActionResult {
  /** 返回给 LLM 的文本结果 */
  output: string;
  /** 发送给前端的 SSE 事件数据 */
  ssePayload?: any;
}

export interface ActionDefinition {
  /** 工具名（唯一标识，对应 function calling 的 name） */
  name: string;
  /** 工具描述（给 LLM 看的） */
  description: string;
  /** JSON Schema 参数定义 */
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface Action {
  /** 返回工具定义（用于构建 tools 列表） */
  definition(): ActionDefinition;
  /** 执行工具 */
  execute(args: any, context: ActionContext): Promise<ActionResult>;
}
