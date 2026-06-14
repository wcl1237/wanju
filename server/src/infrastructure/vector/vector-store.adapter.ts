import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { IEmbeddingService } from '../../domain/knowledge/port/embedding.port';
import { IVectorStore, VectorRecord, VectorSearchResult } from '../../domain/knowledge/port/vector-store.port';
import { KnowledgeChunkEntity } from '../../domain/knowledge/entity/knowledge-chunk.entity';
import { KnowledgeDocEntity } from '../../domain/knowledge/entity/knowledge-doc.entity';

/**
 * VectorStore 适配器 — 内存索引实现
 *
 * 使用内存 Map 构建向量索引，支持关键词召回和语义搜索。
 */
@Provide('vectorStore')
@Scope(ScopeEnum.Singleton)
export class VectorStoreAdapter implements IVectorStore {
  @InjectEntityModel(KnowledgeChunkEntity)
  chunkRepo: Repository<KnowledgeChunkEntity>;

  @InjectEntityModel(KnowledgeDocEntity)
  docRepo: Repository<KnowledgeDocEntity>;

  @Inject('embeddingService')
  embeddingService: IEmbeddingService;

  private index: Map<string, VectorRecord> = new Map();
  private indexLoaded = false;

  private async ensureIndex() {
    if (this.indexLoaded) return;
    this.indexLoaded = true;
    await this.loadIndex();
  }

  private async loadIndex() {
    const chunks = await this.chunkRepo
      .createQueryBuilder('kc')
      .leftJoinAndSelect('kc.doc', 'kd')
      .getMany();

    this.index.clear();
    for (const chunk of chunks) {
      if (!chunk.embedding) continue;
      try {
        this.index.set(chunk.id, {
          id: chunk.id,
          docId: chunk.docId,
          docName: chunk.doc?.name || '',
          content: chunk.content,
          keywords: chunk.keywords ? JSON.parse(chunk.keywords) : [],
          embedding: JSON.parse(chunk.embedding),
        });
      } catch {
        // skip corrupted
      }
    }
    console.log(`[VectorStore] 已加载 ${this.index.size} 条向量记录到内存索引`);
  }

  async addRecord(
    docId: string,
    chunkId: string,
    content: string,
    keywords: string[]
  ): Promise<void> {
    await this.ensureIndex();

    let embedding: number[];
    try {
      embedding = await this.embeddingService.embed(content);
    } catch (e) {
      console.error(`[VectorStore] 嵌入失败: ${content.slice(0, 50)}...`, e.message);
      embedding = [];
    }

    await this.chunkRepo.update(chunkId, {
      embedding: JSON.stringify(embedding),
      keywords: JSON.stringify(keywords),
    });

    const doc = await this.docRepo.findOneBy({ id: docId });
    const docName = doc?.name || '';

    if (embedding.length > 0) {
      this.index.set(chunkId, { id: chunkId, docId, docName, content, keywords, embedding });
    }
  }

  async addRecords(
    records: { docId: string; chunkId: string; content: string; keywords: string[] }[]
  ): Promise<void> {
    for (const record of records) {
      await this.addRecord(record.docId, record.chunkId, record.content, record.keywords);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  removeByDocId(docId: string) {
    for (const [id, record] of this.index) {
      if (record.docId === docId) this.index.delete(id);
    }
  }

  async keywordRecall(keywords: string[], topK = 20): Promise<VectorSearchResult[]> {
    await this.ensureIndex();
    if (keywords.length === 0) return [];
    const normalizedKeywords = keywords.map(k => k.toLowerCase());
    const results: VectorSearchResult[] = [];

    console.log(`[VectorStore] 关键词召回: keywords=[${normalizedKeywords.join(', ')}], 索引大小=${this.index.size}`);

    for (const record of this.index.values()) {
      let matchScore = 0;
      for (const kw of normalizedKeywords) {
        // 匹配 chunk keywords
        for (const recordKw of record.keywords) {
          if (recordKw.toLowerCase() === kw) matchScore += 3;
          else if (recordKw.toLowerCase().includes(kw) || kw.includes(recordKw.toLowerCase())) matchScore += 1.5;
        }
        // 匹配 chunk content
        const contentLower = record.content.toLowerCase();
        const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = contentLower.match(regex);
        if (matches) matchScore += matches.length * 0.5;
      }
      if (matchScore > 0) {
        results.push({
          id: record.id, docId: record.docId, docName: record.docName,
          content: record.content, keywords: record.keywords, score: matchScore,
        });
      }
    }

    console.log(`[VectorStore] 关键词召回结果: ${results.length} 条匹配`);
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async semanticRecall(query: string, candidateIds: string[], topK = 5): Promise<VectorSearchResult[]> {
    await this.ensureIndex();
    if (candidateIds.length === 0) return [];

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingService.embed(query);
    } catch (e) {
      console.error('[VectorStore] 语义召回-嵌入失败:', e.message);
      return candidateIds
        .map(id => this.index.get(id))
        .filter(Boolean)
        .slice(0, topK)
        .map(r => ({ id: r!.id, docId: r!.docId, docName: r!.docName, content: r!.content, keywords: r!.keywords, score: 0 }));
    }

    const scored: VectorSearchResult[] = [];
    for (const id of candidateIds) {
      const record = this.index.get(id);
      if (!record || record.embedding.length === 0) continue;
      const similarity = this.embeddingService.cosineSimilarity(queryEmbedding, record.embedding);
      scored.push({ id: record.id, docId: record.docId, docName: record.docName, content: record.content, keywords: record.keywords, score: similarity });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async semanticSearch(query: string, topK = 10): Promise<VectorSearchResult[]> {
    await this.ensureIndex();

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingService.embed(query);
    } catch (e) {
      console.error('[VectorStore] 语义搜索失败:', e.message);
      return [];
    }

    const scored: VectorSearchResult[] = [];
    for (const record of this.index.values()) {
      if (record.embedding.length === 0) continue;
      const similarity = this.embeddingService.cosineSimilarity(queryEmbedding, record.embedding);
      scored.push({ id: record.id, docId: record.docId, docName: record.docName, content: record.content, keywords: record.keywords, score: similarity });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  getStats(): { totalRecords: number; totalDocs: number } {
    const docIds = new Set<string>();
    for (const record of this.index.values()) docIds.add(record.docId);
    return { totalRecords: this.index.size, totalDocs: docIds.size };
  }

  async refreshIndex() {
    this.indexLoaded = false;
    await this.ensureIndex();
  }
}
