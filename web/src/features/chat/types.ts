export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface Message {
  id: string;
  conversationId?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  createdAt: string;
  traceSteps?: TraceStepInMessage[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments?: string;
  result?: string;
}

export interface TraceStepInMessage {
  tool: string;
  status: string;
  args?: any;
  result?: any;
  thinking?: string;
  round?: number;
  timeMs?: number;
  [key: string]: any;
}

export interface SSEEvent {
  type: 'content' | 'content_chunk' | 'content_stream_start' | 'content_stream_end' | 'content_saved' | 'tool_start' | 'tool_result' | 'thinking_end' | 'skill_match' | 'memory_init' | 'message_save' | 'memory_load' | 'workflow_match' | 'workflow_start' | 'workflow_step' | 'workflow_end' | 'workflow_llm' | 'workflow_output' | 'workflow_complete' | 'error';
  content?: string;
  tool?: string;
  args?: any;
  result?: any;
  round?: number;
  hasToolCalls?: boolean;
  timeMs?: number;
  meta?: any;
  messageId?: string;
  skills?: { id: string; name: string; icon: string }[];
}

export interface ToolStatus {
  type?: string;
  tool?: string;
  status?: 'running' | 'done';
  args?: any;
  result?: any;
  thinking?: string;
  round?: number;
  timeMs?: number;
  content?: string;
  [key: string]: any;
}
