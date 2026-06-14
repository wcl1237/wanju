/**
 * Customer 客户域 — 类型定义
 */

export interface CustomerProfile {
  id: string;
  conversationId?: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  position?: string;
  requirement?: string;
  extra?: string;
  status: 'partial' | 'complete';
  createdAt: string;
  updatedAt: string;
}

export interface SaveCustomerInfoDTO {
  conversationId?: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  position?: string;
  requirement?: string;
  extra?: string;
}

/** 长期记忆类型 */
export type MemoryType = 'profile' | 'preference' | 'business' | 'context';

export interface MemoryResult {
  id: string;
  memory: string;
  score?: number;
  userId?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}
