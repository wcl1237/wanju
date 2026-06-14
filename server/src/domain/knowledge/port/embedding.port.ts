/**
 * Embedding 端口 — 领域层接口定义
 */

export interface IEmbeddingService {
  /** 文本转向量 */
  embed(text: string): Promise<number[]>;

  /** 批量文本转向量 */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** 余弦相似度计算 */
  cosineSimilarity(a: number[], b: number[]): number;
}
