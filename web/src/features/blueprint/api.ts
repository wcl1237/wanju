import { authFetch } from '../../shared/http-client';
import type { AgentBlueprint, CreateBlueprintDTO, UpdateBlueprintDTO } from './types';

export async function getBlueprints(): Promise<AgentBlueprint[]> {
  const res = await authFetch('/api/blueprints');
  const data = await res.json();
  return data.data || [];
}

export async function getBlueprint(id: string): Promise<AgentBlueprint> {
  const res = await authFetch(`/api/blueprints/${id}`);
  const data = await res.json();
  return data.data;
}

export async function createBlueprint(dto: CreateBlueprintDTO): Promise<AgentBlueprint> {
  const res = await authFetch('/api/blueprints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  const data = await res.json();
  return data.data;
}

export async function updateBlueprint(id: string, dto: UpdateBlueprintDTO): Promise<AgentBlueprint> {
  const res = await authFetch(`/api/blueprints/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  const data = await res.json();
  return data.data;
}

export async function deleteBlueprint(id: string): Promise<void> {
  await authFetch(`/api/blueprints/${id}`, { method: 'DELETE' });
}
