/**
 * Agent 域 — 类型定义
 */

export interface Agent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  actions: string[];     // 可用 action 名称列表
  skillIds: string[];    // 可触发技能 ID，空 = 全部
  workflowIds: string[]; // 可触发工作流 ID，空 = 全部
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
  skillIds?: string[];
  workflowIds?: string[];
  icon?: string;
}

export interface UpdateAgentDTO {
  name?: string;
  description?: string;
  prompt?: string;
  actions?: string[];
  skillIds?: string[];
  workflowIds?: string[];
  icon?: string;
  enabled?: boolean;
}
