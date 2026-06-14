/**
 * 对话仓储接口 — 领域层定义
 */

import { Conversation } from '../model/conversation.model';
import { Message } from '../model/message.model';

export interface IChatRepository {
  createConversation(title?: string, blueprintId?: string): Promise<Conversation>;
  getConversations(): Promise<Conversation[]>;
  getConversationsByBlueprint(blueprintId: string): Promise<Conversation[]>;
  getConversationById(id: string): Promise<Conversation | undefined>;
  getMessages(conversationId: string): Promise<Message[]>;
  addMessage(
    conversationId: string,
    role: Message['role'],
    content: string,
    toolCalls?: any[],
    toolCallId?: string,
  ): Promise<Message>;
  saveTraceSteps(conversationId: string, role: string, traceSteps: any[]): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  updateTitle(conversationId: string, title: string): Promise<void>;
}
