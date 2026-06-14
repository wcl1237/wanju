import { authFetch, apiUrl } from '../../shared/http-client';
import type { KnowledgeDoc, SearchResult, ChunkItem } from './types';

export async function getDocs(): Promise<KnowledgeDoc[]> {
  const res = await authFetch(apiUrl('/knowledge/docs'));
  if (!res.ok) throw new Error('获取文档列表失败');
  const data = await res.json();
  return data.data || data.docs || [];
}

export async function uploadDoc(name: string, content: string): Promise<any> {
  const res = await authFetch(apiUrl('/knowledge/docs'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content }),
  });
  if (!res.ok) throw new Error(`上传 ${name} 失败`);
  return res.json();
}

export async function deleteDoc(id: string): Promise<void> {
  const res = await authFetch(apiUrl(`/knowledge/docs/${id}`), { method: 'DELETE' });
  if (!res.ok) throw new Error('删除文档失败');
}

export async function searchKnowledge(query: string): Promise<SearchResult[]> {
  const res = await authFetch(apiUrl('/knowledge/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error('搜索失败');
  const data = await res.json();
  return data.data || data.results || [];
}

export async function getChunks(docId: string): Promise<ChunkItem[]> {
  const res = await authFetch(apiUrl(`/knowledge/docs/${docId}/chunks`));
  if (!res.ok) throw new Error('获取分片失败');
  const data = await res.json();
  return data.data || [];
}
