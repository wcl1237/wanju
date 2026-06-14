import { Provide, Scope, ScopeEnum, Config, Init } from '@midwayjs/core';
import { AIConfig } from '../../ai/model/ai.model';
import { MemoryType, MemoryResult } from '../model/customer.model';

/**
 * 长期记忆服务 — 基于 mem0ai 开源版本
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class MemoryStoreService {
  @Config('ai')
  aiConfig: AIConfig;

  private memory: any;

  @Init()
  async init() {
    try {
      const { Memory } = await import('mem0ai/oss');
      this.memory = new Memory({
        llm: {
          provider: 'openai',
          config: {
            apiKey: this.aiConfig.apiKey,
            model: this.aiConfig.model,
            baseURL: this.aiConfig.apiBase,
          },
        },
        embedder: {
          provider: 'openai',
          config: {
            apiKey: this.aiConfig.apiKey || 'ollama',
            model: this.aiConfig.embeddingModel,
            baseURL: this.aiConfig.embeddingApiBase,
          },
        },
        vectorStore: {
          provider: 'memory',
          config: { collectionName: 'customer_memories' },
        },
      });
      console.log('[MemoryStore] mem0 初始化成功');
    } catch (e) {
      console.error('[MemoryStore] mem0 初始化失败，降级为空实现:', e.message);
      this.memory = null;
    }
  }

  async addMemory(userId: string, content: string, type: MemoryType, metadata?: Record<string, any>): Promise<void> {
    if (!this.memory) return;
    try {
      const messages = [{ role: 'user', content }];
      await this.memory.add(messages, { userId, metadata: { type, ...(metadata || {}) } });
      console.log(`[MemoryStore] 添加记忆成功 userId=${userId} type=${type}`);
    } catch (e) {
      console.error('[MemoryStore] 添加记忆失败:', e.message);
    }
  }

  async searchMemories(userId: string, query: string, topK = 5): Promise<MemoryResult[]> {
    if (!this.memory) return [];
    try {
      const results = await this.memory.search(query, { filters: { user_id: userId }, topK });
      const items = results?.results || results || [];
      return items.map((r: any) => ({
        id: r.id || '', memory: r.memory || r.content || '', score: r.score,
        userId, metadata: r.metadata,
        createdAt: r.created_at || r.createdAt, updatedAt: r.updated_at || r.updatedAt,
      }));
    } catch (e) {
      console.error('[MemoryStore] 搜索记忆失败:', e.message);
      return [];
    }
  }

  async getAllMemories(userId: string): Promise<MemoryResult[]> {
    if (!this.memory) return [];
    try {
      const results = await this.memory.getAll({ filters: { user_id: userId } });
      const items = results?.results || results || [];
      return items.map((r: any) => ({
        id: r.id || '', memory: r.memory || r.content || '',
        userId, metadata: r.metadata,
        createdAt: r.created_at || r.createdAt, updatedAt: r.updated_at || r.updatedAt,
      }));
    } catch (e) {
      console.error('[MemoryStore] 获取所有记忆失败:', e.message);
      return [];
    }
  }

  async addFromConversation(userId: string, messages: { role: string; content: string }[]): Promise<void> {
    if (!this.memory) return;
    try {
      const formattedMsgs = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      if (formattedMsgs.length < 2) return;
      await this.memory.add(formattedMsgs, { userId });
      console.log(`[MemoryStore] 从对话提取记忆成功 userId=${userId}`);
    } catch (e) {
      console.error('[MemoryStore] 从对话提取记忆失败:', e.message);
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    if (!this.memory) return;
    try { await this.memory.delete(memoryId); } catch (e) { console.error('[MemoryStore] 删除记忆失败:', e.message); }
  }

  async deleteAllMemories(userId: string): Promise<void> {
    if (!this.memory) return;
    try { await this.memory.deleteAll({ userId }); } catch (e) { console.error('[MemoryStore] 删除所有记忆失败:', e.message); }
  }
}
