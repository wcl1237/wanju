import { Provide, Inject, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';
import { RAGService, RAGContext } from './rag.service';
import { v4 as uuidv4 } from 'uuid';
import { KnowledgeDoc, SearchResult, KnowledgeConfig } from '../interface';
import { KnowledgeDocEntity } from '../entity/knowledge-doc.entity';
import { KnowledgeChunkEntity } from '../entity/knowledge-chunk.entity';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';

@Provide()
@Scope(ScopeEnum.Singleton)
export class KnowledgeService {
  @InjectEntityModel(KnowledgeDocEntity)
  docRepo: Repository<KnowledgeDocEntity>;

  @InjectEntityModel(KnowledgeChunkEntity)
  chunkRepo: Repository<KnowledgeChunkEntity>;

  @Inject()
  embeddingService: EmbeddingService;

  @Inject()
  vectorStore: VectorStoreService;

  @Inject()
  ragService: RAGService;

  @Config('knowledge')
  knowledgeConfig: KnowledgeConfig;

  private autoImported = false;

  async ensureImported() {
    if (this.autoImported) return;
    this.autoImported = true;

    const docsDir = this.knowledgeConfig.docsDir;
    if (!existsSync(docsDir)) return;

    const files = readdirSync(docsDir);
    for (const file of files) {
      const ext = extname(file).toLowerCase();
      if (!['.md', '.txt', '.text'].includes(ext)) continue;

      const existing = await this.docRepo.findOneBy({ name: file });
      if (existing) continue;

      const filePath = join(docsDir, file);
      const content = readFileSync(filePath, 'utf-8');
      await this.importDocument(file, content);
      console.log(`[KnowledgeService] 自动导入文档: ${file}`);
    }
  }

  async importDocument(name: string, content: string): Promise<KnowledgeDoc> {
    const docId = uuidv4();
    const chunkMetas = this.embeddingService.smartChunk(
      name, content,
      this.knowledgeConfig.chunkSize,
      this.knowledgeConfig.chunkOverlap
    );

    // 保存文档
    await this.docRepo.save({
      id: docId, name, content,
      chunkCount: chunkMetas.length,
      createdAt: new Date().toISOString(),
    });

    // 保存切片
    const records: { docId: string; chunkId: string; content: string; keywords: string[] }[] = [];

    for (const meta of chunkMetas) {
      const chunkId = uuidv4();
      const keywords = this.extractChunkKeywords(meta.content);
      if (meta.heading) {
        const headingWords = meta.heading.split(/[\s>→·/]+/).filter(w => w.length >= 2);
        keywords.push(...headingWords);
      }
      const uniqueKeywords = [...new Set(keywords)];

      await this.chunkRepo.save({
        id: chunkId, docId,
        content: meta.content,
        embedding: null,
        keywords: JSON.stringify(uniqueKeywords),
      });

      records.push({ docId, chunkId, content: meta.content, keywords: uniqueKeywords });
    }

    console.log(`[KnowledgeService] 正在向量化 ${records.length} 个切片...`);
    await this.vectorStore.addRecords(records);
    await this.vectorStore.refreshIndex();

    return { id: docId, name, content, chunkCount: chunkMetas.length, createdAt: new Date().toISOString() };
  }

  async ragSearch(query: string, topK?: number): Promise<RAGContext> {
    await this.ensureImported();
    return this.ragService.retrieve(query, topK || this.knowledgeConfig.topK);
  }

  async search(query: string, topK?: number): Promise<SearchResult[]> {
    await this.ensureImported();
    const k = topK || this.knowledgeConfig.topK;

    const keywords = await this.ragService.extractKeywords(query);
    const rawResults = await this.vectorStore.keywordRecall(keywords, k * 4);

    if (rawResults.length > 0) {
      const candidateIds = rawResults.map(r => r.id);
      const semanticResults = await this.vectorStore.semanticRecall(query, candidateIds, k);
      return semanticResults.map(r => ({ docName: r.docName, content: r.content, score: r.score }));
    }

    const semanticResults = await this.vectorStore.semanticSearch(query, k);
    return semanticResults.map(r => ({ docName: r.docName, content: r.content, score: r.score }));
  }

  async listDocuments(): Promise<KnowledgeDoc[]> {
    const rows = await this.docRepo.find({ order: { createdAt: 'DESC' } });
    return rows.map(r => ({
      id: r.id, name: r.name, content: r.content,
      chunkCount: r.chunkCount, createdAt: r.createdAt,
    }));
  }

  async deleteDocument(id: string) {
    this.vectorStore.removeByDocId(id);
    await this.chunkRepo.delete({ docId: id });
    await this.docRepo.delete(id);
  }

  /**
   * 获取文档的所有分片
   */
  async getDocChunks(docId: string) {
    const chunks = await this.chunkRepo.find({
      where: { docId },
      order: { id: 'ASC' },
    });
    return chunks.map((c, index) => ({
      id: c.id,
      index: index + 1,
      content: c.content,
      keywords: c.keywords ? c.keywords.split(',') : [],
      charCount: c.content.length,
    }));
  }

  private extractChunkKeywords(text: string): string[] {
    const keywords: string[] = [];
    const chineseMatches = text.match(/[\u4e00-\u9fa5]{2,6}/g);
    if (chineseMatches) {
      const freq = new Map<string, number>();
      for (const word of chineseMatches) freq.set(word, (freq.get(word) || 0) + 1);
      const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
      keywords.push(...sorted.slice(0, 15).map(([word]) => word));
    }
    const englishMatches = text.match(/[a-zA-Z][a-zA-Z0-9]{2,}/g);
    if (englishMatches) {
      const uniqueWords = [...new Set(englishMatches.map(w => w.toLowerCase()))];
      const stopwords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'this', 'that', 'with', 'will', 'from']);
      keywords.push(...uniqueWords.filter(w => !stopwords.has(w)).slice(0, 10));
    }
    return [...new Set(keywords)];
  }
}
