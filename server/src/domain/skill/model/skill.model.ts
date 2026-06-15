/**
 * Skill 技能域 — 类型定义
 *
 * Skill 是用户可配置的 Agent Tool（Function Calling），
 * 本质是 Prompt-based Tool：LLM 决定调用 → 提取参数 → 渲染 prompt → 调 LLM 生成结果。
 */

// ==================== 参数定义 ====================

export interface SkillParameter {
  /** 参数名（对应 prompt 模板中的 {{name}}） */
  name: string;
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean';
  /** 参数描述（给 LLM 看的，用于 Function Calling） */
  description: string;
  /** 是否必填 */
  required: boolean;
}

// ==================== Skill 模型 ====================

export interface Skill {
  id: string;
  /** 技能名称 */
  name: string;
  /** Tool 描述 — 告诉 LLM 何时调用此技能（pushy 风格，覆盖多种触发场景） */
  description: string;
  /** 可选标签（不再用于自动触发，仅用于 UI 分类和搜索） */
  tags: string[];
  /** 执行 Prompt 模板，支持 {{param}} 占位符 */
  prompt: string;
  /** Tool 输入参数定义（构建 Function Calling JSON Schema） */
  parameters: SkillParameter[];
  /** 可选的输出格式模板（留空则 LLM 自由回复） */
  outputTemplate: string;
  /** 图标 */
  icon: string;
  /** 是否启用 */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==================== DTO ====================

export interface CreateSkillDTO {
  name: string;
  description: string;
  tags?: string[];
  prompt: string;
  parameters?: SkillParameter[];
  outputTemplate?: string;
  icon?: string;
}

export interface UpdateSkillDTO {
  name?: string;
  description?: string;
  tags?: string[];
  prompt?: string;
  parameters?: SkillParameter[];
  outputTemplate?: string;
  icon?: string;
  enabled?: boolean;
}
