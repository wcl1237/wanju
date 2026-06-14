import { Provide, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { AIConfig } from '../interface';

/**
 * 向量嵌入服务
 * 使用通义千问 Embedding API 将文本转换为向量
 * 提供基于文件类型的智能切片和相似度计算
 */

export interface ChunkMeta {
  content: string;
  /** 切片类型：structured=结构化, semantic=语义化 */
  chunkType: 'structured' | 'semantic';
  /** 来源标题/章节（Markdown 结构化切片专属） */
  heading?: string;
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class EmbeddingService {
  @Config('ai')
  aiConfig: AIConfig;

  /**
   * 检查是否使用向量搜索 — RAG 模式下始终启用
   */
  isVectorSearchEnabled(): boolean {
    return true;
  }

  // ==================== Embedding API ====================

  /**
   * 文本转向量（使用本地 Ollama 或远程 API）
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
        console.error(`[EmbeddingService] 嵌入失败: ${text.slice(0, 50)}...`, e.message);
        results.push([]);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return results;
  }

  // ==================== 智能切片 ====================

  /**
   * 根据文件类型选择切片策略
   * @param fileName 文件名（用于判断类型）
   * @param content  文件内容
   * @param chunkSize 目标切片大小
   * @param overlap  重叠字符数
   */
  smartChunk(fileName: string, content: string, chunkSize = 500, overlap = 80): ChunkMeta[] {
    const ext = this.getExtension(fileName);

    if (ext === '.md' || ext === '.markdown') {
      console.log(`[Chunking] Markdown 结构化切片: ${fileName}`);
      return this.markdownStructuredChunk(content, chunkSize, overlap);
    }

    console.log(`[Chunking] 纯文本语义化切片: ${fileName}`);
    return this.semanticChunk(content, chunkSize, overlap);
  }

  /**
   * Markdown 结构化切片
   * 按标题层级拆分，保留标题上下文，每个 section 是一个完整语义单元
   */
  private markdownStructuredChunk(content: string, chunkSize: number, overlap: number): ChunkMeta[] {
    const chunks: ChunkMeta[] = [];
    const lines = content.split('\n');

    // 解析 Markdown 为 section 树
    const sections: { heading: string; level: number; lines: string[] }[] = [];
    let currentSection: { heading: string; level: number; lines: string[] } = {
      heading: '',
      level: 0,
      lines: [],
    };

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
      if (headingMatch) {
        // 保存上一个 section
        if (currentSection.lines.length > 0 || currentSection.heading) {
          sections.push({ ...currentSection });
        }
        currentSection = {
          heading: headingMatch[2].trim(),
          level: headingMatch[1].length,
          lines: [],
        };
      } else {
        currentSection.lines.push(line);
      }
    }
    // 保存最后一个 section
    if (currentSection.lines.length > 0 || currentSection.heading) {
      sections.push(currentSection);
    }

    // 构建每个 section 的面包屑标题路径
    const headingStack: string[] = [];
    const levelStack: number[] = [];

    for (const section of sections) {
      // 维护标题栈
      if (section.heading) {
        while (levelStack.length > 0 && levelStack[levelStack.length - 1] >= section.level) {
          headingStack.pop();
          levelStack.pop();
        }
        headingStack.push(section.heading);
        levelStack.push(section.level);
      }

      const sectionContent = section.lines.join('\n').trim();
      if (!sectionContent && !section.heading) continue;

      // 面包屑路径
      const breadcrumb = headingStack.join(' > ');
      // 拼接标题和内容
      const fullText = breadcrumb
        ? `[${breadcrumb}]\n${sectionContent}`
        : sectionContent;

      if (fullText.length <= chunkSize) {
        // 整个 section 作为一个切片
        if (fullText.trim()) {
          chunks.push({
            content: fullText.trim(),
            chunkType: 'structured',
            heading: breadcrumb || undefined,
          });
        }
      } else {
        // section 太长，在 section 内部按段落/句子进一步切分
        const subChunks = this.splitLongSection(fullText, breadcrumb, chunkSize, overlap);
        chunks.push(...subChunks);
      }
    }

    // 空文件兜底
    if (chunks.length === 0 && content.trim()) {
      chunks.push({ content: content.trim().slice(0, chunkSize), chunkType: 'structured' });
    }

    return chunks;
  }

  /**
   * 将过长的 section 按段落/句子边界拆分
   */
  private splitLongSection(text: string, heading: string, chunkSize: number, overlap: number): ChunkMeta[] {
    const chunks: ChunkMeta[] = [];

    // 先按段落拆
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    let currentChunk = '';

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (currentChunk.length + trimmed.length + 2 > chunkSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          chunkType: 'structured',
          heading: heading || undefined,
        });
        // 保留重叠
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + '\n\n' + trimmed;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        chunkType: 'structured',
        heading: heading || undefined,
      });
    }

    // 如果段落级切分后仍有超长块，按句子强制切分
    const result: ChunkMeta[] = [];
    for (const chunk of chunks) {
      if (chunk.content.length > chunkSize * 1.5) {
        const sentenceChunks = this.splitBySentences(chunk.content, chunkSize, overlap);
        result.push(
          ...sentenceChunks.map(c => ({
            content: c,
            chunkType: 'structured' as const,
            heading: chunk.heading,
          }))
        );
      } else {
        result.push(chunk);
      }
    }

    return result;
  }

  /**
   * 纯文本语义化切片
   * 按句子边界拆分，寻找语义自然断点（句号/问号/换行等）
   */
  private semanticChunk(content: string, chunkSize: number, overlap: number): ChunkMeta[] {
    const chunks: ChunkMeta[] = [];

    // 先按段落分割（段落通常是语义单元）
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());

    if (paragraphs.length === 0 && content.trim()) {
      return this.splitBySentences(content.trim(), chunkSize, overlap).map(c => ({
        content: c,
        chunkType: 'semantic' as const,
      }));
    }

    let currentChunk = '';

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (currentChunk.length + trimmed.length + 2 > chunkSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          chunkType: 'semantic',
        });
        // 语义重叠：保留上一段的最后几句作为上下文
        const overlapText = this.getTrailingSentences(currentChunk, overlap);
        currentChunk = overlapText + '\n\n' + trimmed;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({ content: currentChunk.trim(), chunkType: 'semantic' });
    }

    // 处理超长段落
    const result: ChunkMeta[] = [];
    for (const chunk of chunks) {
      if (chunk.content.length > chunkSize * 1.5) {
        const subChunks = this.splitBySentences(chunk.content, chunkSize, overlap);
        result.push(...subChunks.map(c => ({ content: c, chunkType: 'semantic' as const })));
      } else {
        result.push(chunk);
      }
    }

    return result.length > 0
      ? result
      : [{ content: content.trim().slice(0, chunkSize), chunkType: 'semantic' as const }];
  }

  /**
   * 按句子边界切分长文本
   * 支持中英文句号、问号、感叹号、分号作为断点
   */
  private splitBySentences(text: string, chunkSize: number, overlap: number): string[] {
    // 匹配句子结束符（保留分隔符）
    const sentences = text.split(/(?<=[。！？；\.\!\?\;])\s*/);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (!sentence.trim()) continue;

      if (current.length + sentence.length > chunkSize && current.length > 0) {
        chunks.push(current.trim());
        const overlapText = this.getTrailingSentences(current, overlap);
        current = overlapText + sentence;
      } else {
        current += sentence;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    // 兜底：如果句子切分无效（没有句号的文本），按字符硬切
    if (chunks.length === 0 && text.trim()) {
      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        chunks.push(text.slice(i, i + chunkSize).trim());
      }
    }

    return chunks.filter(c => c.length > 0);
  }

  /**
   * 获取文本末尾的若干字符（在句子边界切断）
   */
  private getTrailingSentences(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    const tail = text.slice(-maxLen);
    // 尝试在句子边界开始
    const sentStart = tail.search(/[。！？；\.\!\?\;]\s*/);
    if (sentStart > 0 && sentStart < maxLen * 0.5) {
      return tail.slice(sentStart + 1).trim();
    }
    return tail;
  }

  // ==================== 旧接口兼容 ====================

  /**
   * 旧的简单切片接口（保持向后兼容）
   */
  splitIntoChunks(text: string, chunkSize = 500, overlap = 50): string[] {
    return this.semanticChunk(text, chunkSize, overlap).map(c => c.content);
  }

  // ==================== 相似度计算 ====================

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

  /**
   * 关键词匹配搜索（退化方案）
   */
  keywordSearch(query: string, documents: { content: string }[]): { index: number; score: number }[] {
    const queryTerms = this.tokenize(query);
    const results: { index: number; score: number }[] = [];

    for (let i = 0; i < documents.length; i++) {
      const docTerms = this.tokenize(documents[i].content);
      let matchCount = 0;

      for (const term of queryTerms) {
        if (docTerms.includes(term)) matchCount++;
        for (const docTerm of docTerms) {
          if (docTerm.includes(term) || term.includes(docTerm)) matchCount += 0.5;
        }
      }

      const score = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
      if (score > 0) results.push({ index: i, score });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private tokenize(text: string): string[] {
    const terms: string[] = [];
    const chineseMatches = text.match(/[\u4e00-\u9fa5]{2,4}/g);
    if (chineseMatches) terms.push(...chineseMatches);
    const englishMatches = text.match(/[a-zA-Z]+/g);
    if (englishMatches) terms.push(...englishMatches.map(w => w.toLowerCase()));
    return [...new Set(terms)];
  }

  private getExtension(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
  }
}
