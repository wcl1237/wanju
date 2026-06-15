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
  // start
  welcomeMessage?: string; // 开始节点的欢迎语
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
  responseText?: string;  // 节点执行后向对话窗口发送的固定反馈消息
  autoAIResponse?: boolean;  // 节点执行后让 AI 根据结果自动生成反馈
  aiResponsePrompt?: string; // AI 反馈的提示词（可选，留空使用默认）
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
  type: string; // start | trigger | reply | llm_reply | condition | knowledge | ticket | extract | http | end
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

// ==================== 领域行为 ====================

/**
 * 工作流领域模型 — 封装领域行为方法
 */
export class WorkflowDomain {
  constructor(private readonly workflow: Workflow) {}

  /** 获取入口节点（优先 start，兼容 trigger） */
  getEntryNode(): FlowNode | undefined {
    return this.workflow.graph.nodes.find(n => n.type === 'start')
      || this.workflow.graph.nodes.find(n => n.type === 'trigger');
  }

  /** 获取触发器节点 */
  getTriggerNode(): FlowNode | undefined {
    return this.workflow.graph.nodes.find(n => n.type === 'trigger');
  }

  /** 获取结束节点 */
  getEndNodes(): FlowNode[] {
    return this.workflow.graph.nodes.filter(n => n.type === 'end');
  }

  /** 获取触发类型 */
  getTriggerType(): string {
    const trigger = this.getTriggerNode();
    return trigger?.data?.triggerType || 'intent';
  }

  /** 验证工作流图结构 */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const { nodes, edges } = this.workflow.graph;

    if (nodes.length === 0) {
      errors.push('工作流至少需要一个节点');
    }

    const entry = this.getEntryNode();
    if (!entry) {
      errors.push('缺少入口节点（开始节点或触发器节点）');
    }

    const endNodes = this.getEndNodes();
    if (endNodes.length === 0) {
      errors.push('缺少结束节点');
    }

    // 检查孤立节点（没有入边也没有出边，且不是 trigger）
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }
    for (const node of nodes) {
      if (node.type !== 'trigger' && node.type !== 'start' && !connectedNodeIds.has(node.id)) {
        errors.push(`节点 "${node.data.label || node.id}" 未连接到任何边`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /** 是否可以执行 */
  canExecute(): boolean {
    return this.workflow.enabled && this.getEntryNode() !== undefined;
  }

  /** 包装的原始数据 */
  get data(): Workflow {
    return this.workflow;
  }
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
  /** 全局执行步数计数器（防止无限循环） */
  _stepCount?: number;
}
