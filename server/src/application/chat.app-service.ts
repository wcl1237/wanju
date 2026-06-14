/**
 * 对话应用服务 — 编排对话相关的跨域用例
 *
 * 位于 Controller 和 Domain Service 之间，负责编排对话流程。
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { ChatService } from '../domain/chat/service/chat.service';
import { ReactAgentService } from '../domain/ai/service/react-agent.service';
import { MemoryManagerService } from '../domain/chat/service/memory-manager.service';
import { AIMessage } from '../domain/ai/model/ai.model';
import { Conversation } from '../domain/chat/model/conversation.model';
import { Message } from '../domain/chat/model/message.model';

@Provide()
@Scope(ScopeEnum.Singleton)
export class ChatAppService {
  @Inject()
  chatService: ChatService;

  @Inject()
  aiService: ReactAgentService;

  @Inject()
  memoryManager: MemoryManagerService;

  async createConversation(): Promise<Conversation> {
    return this.chatService.createConversation();
  }

  async getConversations(): Promise<Conversation[]> {
    return this.chatService.getConversations();
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return this.chatService.getMessages(conversationId);
  }

  async getHistory(conversationId: string, page: number, pageSize: number) {
    return this.memoryManager.getHistory(conversationId, page, pageSize);
  }

  /**
   * 发送消息 — 编排完整的对话流程
   *
   * 返回 { traceSteps, stream } 供 Controller 使用
   */
  async sendMessage(
    conversationId: string,
    message: string,
    userId?: string,
  ): Promise<{
    traceSteps: any[];
    aiContext: AIMessage[];
    stream: AsyncGenerator<string>;
  }> {
    const traceSteps: any[] = [];

    // 1. 初始化对话 + 保存用户消息
    const initStart = Date.now();
    await this.memoryManager.initConversation(conversationId);
    traceSteps.push({ type: 'memory_init', timeMs: Date.now() - initStart, ts: Date.now() });

    const addStart = Date.now();
    await this.memoryManager.addMessage(conversationId, 'user', message);
    traceSteps.push({ type: 'message_save', timeMs: Date.now() - addStart, ts: Date.now() });

    // 2. 获取 AI 上下文
    const ctxStart = Date.now();
    const { messages: aiContext, meta: memoryMeta } = await this.memoryManager.getAIContext(conversationId, userId);
    traceSteps.push({ type: 'memory_load', timeMs: Date.now() - ctxStart, meta: memoryMeta, ts: Date.now() });

    // 3. 创建 AI 流
    const stream = this.aiService.chatStream(aiContext, conversationId, userId);

    return { traceSteps, aiContext, stream };
  }

  async saveAssistantMessage(conversationId: string, content: string): Promise<void> {
    if (content) {
      await this.memoryManager.addMessage(conversationId, 'assistant', content);
    }
  }

  async saveTraceSteps(conversationId: string, traceSteps: any[]): Promise<void> {
    if (traceSteps.length > 0) {
      await this.chatService.saveTraceSteps(conversationId, 'assistant', traceSteps);
    }
  }

  async postProcess(conversationId: string, userId?: string): Promise<void> {
    await this.memoryManager.checkAndSummarize(conversationId);

    if (userId) {
      this.memoryManager.extractLongTermMemory(userId, conversationId).catch(e => {
        console.error('[ChatAppService] 长期记忆提取失败:', e.message);
      });
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.chatService.deleteConversation(conversationId);
  }
}
