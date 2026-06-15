import { authFetch, apiUrl } from '../../shared/http-client';
import type { Workflow, CreateWorkflowDTO, UpdateWorkflowDTO } from './types';

export async function getWorkflows(): Promise<Workflow[]> {
  const res = await authFetch(apiUrl('/workflows'));
  const data = await res.json();
  return data.data || [];
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  const res = await authFetch(apiUrl(`/workflows/${id}`));
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function createWorkflow(dto: CreateWorkflowDTO): Promise<{ id: string }> {
  const res = await authFetch(apiUrl('/workflows'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  const json = await res.json();
  return json.data;
}

export async function updateWorkflow(id: string, dto: UpdateWorkflowDTO): Promise<void> {
  await authFetch(apiUrl(`/workflows/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export async function deleteWorkflow(id: string): Promise<void> {
  await authFetch(apiUrl(`/workflows/${id}`), { method: 'DELETE' });
}

export async function generateWorkflow(requirement: string): Promise<{ success: boolean; data?: any; message?: string }> {
  const res = await authFetch(apiUrl('/workflows/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requirement }),
  });
  return res.json();
}
