import { authFetch, apiUrl, removeUser } from '../../shared/http-client';
import type { Conversation, Message, SSEEvent } from './types';

export async function createConversation(blueprintId?: string): Promise<Conversation> {
  const res = await authFetch(apiUrl('/chat/conversations'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blueprintId }),
  });
  const data = await res.json();
  return data.data;
}

export async function getConversations(blueprintId?: string): Promise<Conversation[]> {
  const url = blueprintId
    ? apiUrl(`/chat/conversations?blueprintId=${blueprintId}`)
    : apiUrl('/chat/conversations');
  const res = await authFetch(url);
  const data = await res.json();
  return data.data;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await authFetch(apiUrl(`/chat/conversations/${conversationId}/messages`));
  const data = await res.json();
  return data.data;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await authFetch(apiUrl(`/chat/conversations/${conversationId}`), { method: 'DELETE' });
}

export async function getHistory(
  conversationId: string,
  page = 1,
  pageSize = 20
): Promise<{ messages: Message[]; total: number; hasMore: boolean }> {
  const res = await authFetch(
    apiUrl(`/chat/conversations/${conversationId}/history?page=${page}&pageSize=${pageSize}`)
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

  fetch(apiUrl(`/chat/conversations/${conversationId}/messages`), {
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

/** 查询工作流执行状态 */
export async function getWorkflowStatus(
  conversationId: string
): Promise<{ running: boolean; events: any[] }> {
  const res = await authFetch(apiUrl(`/chat/conversations/${conversationId}/wf-status`));
  const data = await res.json();
  return data.data;
}

/** 停止对话/工作流执行 */
export async function stopGeneration(conversationId: string): Promise<void> {
  await authFetch(apiUrl(`/chat/conversations/${conversationId}/stop`), { method: 'POST' });
}
