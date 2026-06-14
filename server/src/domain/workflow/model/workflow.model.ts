/**
 * Workflow 工作流域 — 类型定义
 */

// ==================== 图结构类型 ====================

export interface FlowNodeData {
  label?: string;
  // trigger
  triggerType?: string; // 'keyword' | 'llm'
  keywords?: string[];
  // condition
  expression?: string;
  conditionField?: string;
  conditionOp?: string; // 'contains' | 'equals' | 'not_empty'
  conditionValue?: string;
  // reply
  replyText?: string;
  // llm_reply
  prompt?: string;
  // extract
  params?: string[];
  extractPrompt?: string;
  // knowledge
  query?: string;
  topK?: number;
  // ticket
  title?: string;
  category?: string;
  ticketPriority?: string;
  ticketDescription?: string;
  // http
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FlowNode {
  id: string;
  type: string; // trigger | reply | llm_reply | condition | knowledge | ticket | extract | http | end
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null; // 条件分支: 'true' | 'false'
  targetHandle?: string | null;
}

export interface WorkflowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  triggerDescription: string;
  graph: WorkflowGraph;
  enabled: boolean;
  mode: 'independent' | 'replace_input';
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowDTO {
  name: string;
  description?: string;
  icon?: string;
  triggerDescription: string;
  graph?: WorkflowGraph;
  mode?: 'independent' | 'replace_input';
  priority?: number;
}

export interface UpdateWorkflowDTO {
  name?: string;
  description?: string;
  icon?: string;
  triggerDescription?: string;
  graph?: WorkflowGraph;
  enabled?: boolean;
  mode?: 'independent' | 'replace_input';
  priority?: number;
}

/** 图遍历执行上下文 */
export interface ExecContext {
  params: Record<string, string>;
  results: Map<string, any>;
  userMessage: string;
  /** 上一个节点的输出（透传给结束节点） */
  lastOutput: string;
  /** 已经通过 content 事件发送的内容 */
  contentYielded: boolean;
}
