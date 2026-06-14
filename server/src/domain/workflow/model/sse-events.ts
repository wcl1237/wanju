/**
 * SSE 事件协议 — 工作流执行过程中的所有事件类型定义
 *
 * 所有事件通过 `sseEvent()` 函数构建，保证格式统一。
 */

// ==================== 事件类型定义 ====================

export interface WorkflowStartEvent {
  type: 'workflow_start';
  workflowId: string;
  workflowName: string;
  workflowIcon: string;
  stepCount: number;
}

export interface WorkflowEndEvent {
  type: 'workflow_end';
  workflowId: string;
  workflowName: string;
  totalSteps: number;
  totalTimeMs: number;
}

export interface WorkflowStepEvent {
  type: 'workflow_step';
  stepIndex: number;
  nodeId: string;
  stepType: string;
  stepName: string;
  input?: any;
  result?: any;
  output?: any;
  params?: Record<string, string>;
  conditionResult?: boolean;
  error?: string;
  timeMs: number;
}

export interface WorkflowLLMEvent {
  type: 'workflow_llm';
  stage: 'start' | 'end';
  nodeId: string;
  purpose: string;
  input?: string;
  timeMs?: number;
}

export interface ContentEvent {
  type: 'content';
  content: string;
}

export interface ToolStartEvent {
  type: 'tool_start';
  tool: string;
  args: any;
  round?: number;
}

export interface ToolResultEvent {
  type: 'tool_result';
  tool: string;
  result: any;
  round?: number;
  timeMs?: number;
}

export interface WorkflowMatchEvent {
  type: 'workflow_match';
  workflowId: string;
  workflowName: string;
  workflowIcon: string;
  workflowMode: string;
  timeMs: number;
}

export interface WorkflowOutputEvent {
  type: 'workflow_output';
  content: string;
  mode: string;
}

export interface SkillMatchEvent {
  type: 'skill_match';
  skills: { id: string; name: string; icon: string }[];
}

export interface ThinkingEndEvent {
  type: 'thinking_end';
  round: number;
  content: string;
  timeMs: number;
}

export interface ErrorEvent {
  type: 'error';
  content: string;
}

export type SSEEvent =
  | WorkflowStartEvent
  | WorkflowEndEvent
  | WorkflowStepEvent
  | WorkflowLLMEvent
  | ContentEvent
  | ToolStartEvent
  | ToolResultEvent
  | WorkflowMatchEvent
  | WorkflowOutputEvent
  | SkillMatchEvent
  | ThinkingEndEvent
  | ErrorEvent;

// ==================== 事件构建工具 ====================

/** 将事件对象序列化为 SSE 格式字符串 */
export function sseEvent(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** 构建 workflow_step 事件 */
export function stepEvent(opts: Omit<WorkflowStepEvent, 'type'>): string {
  return sseEvent({ type: 'workflow_step', ...opts });
}

/** 构建 workflow_llm 事件 */
export function llmEvent(opts: Omit<WorkflowLLMEvent, 'type'>): string {
  return sseEvent({ type: 'workflow_llm', ...opts });
}

/** 构建 content 事件 */
export function contentEvent(content: string): string {
  return sseEvent({ type: 'content', content });
}

/** 构建 tool_start 事件 */
export function toolStartEvent(tool: string, args: any, round?: number): string {
  return sseEvent({ type: 'tool_start', tool, args, round });
}

/** 构建 tool_result 事件 */
export function toolResultEvent(tool: string, result: any, round?: number, timeMs?: number): string {
  return sseEvent({ type: 'tool_result', tool, result, round, timeMs });
}
