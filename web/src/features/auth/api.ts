import { apiUrl } from '../../shared/http-client';
import type { LoginDTO, AuthResponse } from './types';

export async function login(dto: LoginDTO): Promise<AuthResponse> {
  const res = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  return res.json();
}

export async function register(dto: LoginDTO): Promise<AuthResponse> {
  const res = await fetch(apiUrl('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  return res.json();
}

export async function logout(): Promise<void> {
  try {
    await fetch(apiUrl('/auth/logout'), { method: 'POST', credentials: 'same-origin' });
  } catch { /* ignore */ }
}
