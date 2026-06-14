/**
 * Agent 域 — 类型定义
 */

export interface Agent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  actions: string[]; // 可用 action 名称列表
  icon: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentDTO {
  name: string;
  description?: string;
  prompt?: string;
  actions?: string[];
  icon?: string;
}

export interface UpdateAgentDTO {
  name?: string;
  description?: string;
  prompt?: string;
  actions?: string[];
  icon?: string;
  enabled?: boolean;
}
