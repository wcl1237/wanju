/**
 * Agent Core — 类型定义
 *
 * Agent 推理引擎的核心类型：消息、对话、LLM 交互。
 */

// ─── 消息类型 ─────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string | MessageContent[];
  /** tool_call 结果时使用 */
  tool_call_id?: string;
  /** assistant 消息中的 tool_calls */
  tool_calls?: import('../tools/tool.interface').ToolCall[];
}

export interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

// ─── 对话 ─────────────────────────────────────────────────

export interface Conversation {
  id: string;
  /** 关联的工作流 ID（可选，独立对话则无） */
  workflowId?: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /** 对话摘要（用于上下文压缩后恢复） */
  summary?: string;
}

// ─── QueryEngine 参数 ─────────────────────────────────────

export interface QueryParams {
  messages: Message[];
  tools: import('../tools/tool.interface').ToolDefinition[];
  systemPrompt: string;
  /** 最大 ReAct 轮次（默认 15） */
  maxTurns?: number;
  /** 工具调用回调 */
  onToolCall?: (tool: string, args: Record<string, unknown>) => void;
  /** 工具结果回调 */
  onToolResult?: (tool: string, result: import('../tools/tool.interface').ToolResult, timeMs: number) => void;
  /** 进度回调 */
  onProgress?: (event: ProgressEvent) => void;
}

export interface QueryResult {
  /** 最终文本回答 */
  finalAnswer: string;
  /** 产生的文件 */
  files: Array<{ path: string; action: string }>;
  /** 总轮次 */
  turns: number;
  /** Token 使用统计 */
  usage: TokenUsage;
  /** 完整消息列表 */
  messages: Message[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ─── 进度事件 ─────────────────────────────────────────────

export interface ProgressEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'streaming' | 'decision';
  message: string;
  data?: Record<string, unknown>;
}

// ─── WebSocket 消息协议 ──────────────────────────────────

/** 客户端 → Agent */
export type ClientMessage =
  | { type: 'chat.message'; content: string; workflowId?: string }
  | { type: 'decision.response'; decisionId: string; choice: string; data?: unknown }
  | { type: 'workflow.cancel'; workflowId: string }
  | { type: 'chat.history.request' }
  | { type: 'ping' };

/** Agent → 客户端 */
export type AgentMessage =
  | { type: 'chat.text'; content: string }
  | { type: 'chat.chunk'; chunk: string }
  | { type: 'chat.stream_start' }
  | { type: 'chat.stream_end' }
  | { type: 'chat.history'; messages: unknown[] }
  | { type: 'workflow.started'; workflowId: string; steps: Array<{ id: string; name: string; type: string }> }
  | { type: 'workflow.resumed'; [key: string]: unknown }
  | { type: 'workflow.step_start'; stepIndex: number; stepType: string; stepName: string }
  | { type: 'workflow.step_end'; stepIndex: number; result: unknown }
  | { type: 'workflow.progress'; percent: number; message: string }
  | { type: 'workflow.completed'; workflowId: string; summary: string }
  | { type: 'workflow.failed'; workflowId: string; error: string }
  | { type: 'decision.required'; decisionId: string; question: string; options?: string[]; context: string; timeout?: number }
  | { type: 'tool.start'; tool: string; args: Record<string, unknown> }
  | { type: 'tool.result'; tool: string; result: unknown; timeMs: number }
  | { type: 'file.created'; path: string; size: number }
  | { type: 'file.modified'; path: string }
  | { type: 'memory.saved'; key: string; summary: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong' };
