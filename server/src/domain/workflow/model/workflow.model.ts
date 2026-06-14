/**
 * Workflow 工作流域 — 类型定义
 */

// ==================== 图结构类型 ====================

export interface FlowNodeData {
  label?: string;
  // trigger
  triggerType?: 'keyword' | 'intent' | 'always' | 'regex'; // 触发类型
  keywords?: string[];
  regexPattern?: string; // 正则匹配表达式
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
  // 通用
  isFinalReply?: boolean; // 标记此节点输出为工作流最终回复
  // agent
  agentId?: string; // Agent 池中的 Agent ID
  // agent_team
  agentIds?: string[];       // Agent Teams: 多选 Agent ID
  agentNames?: string[];     // Agent Teams: 对应名称（用于卡片摘要）
  // master_sub_agent
  masterAgentId?: string;    // Master Agent ID
  masterAgentName?: string;
  subAgentIds?: string[];    // Sub Agent ID 列表
  subAgentNames?: string[];  // Sub Agent 名称列表
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
  /** 标记为“最终回复”的节点输出，后面的覆盖前面的 */
  finalReplyContent?: string;
}
