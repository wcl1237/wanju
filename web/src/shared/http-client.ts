/**
 * HTTP 客户端 — Cookie 鉴权
 * 登录后后端设置 httpOnly cookie，浏览器自动携带
 */

const BASE_URL = '/api';

// ==================== User 存储 ====================

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

// ==================== 带鉴权的 fetch 封装 ====================

/**
 * 带鉴权的 fetch 封装
 * Cookie 由浏览器自动携带，无需手动设置 header
 * 401 时触发全局登出事件
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
  });

  if (res.status === 401) {
    removeUser();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  return res;
}

/**
 * 构建 API URL
 */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}
