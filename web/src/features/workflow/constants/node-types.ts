/**
 * 工作流节点类型元数据 — 定义所有支持的节点类型
 */

export interface NodeTypeMeta {
  icon: string;
  label: string;
  color: string;
  desc: string;
}

export const NODE_TYPES_META: Record<string, NodeTypeMeta> = {
  trigger: { icon: '⚡', label: '触发器', color: '#10b981', desc: '工作流起始入口' },
  end: { icon: '🏁', label: '结束', color: '#b2a9a9ff', desc: '工作流终止节点' },
  reply: { icon: '💬', label: '消息回复', color: '#3b82f6', desc: '发送固定文本回复' },
  llm_reply: { icon: '🤖', label: 'AI 生成', color: '#a855f7', desc: 'LLM 生成动态回复' },
  agent: { icon: '🧑‍💼', label: '单 Agent', color: '#8b5cf6', desc: '调用 Agent 池中的 Agent' },
  agent_team: { icon: '👥', label: 'Agent Teams', color: '#0ea5e9', desc: '多 Agent 并行协作' },
  master_sub_agent: { icon: '👑', label: 'Master-Sub', color: '#d946ef', desc: 'Master 编排 Sub Agent' },
  condition: { icon: '🔀', label: '条件分支', color: '#f59e0b', desc: '根据条件走不同分支' },
  knowledge: { icon: '📚', label: '知识检索', color: '#06b6d4', desc: '搜索知识库' },
  ticket: { icon: '🎫', label: '创建工单', color: '#ec4899', desc: '创建客服工单' },
  extract: { icon: '📝', label: '参数提取', color: '#f97316', desc: '从消息提取关键参数' },
  http: { icon: '🌐', label: 'HTTP 请求', color: '#64748b', desc: '调用外部 API' },
};

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  keyword: '🔑 关键词匹配',
  intent: '🧠 意图识别',
  always: '🔄 始终触发',
  regex: '📐 正则匹配',
};
