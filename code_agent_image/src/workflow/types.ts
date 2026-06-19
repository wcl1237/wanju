/**
 * Workflow Engine — 工作流类型定义
 *
 * 定义从主应用推送过来的工作流结构，以及内部执行状态。
 */

// ─── 工作流定义（来自主应用推送）─────────────────────────────

/** 完整的工作流定义 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  /** 初始变量 */
  variables: Record<string, unknown>;
  /** 执行上下文 */
  context: WorkflowContext;
}

export interface WorkflowContext {
  projectPath: string;
  userId: string;
  blueprintId?: string;
  conversationId?: string;
  /** 从主应用传入的额外上下文信息 */
  metadata?: Record<string, unknown>;
}

// ─── 步骤定义 ─────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  type: StepType;
  name: string;
  description?: string;
  config: StepConfig;
  /** 后续步骤 ID 列表 */
  nextSteps: string[];
  /** 失败处理策略 */
  onFailure?: 'retry' | 'skip' | 'ask_user' | 'abort';
  /** 最大重试次数（默认 2） */
  maxRetries?: number;
}

export type StepType =
  | 'agent_task'
  | 'bash_command'
  | 'file_operation'
  | 'decision_point'
  | 'condition'
  | 'parallel';

export type StepConfig =
  | AgentTaskConfig
  | BashCommandConfig
  | FileOperationConfig
  | DecisionPointConfig
  | ConditionConfig
  | ParallelConfig;

export interface AgentTaskConfig {
  type: 'agent_task';
  /** Agent 执行的任务 Prompt */
  prompt: string;
  /** 可用工具名称列表（为空则使用全部工具） */
  tools?: string[];
  /** 最大 ReAct 轮次 */
  maxTurns?: number;
  /** 额外系统提示 */
  systemPromptAppend?: string;
}

export interface BashCommandConfig {
  type: 'bash_command';
  command: string;
  /** 命令执行超时（ms） */
  timeout?: number;
  /** 期望的退出码（默认 0） */
  expectedExitCode?: number;
}

export interface FileOperationConfig {
  type: 'file_operation';
  action: 'create' | 'edit' | 'delete' | 'read';
  path: string;
  content?: string;
}

export interface DecisionPointConfig {
  type: 'decision_point';
  question: string;
  options?: string[];
  context?: string;
  /** 超时后的默认选择 */
  defaultChoice?: string;
}

export interface ConditionConfig {
  type: 'condition';
  /** 条件表达式（基于工作流变量） */
  expression: string;
  /** 条件为真时的下一步 ID */
  trueBranch: string;
  /** 条件为假时的下一步 ID */
  falseBranch: string;
}

export interface ParallelConfig {
  type: 'parallel';
  /** 并行执行的子步骤 ID */
  subSteps: string[];
  /** 是否等待所有子步骤完成（默认 true） */
  waitAll?: boolean;
}

// ─── 执行状态 ─────────────────────────────────────────────

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'paused'      // 等待用户决策
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowExecutionState {
  workflowId: string;
  status: WorkflowStatus;
  currentStepIndex: number;
  /** 工作流变量（步骤间共享，步骤可读写） */
  variables: Record<string, unknown>;
  /** 每个步骤的执行结果 */
  stepResults: Map<string, StepResult>;
  /** 用户决策记录 */
  decisionLog: DecisionRecord[];
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 错误信息 */
  error?: string;
}

export interface StepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: string;
  artifacts?: Array<{ path: string; action: string }>;
  error?: string;
  startTime: number;
  endTime?: number;
  /** 该步骤更新的变量 */
  updatedVariables?: Record<string, unknown>;
}

export interface DecisionRecord {
  decisionId: string;
  stepId: string;
  question: string;
  choice: string;
  timestamp: number;
}
