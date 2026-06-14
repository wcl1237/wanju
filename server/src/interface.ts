/**
 * 智能客服系统 — TypeScript 类型定义
 */

// ==================== 对话相关 ====================

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  traceSteps?: any[];
  createdAt: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  message: string;
}

// ==================== 工单相关 ====================

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketCategory = 'bug' | 'feature' | 'question' | 'complaint';

export interface Ticket {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  priority: TicketPriority;
  category: TicketCategory;
  status: TicketStatus;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketDTO {
  title: string;
  description: string;
  priority?: TicketPriority;
  category?: TicketCategory;
  conversationId?: string;
}

// ==================== 知识库相关 ====================

export interface KnowledgeDoc {
  id: string;
  name: string;
  content: string;
  chunkCount: number;
  createdAt: string;
}

export interface KnowledgeChunk {
  id: string;
  docId: string;
  content: string;
  embedding?: number[];
}

export interface SearchResult {
  docName: string;
  content: string;
  score: number;
}

// ==================== AI 相关 ====================

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
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

// ==================== 配置相关 ====================

export interface AIConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  embeddingApiBase: string;
  embeddingModel: string;
  systemPrompt: string;
}

export interface KnowledgeConfig {
  docsDir: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
}
