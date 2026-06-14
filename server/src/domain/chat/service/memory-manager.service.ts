import { Provide, Inject, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { RedisService } from '@midwayjs/redis';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MessageEntity } from '../entity/message.entity';
import { ConversationEntity } from '../entity/conversation.entity';
import { MemoryStoreService } from '../../customer/service/memory-store.service';
import { ILLMClient } from '../../ai/port/llm.port';
import { AIMessage } from '../../ai/model/ai.model';
import { Message } from '../model/message.model';

const REDIS_MSG_KEY = (id: string) => `chat:messages:${id}`;
const REDIS_SUMMARY_KEY = (id: string) => `chat:summary:${id}`;
const SHORT_TERM_LIMIT = 20;
const CONTEXT_TOKEN_LIMIT = 8000;
const SUMMARY_THRESHOLD = 0.8;

/**
 * 记忆管理器 — 统一管理三层记忆
 *
 * 短期记忆: Redis (最近20条消息)
 * 长期记忆: mem0 (向量化用户画像/业务信息)
 * 持久化:  SQLite/TypeORM (全量对话记录)
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class MemoryManagerService {
  @Inject()
  redisService: RedisService;

  @Inject()
  memoryStore: MemoryStoreService;

  @InjectEntityModel(MessageEntity)
  messageRepo: Repository<MessageEntity>;

  @InjectEntityModel(ConversationEntity)
  conversationRepo: Repository<ConversationEntity>;

  @Inject('llmClient')
  llmClient: ILLMClient;

  async initConversation(conversationId: string): Promise<void> {
    const key = REDIS_MSG_KEY(conversationId);
    const exists = await this.redisService.exists(key);
    if (exists) return;

    const rows = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    const recent = rows.slice(-SHORT_TERM_LIMIT);
    if (recent.length === 0) return;

    const pipeline = this.redisService.pipeline();
    for (const row of recent) {
      pipeline.rpush(key, JSON.stringify(this.rowToMsg(row)));
    }
    pipeline.expire(key, 86400);
    await pipeline.exec();
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
      toolCallId: toolCallId || null, createdAt: now,
    });

    await this.conversationRepo.update(conversationId, { updatedAt: now });

    if (role === 'user') {
      const count = await this.messageRepo.count({ where: { conversationId, role: 'user' } });
      if (count === 1) {
        const title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
        await this.conversationRepo.update(conversationId, { title });
      }
    }

    if (role === 'user' || role === 'assistant') {
      const msg: AIMessage = { role, content };
      const key = REDIS_MSG_KEY(conversationId);
      await this.redisService.rpush(key, JSON.stringify(msg));
      await this.redisService.ltrim(key, -SHORT_TERM_LIMIT, -1);
      await this.redisService.expire(key, 86400);
    }

    return { id, conversationId, role, content, toolCalls, toolCallId, createdAt: now };
  }

  async getAIContext(conversationId: string, userId?: string): Promise<{
    messages: AIMessage[];
    meta: { hasSummary: boolean; shortTermCount: number; longTermCount: number; profileCount: number };
  }> {
    const messages: AIMessage[] = [];
    let hasSummary = false;
    let shortTermCount = 0;
    let longTermCount = 0;
    let profileCount = 0;

    const summary = await this.redisService.get(REDIS_SUMMARY_KEY(conversationId));
    if (summary) {
      hasSummary = true;
      messages.push({ role: 'system', content: `[对话历史摘要]\n${summary}` });
    }

    const key = REDIS_MSG_KEY(conversationId);
    let cached = await this.redisService.lrange(key, 0, -1);

    if (cached.length === 0) {
      await this.initConversation(conversationId);
      cached = await this.redisService.lrange(key, 0, -1);
    }

    shortTermCount = cached.length;
    for (const item of cached) {
      try { messages.push(JSON.parse(item)); } catch { /* skip */ }
    }

    if (userId) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const memories = await this.memoryStore.searchMemories(userId, lastUserMsg.content, 5);
        longTermCount = memories.length;
        if (memories.length > 0) {
          const memoryContext = memories.map(m => `- ${m.memory}`).join('\n');
          messages.unshift({ role: 'system', content: `[用户长期记忆 — 来自 mem0]\n${memoryContext}` });
        }
      }

      const allMemories = await this.memoryStore.getAllMemories(userId);
      const profileMemories = allMemories.filter(m => m.metadata?.type === 'profile');
      profileCount = profileMemories.length;
      if (profileMemories.length > 0) {
        const profileCtx = profileMemories.map(m => `- ${m.memory}`).join('\n');
        messages.unshift({ role: 'system', content: `[用户基础信息]\n${profileCtx}` });
      }
    }

    return { messages, meta: { hasSummary, shortTermCount, longTermCount, profileCount } };
  }

  async checkAndSummarize(conversationId: string): Promise<boolean> {
    const key = REDIS_MSG_KEY(conversationId);
    const cached = await this.redisService.lrange(key, 0, -1);
    if (cached.length < 10) return false;

    let totalChars = 0;
    for (const item of cached) {
      try { const msg = JSON.parse(item); totalChars += (msg.content || '').length; } catch { /* skip */ }
    }
    const estimatedTokens = Math.ceil(totalChars / 2);

    if (estimatedTokens < CONTEXT_TOKEN_LIMIT * SUMMARY_THRESHOLD) return false;

    console.log(`[MemoryManager] 对话 ${conversationId.slice(0, 8)} token 估算 ${estimatedTokens}/${CONTEXT_TOKEN_LIMIT}，触发摘要压缩`);

    const messages = cached.map(item => {
      try { return JSON.parse(item); } catch { return null; }
    }).filter(Boolean);

    const conversationText = messages
      .map((m: any) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n');

    try {
      const summaryContent = await this.llmClient.complete(
        `请将以下对话历史压缩为一段简洁的摘要（约200-300字），保留关键信息、用户需求、已解决的问题和待处理事项。不要用对话格式，用陈述句总结。\n\n${conversationText}`,
        { temperature: 0.1 }
      );

      if (!summaryContent) return false;

      await this.redisService.set(REDIS_SUMMARY_KEY(conversationId), summaryContent, 'EX', 86400);

      const recentMsgs = cached.slice(-4);
      const pipeline = this.redisService.pipeline();
      pipeline.del(key);
      for (const msg of recentMsgs) { pipeline.rpush(key, msg); }
      pipeline.expire(key, 86400);
      await pipeline.exec();

      console.log(`[MemoryManager] 摘要完成，压缩 ${cached.length} 条 → 摘要 + ${recentMsgs.length} 条`);
      return true;
    } catch (e) {
      console.error('[MemoryManager] 摘要失败:', e.message);
      return false;
    }
  }

  async getHistory(conversationId: string, page = 1, pageSize = 20): Promise<{ messages: Message[]; total: number; hasMore: boolean }> {
    const total = await this.messageRepo.count({ where: { conversationId } });
    const skip = Math.max(0, total - page * pageSize);
    const take = Math.min(pageSize, total - (page - 1) * pageSize);

    const rows = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      skip: Math.max(0, skip),
      take: take > 0 ? take : pageSize,
    });

    return {
      messages: rows.map(r => ({
        id: r.id, conversationId: r.conversationId,
        role: r.role as Message['role'], content: r.content,
        toolCalls: r.toolCalls ? JSON.parse(r.toolCalls) : undefined,
        toolCallId: r.toolCallId || undefined,
        traceSteps: r.traceSteps ? JSON.parse(r.traceSteps) : undefined,
        createdAt: r.createdAt,
      })),
      total, hasMore: page * pageSize < total,
    };
  }

  async extractLongTermMemory(userId: string, conversationId: string): Promise<void> {
    const key = REDIS_MSG_KEY(conversationId);
    const cached = await this.redisService.lrange(key, 0, -1);
    const messages = cached.map(item => {
      try { return JSON.parse(item); } catch { return null; }
    }).filter(Boolean);

    if (messages.length >= 4) {
      await this.memoryStore.addFromConversation(userId, messages.slice(-6));
    }
  }

  private rowToMsg(row: MessageEntity): AIMessage {
    return {
      role: row.role as AIMessage['role'], content: row.content,
      tool_calls: row.toolCalls ? JSON.parse(row.toolCalls) : undefined,
      tool_call_id: row.toolCallId || undefined,
    };
  }
}
