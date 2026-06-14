/**
 * Chat 对话域 — 消息模型
 */

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
  traceSteps?: any[];
  createdAt: string;
}
