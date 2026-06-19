/**
 * Code Agent — 类型定义
 */

export type CodeAgentStatus = 'unstarted' | 'starting' | 'running' | 'reconnecting' | 'failed' | 'superseded';

export interface CodeAgentSession {
  id: string;
  containerId: string;
  hostPort: number;
  status: string;
}

export interface CodeAgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** 工具调用列表（Agent 消息） */
  toolCalls?: ToolCallInfo[];
  /** 是否正在流式输出 */
  isStreaming?: boolean;
  /** 决策请求（需要用户响应） */
  decision?: DecisionInfo;
}

export interface ToolCallInfo {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: { success: boolean; output: string };
  timeMs?: number;
  status: 'running' | 'completed' | 'failed';
}

export interface DecisionInfo {
  decisionId: string;
  question: string;
  options?: string[];
  context: string;
  timeout?: number;
  responded?: boolean;
}

export interface WorkflowStepInfo {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface WorkflowProgress {
  workflowId: string;
  steps: WorkflowStepInfo[];
  currentStepIndex: number;
  percent: number;
  message: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}
