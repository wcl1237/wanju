/**
 * Skill 技能域 — 类型定义
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  prompt: string;
  icon: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillDTO {
  name: string;
  description?: string;
  keywords: string[];
  prompt: string;
  icon?: string;
}

export interface UpdateSkillDTO {
  name?: string;
  description?: string;
  keywords?: string[];
  prompt?: string;
  icon?: string;
  enabled?: boolean;
}
