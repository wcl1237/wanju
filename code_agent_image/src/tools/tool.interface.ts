/**
 * Tool System — 工具接口定义
 *
 * 参考 Claude Code 的 Tool 接口设计，每个工具独立目录、可插拔注册。
 * 工具由 Agent Core 的 QueryEngine 在 LLM tool_call 时调用。
 */

// ─── Tool 接口 ───────────────────────────────────────────────

/** 工具执行上下文，由 QueryEngine 注入 */
export interface ToolContext {
  /** 当前工作目录 */
  workingDir: string;
  /** 中断信号 */
  abortSignal: AbortSignal;
  /** 进度回调 — 发送实时进度到客户端 */
  onProgress?: (message: string) => void;
  /** 请求用户决策 — 阻塞直到用户响应 */
  requestDecision: (req: DecisionRequest) => Promise<DecisionResponse>;
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  /** 返回给 LLM 的文本内容 */
  output: string;
  /** 产生的文件列表（通知客户端） */
  artifacts?: FileArtifact[];
  /** 副作用描述 */
  sideEffects?: string[];
}

export interface FileArtifact {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  size?: number;
}

/** JSON Schema 格式的工具参数定义 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    default?: unknown;
  }>;
  required?: string[];
}

/** 工具接口 — 所有工具必须实现 */
export interface Tool {
  /** 工具名称（唯一标识，LLM 使用该名称调用） */
  readonly name: string;
  /** 工具描述（LLM 用于理解工具用途） */
  readonly description: string;
  /** 参数 JSON Schema */
  readonly inputSchema: ToolInputSchema;

  /** 执行工具 */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;

  /** 是否为只读操作（默认 false） */
  isReadOnly?(args: Record<string, unknown>): boolean;
  /** 是否为破坏性操作（需要用户确认，默认 false） */
  isDestructive?(args: Record<string, unknown>): boolean;
  /** 参数校验 */
  validate?(args: Record<string, unknown>): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

// ─── LLM Function Calling 格式 ──────────────────────────────

/** 转换为 OpenAI Function Calling 格式 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolInputSchema;
  };
}

/** LLM 返回的 tool_call */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ─── Decision 类型 ──────────────────────────────────────────

export interface DecisionRequest {
  id: string;
  question: string;
  context: string;
  options?: string[];
  timeout?: number;
  defaultChoice?: string;
  priority: 'blocking' | 'advisory';
}

export interface DecisionResponse {
  decisionId: string;
  choice: string;
  data?: unknown;
}
