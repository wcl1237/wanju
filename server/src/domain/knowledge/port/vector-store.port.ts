/**
 * VectorStore 端口 — 领域层接口定义
 */

export interface VectorRecord {
  id: string;
  docId: string;
  docName: string;
  content: string;
  keywords: string[];
  embedding: number[];
}

export interface VectorSearchResult {
  id: string;
  docId: string;
  docName: string;
  content: string;
  keywords: string[];
  score: number;
}

export interface IVectorStore {
  /** 添加单条记录 */
  addRecord(docId: string, chunkId: string, content: string, keywords: string[]): Promise<void>;

  /** 批量添加记录 */
  addRecords(records: { docId: string; chunkId: string; content: string; keywords: string[] }[]): Promise<void>;

  /** 按文档 ID 删除记录 */
  removeByDocId(docId: string): void;

  /** 关键词召回 */
  keywordRecall(keywords: string[], topK?: number): Promise<VectorSearchResult[]>;

  /** 在候选集上语义召回 */
  semanticRecall(query: string, candidateIds: string[], topK?: number): Promise<VectorSearchResult[]>;

  /** 全量语义搜索 */
  semanticSearch(query: string, topK?: number): Promise<VectorSearchResult[]>;

  /** 获取统计信息 */
  getStats(): { totalRecords: number; totalDocs: number };

  /** 刷新索引 */
  refreshIndex(): Promise<void>;
}
