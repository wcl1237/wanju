import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { ChunkMeta } from '../model/knowledge.model';

/**
 * 文档切片服务 — 纯领域逻辑
 *
 * 根据文件类型选择切片策略（Markdown 结构化 / 纯文本语义化），
 * 不依赖任何基础设施。
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class ChunkingService {
  /**
   * 根据文件类型选择切片策略
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
   * 旧的简单切片接口（保持向后兼容）
   */
  splitIntoChunks(text: string, chunkSize = 500, overlap = 50): string[] {
    return this.semanticChunk(text, chunkSize, overlap).map(c => c.content);
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

  // ==================== Markdown 结构化切片 ====================

  private markdownStructuredChunk(content: string, chunkSize: number, overlap: number): ChunkMeta[] {
    const chunks: ChunkMeta[] = [];
    const lines = content.split('\n');

    const sections: { heading: string; level: number; lines: string[] }[] = [];
    let currentSection: { heading: string; level: number; lines: string[] } = {
      heading: '', level: 0, lines: [],
    };

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
      if (headingMatch) {
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
    if (currentSection.lines.length > 0 || currentSection.heading) {
      sections.push(currentSection);
    }

    const headingStack: string[] = [];
    const levelStack: number[] = [];

    for (const section of sections) {
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

      const breadcrumb = headingStack.join(' > ');
      const fullText = breadcrumb
        ? `[${breadcrumb}]\n${sectionContent}`
        : sectionContent;

      if (fullText.length <= chunkSize) {
        if (fullText.trim()) {
          chunks.push({
            content: fullText.trim(),
            chunkType: 'structured',
            heading: breadcrumb || undefined,
          });
        }
      } else {
        const subChunks = this.splitLongSection(fullText, breadcrumb, chunkSize, overlap);
        chunks.push(...subChunks);
      }
    }

    if (chunks.length === 0 && content.trim()) {
      chunks.push({ content: content.trim().slice(0, chunkSize), chunkType: 'structured' });
    }

    return chunks;
  }

  private splitLongSection(text: string, heading: string, chunkSize: number, overlap: number): ChunkMeta[] {
    const chunks: ChunkMeta[] = [];
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

  // ==================== 纯文本语义化切片 ====================

  private semanticChunk(content: string, chunkSize: number, overlap: number): ChunkMeta[] {
    const chunks: ChunkMeta[] = [];
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
        chunks.push({ content: currentChunk.trim(), chunkType: 'semantic' });
        const overlapText = this.getTrailingSentences(currentChunk, overlap);
        currentChunk = overlapText + '\n\n' + trimmed;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({ content: currentChunk.trim(), chunkType: 'semantic' });
    }

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

  // ==================== 工具方法 ====================

  private splitBySentences(text: string, chunkSize: number, overlap: number): string[] {
    const sentences = text.split(/(?<=[。！？；\.!\?;])\s*/);
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

    if (chunks.length === 0 && text.trim()) {
      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        chunks.push(text.slice(i, i + chunkSize).trim());
      }
    }

    return chunks.filter(c => c.length > 0);
  }

  private getTrailingSentences(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    const tail = text.slice(-maxLen);
    const sentStart = tail.search(/[。！？；\.!\?;]\s*/);
    if (sentStart > 0 && sentStart < maxLen * 0.5) {
      return tail.slice(sentStart + 1).trim();
    }
    return tail;
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
