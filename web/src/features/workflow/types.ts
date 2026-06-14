// ==================== 图结构类型 ====================

export interface FlowNodeData {
  label?: string;
  triggerType?: 'keyword' | 'intent' | 'always' | 'regex';
  triggerDesc?: string;
  keywords?: string[];
  regexPattern?: string;
  expression?: string;
  conditionField?: string;
  conditionOp?: string;
  conditionValue?: string;
  replyText?: string;
  prompt?: string;
  params?: string[];
  extractPrompt?: string;
  query?: string;
  topK?: number;
  title?: string;
  category?: string;
  ticketPriority?: string;
  ticketDescription?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  isFinalReply?: boolean;
  agentId?: string;
  agentName?: string;
  agentIds?: string[];
  agentNames?: string[];
  masterAgentId?: string;
  masterAgentName?: string;
  subAgentIds?: string[];
  subAgentNames?: string[];
  _dir?: string; // 内部方向刷新标记
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface WorkflowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ==================== 工作流类型 ====================

export interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  triggerDescription: string;
  graph: WorkflowGraph;
  enabled: boolean;
  priority: number;
  mode?: 'independent' | 'replace_input';
  createdAt: string;
}

export interface CreateWorkflowDTO {
  name: string;
  triggerDescription?: string;
  graph: WorkflowGraph;
  mode?: string;
}

export interface UpdateWorkflowDTO {
  name?: string;
  triggerDescription?: string;
  graph?: WorkflowGraph;
  enabled?: boolean;
  mode?: string;
}

// ==================== 方向类型 ====================

export type FlowDirection = 'TB' | 'LR';
