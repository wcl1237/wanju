import { Provide, Scope, ScopeEnum, Config, Init } from '@midwayjs/core';
import { AIConfig } from '../interface';

export type MemoryType = 'profile' | 'preference' | 'business' | 'context';

export interface MemoryResult {
  id: string;
  memory: string;
  score?: number;
  userId?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 长期记忆服务 — 基于 mem0ai 开源版本
 *
 * 使用 mem0 的 Memory 类实现向量化记忆存储与检索
 * 内置去重、冲突合并、语义搜索
 * 记忆跟 userId 走，跨所有会话
 *
 * 注意 mem0 v3.x 的 API 命名不一致:
 *   add / deleteAll 用 camelCase: { userId }
 *   search / getAll 的 filters 用 snake_case: { user_id }
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class MemoryStoreService {
  @Config('ai')
  aiConfig: AIConfig;

  private memory: any; // mem0ai Memory instance

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
          config: {
            collectionName: 'customer_memories',
          },
        },
      });
      console.log('[MemoryStore] mem0 初始化成功');
    } catch (e) {
      console.error('[MemoryStore] mem0 初始化失败，降级为空实现:', e.message);
      this.memory = null;
    }
  }

  /**
   * 添加记忆 — mem0 会自动处理去重和冲突合并
   */
  async addMemory(
    userId: string,
    content: string,
    type: MemoryType,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.memory) return;

    try {
      const messages = [
        { role: 'user', content },
      ];
      // add 用 camelCase: userId
      await this.memory.add(messages, {
        userId,
        metadata: { type, ...(metadata || {}) },
      });
      console.log(`[MemoryStore] 添加记忆成功 userId=${userId} type=${type}`);
    } catch (e) {
      console.error('[MemoryStore] 添加记忆失败:', e.message);
    }
  }

  /**
   * 根据查询检索相关记忆
   */
  async searchMemories(
    userId: string,
    query: string,
    topK = 5
  ): Promise<MemoryResult[]> {
    if (!this.memory) return [];

    try {
      // search 用 filters + snake_case: user_id
      const results = await this.memory.search(query, {
        filters: { user_id: userId },
        topK,
      });
      const items = results?.results || results || [];
      return items.map((r: any) => ({
        id: r.id || '',
        memory: r.memory || r.content || '',
        score: r.score,
        userId,
        metadata: r.metadata,
        createdAt: r.created_at || r.createdAt,
        updatedAt: r.updated_at || r.updatedAt,
      }));
    } catch (e) {
      console.error('[MemoryStore] 搜索记忆失败:', e.message);
      return [];
    }
  }

  /**
   * 获取用户所有记忆
   */
  async getAllMemories(userId: string): Promise<MemoryResult[]> {
    if (!this.memory) return [];

    try {
      // getAll 用 filters + snake_case: user_id
      const results = await this.memory.getAll({
        filters: { user_id: userId },
      });
      const items = results?.results || results || [];
      return items.map((r: any) => ({
        id: r.id || '',
        memory: r.memory || r.content || '',
        userId,
        metadata: r.metadata,
        createdAt: r.created_at || r.createdAt,
        updatedAt: r.updated_at || r.updatedAt,
      }));
    } catch (e) {
      console.error('[MemoryStore] 获取所有记忆失败:', e.message);
      return [];
    }
  }

  /**
   * 从对话中自动提取记忆
   * mem0 会自动分析对话并提取关键信息
   */
  async addFromConversation(
    userId: string,
    messages: { role: string; content: string }[]
  ): Promise<void> {
    if (!this.memory) return;

    try {
      const formattedMsgs = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      if (formattedMsgs.length < 2) return;

      // add 用 camelCase: userId
      await this.memory.add(formattedMsgs, { userId });
      console.log(`[MemoryStore] 从对话提取记忆成功 userId=${userId}`);
    } catch (e) {
      console.error('[MemoryStore] 从对话提取记忆失败:', e.message);
    }
  }

  /**
   * 删除指定记忆
   */
  async deleteMemory(memoryId: string): Promise<void> {
    if (!this.memory) return;
    try {
      await this.memory.delete(memoryId);
    } catch (e) {
      console.error('[MemoryStore] 删除记忆失败:', e.message);
    }
  }

  /**
   * 删除用户所有记忆
   */
  async deleteAllMemories(userId: string): Promise<void> {
    if (!this.memory) return;
    try {
      // deleteAll 用 camelCase: userId (继承 Entity)
      await this.memory.deleteAll({ userId });
    } catch (e) {
      console.error('[MemoryStore] 删除所有记忆失败:', e.message);
    }
  }
}
