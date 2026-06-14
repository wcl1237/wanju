/**
 * API 请求封装 — Cookie 鉴权
 * 登录后后端设置 httpOnly cookie，浏览器自动携带
 */

const BASE_URL = '/api';

// ==================== Auth 相关 ====================

export function getUser(): { id: string; username: string } | null {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user: { id: string; username: string }) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function removeUser() {
  localStorage.removeItem('user');
}

/**
 * 带鉴权的 fetch 封装
 * Cookie 由浏览器自动携带，无需手动设置 header
 * 401 时触发全局登出事件
 */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin', // 确保 cookie 自动携带
  });

  if (res.status === 401) {
    removeUser();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  return res;
}

// ==================== 接口类型 ====================

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
  createdAt: string;
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  preview: string;
  chunkCount: number;
  createdAt: string;
}

export interface SearchResult {
  docName: string;
  content: string;
  score: number;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'bug' | 'feature' | 'question' | 'complaint';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 对话 API ====================

export async function createConversation(): Promise<Conversation> {
  const res = await authFetch(`${BASE_URL}/chat/conversations`, { method: 'POST' });
  const data = await res.json();
  return data.data;
}

export async function getConversations(): Promise<Conversation[]> {
  const res = await authFetch(`${BASE_URL}/chat/conversations`);
  const data = await res.json();
  return data.data;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await authFetch(`${BASE_URL}/chat/conversations/${conversationId}/messages`);
  const data = await res.json();
  return data.data;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await authFetch(`${BASE_URL}/chat/conversations/${conversationId}`, { method: 'DELETE' });
}

export async function getHistory(
  conversationId: string,
  page = 1,
  pageSize = 20
): Promise<{ messages: Message[]; total: number; hasMore: boolean }> {
  const res = await authFetch(
    `${BASE_URL}/chat/conversations/${conversationId}/history?page=${page}&pageSize=${pageSize}`
  );
  const data = await res.json();
  return data.data;
}

/**
 * 发送消息（SSE 流式）
 */
export function sendMessage(
  conversationId: string,
  message: string,
  onEvent: (event: SSEEvent) => void,
  onDone: () => void,
  onError: (error: Error) => void
) {
  const abortController = new AbortController();

  fetch(`${BASE_URL}/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal: abortController.signal,
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (response.status === 401) {
        removeUser();
        window.dispatchEvent(new CustomEvent('auth:logout'));
        throw new Error('未登录');
      }
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            onDone();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            onEvent(parsed);
          } catch {
            // ignore parse errors
          }
        }
      }

      onDone();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError(err);
      }
    });

  return () => abortController.abort();
}

export interface SSEEvent {
  type: 'content' | 'tool_start' | 'tool_result' | 'thinking_end' | 'skill_match' | 'memory_init' | 'message_save' | 'memory_load' | 'workflow_match' | 'workflow_start' | 'workflow_step' | 'workflow_end' | 'error';
  content?: string;
  tool?: string;
  args?: any;
  result?: any;
  round?: number;
  hasToolCalls?: boolean;
  timeMs?: number;
  meta?: any;
  skills?: { id: string; name: string; icon: string }[];
}

// ==================== 知识库 API ====================

export async function getKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const res = await authFetch(`${BASE_URL}/knowledge/docs`);
  const data = await res.json();
  return data.data;
}

export async function uploadKnowledgeDoc(name: string, content: string): Promise<any> {
  const res = await authFetch(`${BASE_URL}/knowledge/docs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content }),
  });
  return await res.json();
}

export async function deleteKnowledgeDoc(id: string): Promise<void> {
  await authFetch(`${BASE_URL}/knowledge/docs/${id}`, { method: 'DELETE' });
}

export async function searchKnowledge(query: string): Promise<SearchResult[]> {
  const res = await authFetch(`${BASE_URL}/knowledge/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  return data.data;
}

// ==================== 工单 API ====================

export async function getTickets(status?: string): Promise<Ticket[]> {
  const url = status ? `${BASE_URL}/tickets?status=${status}` : `${BASE_URL}/tickets`;
  const res = await authFetch(url);
  const data = await res.json();
  return data.data;
}

export async function createTicket(ticket: {
  title: string;
  description: string;
  priority?: string;
  category?: string;
}): Promise<Ticket> {
  const res = await authFetch(`${BASE_URL}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticket),
  });
  const data = await res.json();
  return data.data;
}

export async function updateTicketStatus(id: string, status: string): Promise<Ticket> {
  const res = await authFetch(`${BASE_URL}/tickets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  return data.data;
}

// ==================== 技能相关 ====================

export interface Skill {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  prompt: string;
  icon: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getSkills(): Promise<Skill[]> {
  const res = await authFetch(`${BASE_URL}/skills`);
  const data = await res.json();
  return data.data;
}

export async function createSkill(skill: {
  name: string;
  description?: string;
  keywords: string[];
  prompt: string;
  icon?: string;
}): Promise<Skill> {
  const res = await authFetch(`${BASE_URL}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skill),
  });
  const data = await res.json();
  return data.data;
}

export async function updateSkill(id: string, skill: {
  name?: string;
  description?: string;
  keywords?: string[];
  prompt?: string;
  icon?: string;
  enabled?: boolean;
}): Promise<Skill> {
  const res = await authFetch(`${BASE_URL}/skills/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skill),
  });
  const data = await res.json();
  return data.data;
}

export async function deleteSkill(id: string): Promise<void> {
  await authFetch(`${BASE_URL}/skills/${id}`, { method: 'DELETE' });
}
