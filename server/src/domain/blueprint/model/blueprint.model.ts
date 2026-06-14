/**
 * AgentBlueprint 领域模型 — 智能体蓝图
 *
 * 智能体蓝图是可部署的智能体单元，定义了智能体的运行时类型、配置、能力。
 * 例如「智能对话」就是一个 runtimeType='react' 的 AgentBlueprint 实例。
 */

// ==================== 运行时类型 ====================

export type RuntimeType = 'react' | 'workflow' | 'harness' | 'standalone';

// ==================== 运行时配置 ====================

/**
 * ReAct 运行时配置 — 完整的 ReAct Agent（当前「智能对话」）
 */
export interface ReactRuntimeConfig {
  systemPrompt: string;
  actions: string[];
  skillIds: string[];             // 空 = 匹配所有启用技能
  workflowIds: string[];          // 空 = 匹配所有启用工作流
  maxRounds: number;
  temperature: number;
  enableMemory: boolean;
  enableCustomerCollection: boolean;
}

/**
 * Workflow 运行时配置 — 直接执行绑定的工作流
 */
export interface WorkflowRuntimeConfig {
  workflowId: string;
  fallbackPrompt: string;
}

/**
 * Harness 运行时配置 — 可编排的处理链
 * 支持 linear（顺序）、condition（条件分支）、loop（循环）
 */
export interface HarnessRuntimeConfig {
  chain: HarnessStep[];
}

export type HarnessStepType = 'llm' | 'action' | 'workflow' | 'agent' | 'condition' | 'loop';

export interface HarnessStep {
  id: string;
  type: HarnessStepType;
  name: string;
  config: HarnessStepConfig;
}

/** LLM 步骤 */
export interface LlmStepConfig {
  prompt: string;
  temperature?: number;
  outputKey: string;              // 输出存入上下文的 key
}

/** Action 步骤 */
export interface ActionStepConfig {
  actionName: string;
  argsTemplate: Record<string, string>; // 参数模板，支持 {{variable}}
  outputKey: string;
}

/** Workflow 步骤 */
export interface WorkflowStepConfig {
  workflowId: string;
  outputKey: string;
}

/** Agent 步骤 — 调用 Agent 池中的 Agent */
export interface AgentStepConfig {
  agentId: string;
  taskPrompt: string;             // 任务描述模板
  outputKey: string;
}

/** Condition 步骤 — 条件分支 */
export interface ConditionStepConfig {
  expression: string;             // 条件表达式，如 "{{sentiment}} == 'negative'"
  trueSteps: HarnessStep[];       // 条件为 true 时执行的步骤
  falseSteps: HarnessStep[];      // 条件为 false 时执行的步骤
}

/** Loop 步骤 — 循环 */
export interface LoopStepConfig {
  maxIterations: number;
  breakCondition: string;         // 退出条件表达式
  steps: HarnessStep[];           // 循环体
}

export type HarnessStepConfig =
  | LlmStepConfig
  | ActionStepConfig
  | WorkflowStepConfig
  | AgentStepConfig
  | ConditionStepConfig
  | LoopStepConfig;

/**
 * Standalone 运行时配置 — 从 Agent 池选择一个 Agent 直接对话
 */
export interface StandaloneRuntimeConfig {
  agentId: string;
  actions: string[];
  skillIds: string[];     // 可触发技能 ID
  workflowIds: string[];  // 可触发工作流 ID
}

/** 统一运行时配置 */
export type RuntimeConfig =
  | ReactRuntimeConfig
  | WorkflowRuntimeConfig
  | HarnessRuntimeConfig
  | StandaloneRuntimeConfig;

// ==================== AgentBlueprint ====================

export interface AgentBlueprint {
  id: string;
  name: string;
  description: string;
  icon: string;
  runtimeType: RuntimeType;
  config: RuntimeConfig;
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
  config: RuntimeConfig;
  isDefault?: boolean;
}

export interface UpdateBlueprintDTO {
  name?: string;
  description?: string;
  icon?: string;
  config?: RuntimeConfig;
  enabled?: boolean;
  isDefault?: boolean;
}

// ==================== 默认蓝图常量 ====================

export const DEFAULT_BLUEPRINT_ID = 'default-chat-agent';

export const DEFAULT_REACT_CONFIG: ReactRuntimeConfig = {
  systemPrompt: `你是一个专业的智能客服助手，配备了先进的 RAG（检索增强生成）知识库系统。你的职责包括：
1. 友好、专业地回答用户的问题
2. 当需要查询相关信息时，使用知识库搜索工具
3. 当用户需要反馈问题或提出需求时，帮助创建工单
4. 使用简洁明了的中文回答

请注意：
- 回答要准确、有帮助，优先基于知识库检索到的内容回答
- 引用知识库信息时，说明信息来源
- 如果知识库中没有找到相关信息，请诚实告知并建议创建工单
- 创建工单时，请从用户描述中提取关键信息
- 不要在回复中使用<think>标签或展示思考过程`,
  actions: ['search_knowledge', 'create_ticket', 'save_customer_info'],
  skillIds: [],
  workflowIds: [],
  maxRounds: 10,
  temperature: 0.7,
  enableMemory: true,
  enableCustomerCollection: true,
};
