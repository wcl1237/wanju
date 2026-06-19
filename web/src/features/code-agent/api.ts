/**
 * Code Agent — API 调用层
 */
import { authFetch, apiUrl } from '../../shared/http-client';

/** 启动 Code Agent 容器 */
export async function startCodeAgent(): Promise<{ success: boolean; data?: any; message?: string }> {
  const res = await authFetch(apiUrl('/code-agent/start'), { method: 'POST' });
  return res.json();
}

/** 停止 Code Agent 容器 */
export async function stopCodeAgent(sessionId: string): Promise<{ success: boolean; message?: string }> {
  const res = await authFetch(apiUrl('/code-agent/stop'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return res.json();
}

/** 销毁 Code Agent 容器 */
export async function destroyCodeAgent(sessionId: string): Promise<{ success: boolean; message?: string }> {
  const res = await authFetch(apiUrl('/code-agent/destroy'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return res.json();
}

/** 查询 Code Agent 状态 */
export async function getCodeAgentStatus(): Promise<{ success: boolean; data?: any }> {
  const res = await authFetch(apiUrl('/code-agent/status'));
  return res.json();
}

/** 推送工作流到 Code Agent */
export async function pushWorkflow(sessionId: string, workflow: any): Promise<{ success: boolean; data?: any; message?: string }> {
  const res = await authFetch(apiUrl('/code-agent/workflow/push'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, workflow }),
  });
  return res.json();
}

// ─── 消息查询（代理到容器） ────────────────────────

/**
 * 获取会话消息历史（从容器获取）
 * 返回 { success, data: StoredMessage[], streaming: boolean }
 */
export async function getCodeAgentMessages(sessionId: string): Promise<{
  success: boolean;
  data?: any[];
  streaming?: boolean;
  message?: string;
}> {
  const res = await authFetch(apiUrl(`/code-agent/messages?sessionId=${sessionId}`));
  return res.json();
}

