/**
 * Knowledge 知识域 — 类型定义
 */

export interface KnowledgeDoc {
  id: string;
  name: string;
  content: string;
  chunkCount: number;
  createdAt: string;
}

export interface KnowledgeChunk {
  id: string;
  docId: string;
  content: string;
  embedding?: number[];
}

export interface SearchResult {
  docName: string;
  content: string;
  score: number;
}

export interface KnowledgeConfig {
  docsDir: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
}

/** RAG 检索管线输出 */
export interface RAGContext {
  /** 最终送入 LLM 的上下文文本 */
  context: string;
  /** 召回的文档来源（去重） */
  sources: string[];
  /** 管线各阶段的调试信息 */
  debug: {
    extractedKeywords: string[];
    keywordRecallCount: number;
    afterDedupCount: number;
    semanticRecallCount: number;
    totalTimeMs: number;
  };
}

/** 切片元数据 */
export interface ChunkMeta {
  content: string;
  /** 切片类型：structured=结构化, semantic=语义化 */
  chunkType: 'structured' | 'semantic';
  /** 来源标题/章节（Markdown 结构化切片专属） */
  heading?: string;
}
