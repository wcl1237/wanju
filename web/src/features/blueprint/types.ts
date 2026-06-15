/**
 * Blueprint 前端类型定义
 */

export type RuntimeType = 'react' | 'workflow' | 'harness';

export interface AgentBlueprint {
  id: string;
  name: string;
  description: string;
  icon: string;
  runtimeType: RuntimeType;
  config: any;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBlueprintDTO {
  name: string;
  description?: string;
  icon?: string;
  runtimeType: RuntimeType;
  config: any;
  isDefault?: boolean;
}

export interface UpdateBlueprintDTO {
  name?: string;
  description?: string;
  icon?: string;
  config?: any;
  enabled?: boolean;
  isDefault?: boolean;
}

export const RUNTIME_TYPE_META: Record<RuntimeType, { label: string; icon: string; color: string; desc: string }> = {
  react: { label: 'ReAct Agent', icon: '🧠', color: '#8b5cf6', desc: 'ReAct 推理循环，可绑定 Agent，支持工具/技能/工作流' },
  workflow: { label: '工作流', icon: '🔄', color: '#10b981', desc: '直接执行绑定的工作流，适合固定流程的场景' },
  harness: { label: '编排链', icon: '🔗', color: '#f59e0b', desc: '自定义步骤链，支持条件分支和循环，动态编排' },
};
