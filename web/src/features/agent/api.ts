import { authFetch, apiUrl } from '../../shared/http-client';
import type { Agent, CreateAgentDTO, UpdateAgentDTO } from './types';

export async function getAgents(): Promise<Agent[]> {
  const res = await authFetch(apiUrl('/agents'));
  const data = await res.json();
  return data.data || [];
}

export async function getAgent(id: string): Promise<Agent | null> {
  const res = await authFetch(apiUrl(`/agents/${id}`));
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function createAgent(dto: CreateAgentDTO): Promise<Agent> {
  const res = await authFetch(apiUrl('/agents'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  const data = await res.json();
  return data.data;
}

export async function updateAgent(id: string, dto: UpdateAgentDTO): Promise<Agent> {
  const res = await authFetch(apiUrl(`/agents/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  const data = await res.json();
  return data.data;
}

export async function deleteAgent(id: string): Promise<void> {
  await authFetch(apiUrl(`/agents/${id}`), { method: 'DELETE' });
}

export async function generateAgentPrompt(name: string, description: string): Promise<string> {
  const res = await authFetch(apiUrl('/agents/generate-prompt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  const data = await res.json();
  return data.data?.prompt || '';
}
