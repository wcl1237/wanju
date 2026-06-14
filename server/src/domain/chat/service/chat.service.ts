import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { IChatRepository } from '../port/chat.repository';
import { Conversation } from '../model/conversation.model';
import { Message } from '../model/message.model';

@Provide()
@Scope(ScopeEnum.Singleton)
export class ChatService {
  @Inject('chatRepository')
  chatRepo: IChatRepository;

  createConversation(title = '新对话', blueprintId = ''): Promise<Conversation> {
    return this.chatRepo.createConversation(title, blueprintId);
  }

  async getConversations(): Promise<Conversation[]> {
    return this.chatRepo.getConversations();
  }

  async getConversationsByBlueprint(blueprintId: string): Promise<Conversation[]> {
    return this.chatRepo.getConversationsByBlueprint(blueprintId);
  }

  async getConversationById(id: string): Promise<Conversation | undefined> {
    return this.chatRepo.getConversationById(id);
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return this.chatRepo.getMessages(conversationId);
  }

  async addMessage(
    conversationId: string, role: Message['role'], content: string,
    toolCalls?: any[], toolCallId?: string
  ): Promise<Message> {
    return this.chatRepo.addMessage(conversationId, role, content, toolCalls, toolCallId);
  }

  async saveTraceSteps(conversationId: string, role: string, traceSteps: any[]): Promise<void> {
    return this.chatRepo.saveTraceSteps(conversationId, role, traceSteps);
  }

  async deleteConversation(conversationId: string) {
    return this.chatRepo.deleteConversation(conversationId);
  }

  async updateTitle(conversationId: string, title: string) {
    return this.chatRepo.updateTitle(conversationId, title);
  }
}
