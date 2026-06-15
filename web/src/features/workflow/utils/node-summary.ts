/**
 * 节点摘要文本生成 — 在节点卡片上显示简短描述
 */

import { TRIGGER_TYPE_LABELS } from '../constants/node-types';

export function getNodeSummary(type: string, data: Record<string, any>): string {
  switch (type) {
    case 'trigger': {
      const tt = data.triggerType || 'intent';
      const label = TRIGGER_TYPE_LABELS[tt] || '触发条件';
      if (tt === 'keyword' && data.keywords?.length) return `${label}：${data.keywords.slice(0, 3).join(', ')}`;
      if (tt === 'regex' && data.regexPattern) return `${label}：/${data.regexPattern.slice(0, 16)}/`;
      if (tt === 'always') return label;
      if (tt === 'intent' && data.triggerDesc) return `${label}：${data.triggerDesc.slice(0, 20)}`;
      return label;
    }
    case 'start': return '工作流入口，接收用户消息';
    case 'end': return '流程终止节点';
    case 'extract': return data.params?.length ? `提取: ${data.params.join(', ')}` : '';
    case 'condition': return data.conditionField ? `${data.conditionField} ${data.conditionOp || '?'} ${data.conditionValue || ''}` : '';
    case 'reply': return data.replyText ? data.replyText.slice(0, 30) + (data.replyText.length > 30 ? '...' : '') : '';
    case 'llm_reply': return data.prompt ? data.prompt.slice(0, 30) + '...' : 'AI 生成回复';
    case 'knowledge': return data.query ? `查询: ${data.query.slice(0, 20)}` : '搜索知识库';
    case 'ticket': return data.title || '创建工单';
    case 'http': return data.url ? `${data.method || 'GET'} ${data.url.slice(0, 25)}` : '';
    case 'agent': return data.agentName ? `Agent: ${data.agentName}` : '未选择 Agent';
    case 'agent_team': return data.agentNames?.length ? `团队: ${data.agentNames.join(', ')}` : '未选择 Agent';
    case 'master_sub_agent': {
      const master = data.masterAgentName || '未选择';
      const subCount = data.subAgentIds?.length || 0;
      return `👑 ${master} + ${subCount} Sub`;
    }
    default: return '';
  }
}
