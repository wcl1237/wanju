export interface KnowledgeDoc {
  id: string;
  name: string;
  preview?: string;
  chunkCount: number;
  createdAt: string;
}

export interface SearchResult {
  id?: string;
  docName?: string;
  content: string;
  score: number;
}

export interface ChunkItem {
  id: string;
  index: number;
  content: string;
  keywords: string[];
  charCount: number;
}
