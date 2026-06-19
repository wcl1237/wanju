/**
 * LLM Client — 类型定义
 */

export interface LLMConfig {
  apiKey: string;
  apiBase: string;
  model: string;
}

/** LLM 聊天请求消息 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string }>;
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LLMToolDefinition[];
  stream?: boolean;
}

export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMChatResult {
  content: string;
  toolCalls?: LLMToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'tool_calls' | 'length';
}

/** 流式回调 */
export interface LLMStreamCallbacks {
  onToken?: (token: string) => void;
  onToolCall?: (toolCall: LLMToolCall) => void;
  onComplete?: (result: LLMChatResult) => void;
  onError?: (error: Error) => void;
}
