import { Provide, Inject, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { VectorStoreService, VectorSearchResult } from './vector-store.service';
import { EmbeddingService } from './embedding.service';
import { AIConfig } from '../interface';

/**
 * RAG（检索增强生成）服务
 *
 * 多路串行检索管线：
 *   1. LLM 关键词提取 — 从用户查询中提取结构化关键词
 *   2. 关键词粗召回    — 召回 → 去重 → 取 topK×4 候选集
 *   3. 语义精排        — 去重 → LLM Rerank → 取 topK
 *
 * 最终输出拼装好的上下文，供主 LLM 生成回答。
 */

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

@Provide()
@Scope(ScopeEnum.Singleton)
export class RAGService {
  @Inject()
  vectorStore: VectorStoreService;

  @Inject()
  embeddingService: EmbeddingService;

  @Config('ai')
  aiConfig: AIConfig;

  /**
   * 完整 RAG 检索管线
   * @param query 用户原始查询
   * @param topK 最终返回的文档片段数量
   */
  async retrieve(query: string, topK = 5): Promise<RAGContext> {
    const startTime = Date.now();

    // ====== 阶段 1：LLM 关键词提取 ======
    console.log('[RAG] 阶段1: 关键词提取...');
    const keywords = await this.extractKeywords(query);
    console.log(`[RAG] 提取到关键词: ${keywords.join(', ')}`);

    // ====== 阶段 2：关键词粗召回 → 去重 → 取 topK×4 ======
    console.log('[RAG] 阶段2: 关键词粗召回...');
    // 先召回较多结果
    const rawKeywordResults = await this.vectorStore.keywordRecall(keywords, topK * 8);
    console.log(`[RAG] 粗召回原始 ${rawKeywordResults.length} 条`);

    // 去重：基于内容相似度去除重复/高度相似的切片
    const dedupedResults = this.deduplicateResults(rawKeywordResults);
    console.log(`[RAG] 去重后 ${dedupedResults.length} 条`);

    // 取 topK×4 作为候选集
    const candidates = dedupedResults.slice(0, topK * 4);
    console.log(`[RAG] 候选集 ${candidates.length} 条`);

    let finalResults: VectorSearchResult[];

    if (candidates.length === 0) {
      // 粗召回为空，退化为全量语义搜索
      console.log('[RAG] 粗召回为空，退化为全量语义搜索...');
      const semanticAll = await this.vectorStore.semanticSearch(query, topK * 2);
      const dedupedSemantic = this.deduplicateResults(semanticAll);
      finalResults = dedupedSemantic.slice(0, topK);
    } else {
      // ====== 阶段 3：语义精排 → 去重 → Rerank → 取 topK ======
      console.log('[RAG] 阶段3: 语义精排 + Rerank...');
      const candidateIds = candidates.map(r => r.id);
      const semanticResults = await this.vectorStore.semanticRecall(query, candidateIds, topK * 3);

      // 再次去重
      const dedupedSemantic = this.deduplicateResults(semanticResults);
      console.log(`[RAG] 精排去重后 ${dedupedSemantic.length} 条`);

      // LLM Rerank
      finalResults = await this.rerank(query, dedupedSemantic, topK);
      console.log(`[RAG] Rerank 后 ${finalResults.length} 条`);
    }

    // ====== 组装上下文 ======
    const context = this.assembleContext(finalResults, query);
    const sources = [...new Set(finalResults.map(r => r.docName))];

    const totalTimeMs = Date.now() - startTime;
    console.log(`[RAG] 检索完成，耗时 ${totalTimeMs}ms，来源: ${sources.join(', ')}`);

    return {
      context,
      sources,
      debug: {
        extractedKeywords: keywords,
        keywordRecallCount: rawKeywordResults.length,
        afterDedupCount: dedupedResults.length,
        semanticRecallCount: finalResults.length,
        totalTimeMs,
      },
    };
  }

  // ==================== 去重 ====================

  /**
   * 基于内容相似度去重
   * 使用 Jaccard 系数 + 编辑距离近似判断内容重复
   * 相似度 > 0.75 的视为重复，保留得分更高的
   */
  private deduplicateResults(results: VectorSearchResult[]): VectorSearchResult[] {
    if (results.length <= 1) return results;

    const kept: VectorSearchResult[] = [];

    for (const candidate of results) {
      let isDuplicate = false;

      for (const existing of kept) {
        const similarity = this.contentSimilarity(candidate.content, existing.content);
        if (similarity > 0.75) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        kept.push(candidate);
      }
    }

    return kept;
  }

  /**
   * 计算两段文本的内容相似度（基于字符级 n-gram Jaccard 系数）
   */
  private contentSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;

    const ngramSize = 3;
    const ngramsA = this.getNgrams(a, ngramSize);
    const ngramsB = this.getNgrams(b, ngramSize);

    let intersection = 0;
    for (const gram of ngramsA) {
      if (ngramsB.has(gram)) intersection++;
    }

    const union = ngramsA.size + ngramsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private getNgrams(text: string, n: number): Set<string> {
    const ngrams = new Set<string>();
    const cleaned = text.replace(/\s+/g, ' ').trim();
    for (let i = 0; i <= cleaned.length - n; i++) {
      ngrams.add(cleaned.slice(i, i + n));
    }
    return ngrams;
  }

  // ==================== Rerank ====================

  /**
   * LLM Rerank：使用大模型对候选集进行相关性重排序
   * 将候选切片和查询一起发给 LLM，让 LLM 按相关性打分
   */
  private async rerank(
    query: string,
    candidates: VectorSearchResult[],
    topK: number
  ): Promise<VectorSearchResult[]> {
    if (candidates.length <= topK) return candidates;

    try {
      // 构造 Rerank 提示词
      const snippets = candidates.map((c, i) =>
        `[${i + 1}] ${c.content.slice(0, 200)}${c.content.length > 200 ? '...' : ''}`
      ).join('\n\n');

      const prompt = `你是一个文档相关性评估专家。给定用户问题和多个候选文档片段，请按照与用户问题的相关性从高到低排列片段编号。

用户问题: ${query}

候选片段:
${snippets}

请只输出排序后的编号列表，用逗号分隔（如：3,1,5,2,4）。只输出编号，不要输出其他内容。

排序:`;

      const response = await fetch(`${this.aiConfig.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: this.aiConfig.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 100,
        }),
      });

      if (!response.ok) {
        throw new Error(`Rerank API error: ${response.status}`);
      }

      const data = await response.json();
      let content = data.choices[0]?.message?.content || '';
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      // 解析编号列表
      const indices = content
        .split(/[,，\s、]+/)
        .map((s: string) => parseInt(s.trim(), 10))
        .filter((n: number) => !isNaN(n) && n >= 1 && n <= candidates.length)
        .map((n: number) => n - 1); // 转为 0-indexed

      // 去重索引
      const seen = new Set<number>();
      const uniqueIndices: number[] = [];
      for (const idx of indices) {
        if (!seen.has(idx)) {
          seen.add(idx);
          uniqueIndices.push(idx);
        }
      }

      if (uniqueIndices.length >= topK) {
        return uniqueIndices.slice(0, topK).map(i => candidates[i]);
      }

      // LLM 返回不完整时，用原始排序补齐
      const reranked = uniqueIndices.map(i => candidates[i]);
      for (const c of candidates) {
        if (reranked.length >= topK) break;
        if (!reranked.includes(c)) reranked.push(c);
      }
      return reranked.slice(0, topK);

    } catch (e) {
      console.error('[RAG] LLM Rerank 失败，使用语义排序:', e.message);
      // 退化：直接按语义得分截取
      return candidates.slice(0, topK);
    }
  }

  // ==================== 关键词提取 ====================

  /**
   * 阶段 1：使用 LLM 从用户查询中提取关键词
   */
  async extractKeywords(query: string): Promise<string[]> {
    const prompt = `你是一个语义分析专家。请对用户问题进行深度语义分析，提取用于知识库检索的关键词和短语。

要求：
1. **意图识别**：先理解用户的核心意图，再提取关键词
2. **语义扩展**：对核心概念补充同义词、近义词、上下位词（如"退款"→"退货、退钱、返还"）
3. **实体提取**：提取人名、产品名、订单号、专业术语等命名实体
4. **意图词**：提取表达用户意图的动作词（如"怎么办、如何、查询、修改"）
5. **领域术语映射**：将口语化表达映射为专业术语（如"买贵了"→"价格保护、差价退款"）
6. 输出 5-12 个关键词/短语，按重要性排序
7. 只输出关键词，用逗号分隔，不要输出其他内容

用户问题: ${query}

关键词:`;

    try {
      const response = await fetch(`${this.aiConfig.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: this.aiConfig.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 300,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      let content = data.choices[0]?.message?.content || '';
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      console.log(`[RAG] LLM 语义关键词提取结果: "${content}"`);

      const keywords = content
        .split(/[,，\n、;；]+/)
        .map((k: string) => k.trim())
        .filter((k: string) => k.length > 0 && k.length < 20);

      return keywords.length > 0 ? keywords : this.fallbackKeywordExtract(query);
    } catch (e) {
      console.error('[RAG] LLM 关键词提取失败，使用退化方案:', e.message);
      return this.fallbackKeywordExtract(query);
    }
  }

  /**
   * 退化关键词提取：简单分词
   */
  private fallbackKeywordExtract(query: string): string[] {
    const keywords: string[] = [];
    const chineseMatches = query.match(/[\u4e00-\u9fa5]{2,6}/g);
    if (chineseMatches) keywords.push(...chineseMatches);
    const englishMatches = query.match(/[a-zA-Z]{2,}/g);
    if (englishMatches) keywords.push(...englishMatches.map(w => w.toLowerCase()));
    return [...new Set(keywords)];
  }

  // ==================== 上下文组装 ====================

  /**
   * 将检索到的文档片段按相关性排列，生成结构化上下文
   */
  private assembleContext(results: VectorSearchResult[], query: string): string {
    if (results.length === 0) {
      return '未在知识库中找到与该问题相关的信息。';
    }

    const parts: string[] = [
      '以下是从知识库中检索到的相关信息（经过关键词召回 + 语义精排 + 相关性重排），请基于这些信息回答用户问题。',
      '如果信息不足以回答问题，请说明并提供你的最佳建议。',
      '',
    ];

    // 按文档分组
    const byDoc = new Map<string, VectorSearchResult[]>();
    for (const r of results) {
      if (!byDoc.has(r.docName)) byDoc.set(r.docName, []);
      byDoc.get(r.docName)!.push(r);
    }

    let docIdx = 1;
    for (const [docName, chunks] of byDoc) {
      parts.push(`--- 来源 ${docIdx}: ${docName} ---`);
      for (const chunk of chunks) {
        parts.push(chunk.content);
        parts.push('');
      }
      docIdx++;
    }

    return parts.join('\n');
  }
}
