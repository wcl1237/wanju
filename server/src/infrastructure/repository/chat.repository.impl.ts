/**
 * 对话仓储实现 — TypeORM
 */

import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ConversationEntity } from '../../domain/chat/entity/conversation.entity';
import { MessageEntity } from '../../domain/chat/entity/message.entity';
import { Conversation } from '../../domain/chat/model/conversation.model';
import { Message } from '../../domain/chat/model/message.model';
import { IChatRepository } from '../../domain/chat/port/chat.repository';

@Provide('chatRepository')
@Scope(ScopeEnum.Singleton)
export class TypeOrmChatRepository implements IChatRepository {
  @InjectEntityModel(ConversationEntity)
  conversationRepo: Repository<ConversationEntity>;

  @InjectEntityModel(MessageEntity)
  messageRepo: Repository<MessageEntity>;

  async createConversation(title = '新对话'): Promise<Conversation> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const entity = this.conversationRepo.create({ id, title, createdAt: now, updatedAt: now });
    await this.conversationRepo.save(entity);
    return { id, title, createdAt: now, updatedAt: now };
  }

  async getConversations(): Promise<Conversation[]> {
    const rows = await this.conversationRepo.find({ order: { updatedAt: 'DESC' } });
    return rows.map(r => ({ id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt }));
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const rows = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return rows.map(r => ({
      id: r.id, conversationId: r.conversationId,
      role: r.role as Message['role'], content: r.content,
      toolCalls: r.toolCalls ? JSON.parse(r.toolCalls) : undefined,
      toolCallId: r.toolCallId || undefined,
      traceSteps: r.traceSteps ? JSON.parse(r.traceSteps) : undefined,
      createdAt: r.createdAt,
    }));
  }

  async addMessage(
    conversationId: string, role: Message['role'], content: string,
    toolCalls?: any[], toolCallId?: string
  ): Promise<Message> {
    const id = uuidv4();
    const now = new Date().toISOString();
    await this.messageRepo.save({
      id, conversationId, role, content,
      toolCalls: toolCalls ? JSON.stringify(toolCalls) : null,
      toolCallId: toolCallId || null, traceSteps: null, createdAt: now,
    });
    await this.conversationRepo.update(conversationId, { updatedAt: now });
    const msgCount = await this.messageRepo.count({ where: { conversationId, role: 'user' } });
    if (msgCount === 1 && role === 'user') {
      const title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
      await this.conversationRepo.update(conversationId, { title });
    }
    return { id, conversationId, role, content, toolCalls, toolCallId, createdAt: now };
  }

  async saveTraceSteps(conversationId: string, role: string, traceSteps: any[]): Promise<void> {
    const lastMsg = await this.messageRepo.findOne({
      where: { conversationId, role },
      order: { createdAt: 'DESC' },
    });
    if (lastMsg) {
      lastMsg.traceSteps = JSON.stringify(traceSteps);
      await this.messageRepo.save(lastMsg);
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.messageRepo.delete({ conversationId });
    await this.conversationRepo.delete(conversationId);
  }

  async updateTitle(conversationId: string, title: string): Promise<void> {
    await this.conversationRepo.update(conversationId, { title, updatedAt: new Date().toISOString() });
  }
}
