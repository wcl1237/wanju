import { Provide, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { AIConfig } from '../../domain/ai/model/ai.model';
import { IEmbeddingService } from '../../domain/knowledge/port/embedding.port';

/**
 * Embedding 适配器 — 实现 IEmbeddingService 端口
 *
 * 支持本地 Ollama 和远程 API（通义千问等）。
 */
@Provide('embeddingService')
@Scope(ScopeEnum.Singleton)
export class EmbeddingAdapter implements IEmbeddingService {
  @Config('ai')
  aiConfig: AIConfig;

  /**
   * 文本转向量
   */
  async embed(text: string): Promise<number[]> {
    const embeddingBase = this.aiConfig.embeddingApiBase || this.aiConfig.apiBase;
    const isLocal = embeddingBase.includes('localhost') || embeddingBase.includes('127.0.0.1');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // 本地 Ollama 不需要 Authorization
    if (!isLocal && this.aiConfig.apiKey) {
      headers['Authorization'] = `Bearer ${this.aiConfig.apiKey}`;
    }

    const response = await fetch(`${embeddingBase}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.aiConfig.embeddingModel,
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * 批量文本转向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      try {
        const embedding = await this.embed(text);
        results.push(embedding);
      } catch (e) {
        console.error(`[EmbeddingAdapter] 嵌入失败: ${text.slice(0, 50)}...`, e.message);
        results.push([]);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return results;
  }

  /**
   * 余弦相似度计算
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}
