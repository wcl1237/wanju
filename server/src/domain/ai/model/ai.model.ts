/**
 * AI 智能域 — 类型定义
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface AIConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  embeddingApiBase: string;
  embeddingModel: string;
  systemPrompt: string;
}

export interface ChatRequest {
  message: string;
}

/** LLM 非流式调用结果 */
export interface LLMChatResult {
  content: string;
  toolCalls?: ToolCall[];
}
