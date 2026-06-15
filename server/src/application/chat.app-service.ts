/**
 * 对话应用服务 — 编排对话相关的跨域用例
 *
 * 核心变更：根据对话绑定的 Blueprint 路由到对应的 Runtime 引擎。
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { ChatService } from '../domain/chat/service/chat.service';
import { MemoryManagerService } from '../domain/chat/service/memory-manager.service';
import { BlueprintService } from '../domain/blueprint/service/blueprint.service';
import { RuntimeFactory } from '../domain/ai/runtime/runtime.factory';
import { AIMessage } from '../domain/ai/model/ai.model';
import { Conversation } from '../domain/chat/model/conversation.model';
import { Message } from '../domain/chat/model/message.model';

@Provide()
@Scope(ScopeEnum.Singleton)
export class ChatAppService {
  @Inject()
  chatService: ChatService;

  @Inject()
  blueprintService: BlueprintService;

  @Inject()
  runtimeFactory: RuntimeFactory;

  @Inject()
  memoryManager: MemoryManagerService;

  async createConversation(blueprintId?: string): Promise<Conversation> {
    return this.chatService.createConversation('新对话', blueprintId || '');
  }

  async getConversations(blueprintId?: string): Promise<Conversation[]> {
    if (blueprintId) {
      return this.chatService.getConversationsByBlueprint(blueprintId);
    }
    return this.chatService.getConversations();
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return this.chatService.getMessages(conversationId);
  }

  async getHistory(conversationId: string, page: number, pageSize: number) {
    return this.memoryManager.getHistory(conversationId, page, pageSize);
  }

  /**
   * 发送消息 — 根据 Blueprint 路由到对应 Runtime
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

    // 3. 查找对话绑定的 Blueprint
    const blueprint = await this.resolveBlueprintForConversation(conversationId);

    // 4. 创建 Runtime 并执行
    const runtime = this.runtimeFactory.create(blueprint.runtimeType);
    const stream = runtime.execute(aiContext, {
      blueprintId: blueprint.id,
      conversationId,
      userId,
      config: blueprint.config,
    });

    return { traceSteps, aiContext, stream };
  }

  async saveAssistantMessage(conversationId: string, content: string): Promise<string | null> {
    if (content) {
      const msg = await this.memoryManager.addMessage(conversationId, 'assistant', content);
      return msg.id;
    }
    return null;
  }

  async saveTraceSteps(conversationId: string, traceSteps: any[]): Promise<void> {
    if (traceSteps.length > 0) {
      await this.chatService.saveTraceSteps(conversationId, 'assistant', traceSteps);
    }
  }

  async postProcess(conversationId: string, userId?: string): Promise<void> {
    await this.memoryManager.checkAndSummarize(conversationId);
    // 严格限制：禁用长期记忆提取，仅依赖 Redis 短期记忆（40条）
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.chatService.deleteConversation(conversationId);
  }

  /** 解析对话绑定的 Blueprint — 如未绑定则使用默认 */
  private async resolveBlueprintForConversation(conversationId: string) {
    const conv = await this.chatService.getConversationById(conversationId);
    const blueprintId = conv?.blueprintId;

    if (blueprintId) {
      const bp = await this.blueprintService.getById(blueprintId);
      if (bp) return bp;
    }

    // 回退到默认蓝图
    const defaultBp = await this.blueprintService.getDefault();
    if (defaultBp) return defaultBp;

    // 最终回退
    throw new Error('没有可用的智能体蓝图');
  }
}
