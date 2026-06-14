import { authFetch, apiUrl } from '../../shared/http-client';
import type { Skill, CreateSkillDTO, UpdateSkillDTO } from './types';

export async function getSkills(): Promise<Skill[]> {
  const res = await authFetch(apiUrl('/skills'));
  const data = await res.json();
  return data.data;
}

export async function createSkill(dto: CreateSkillDTO): Promise<Skill> {
  const res = await authFetch(apiUrl('/skills'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  const data = await res.json();
  return data.data;
}

export async function updateSkill(id: string, dto: UpdateSkillDTO): Promise<Skill> {
  const res = await authFetch(apiUrl(`/skills/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  const data = await res.json();
  return data.data;
}

export async function deleteSkill(id: string): Promise<void> {
  await authFetch(apiUrl(`/skills/${id}`), { method: 'DELETE' });
}
