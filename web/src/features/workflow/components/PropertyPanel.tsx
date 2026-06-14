import React from 'react';
import type { Node } from '@xyflow/react';
import { NODE_TYPES_META } from '../constants/node-types';
import { panelStyles } from '../styles/panel.styles';
import type { Agent } from '../../agent/types';

interface PropertyPanelProps {
  node: Node | null;
  onUpdate: (id: string, data: Record<string, any>) => void;
  agents: Agent[];
}

/** 右侧属性面板 — 根据节点类型路由到对应面板 */
const PropertyPanel: React.FC<PropertyPanelProps> = ({ node, onUpdate, agents }) => {
  if (!node) {
    return (
      <div style={panelStyles.empty}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👈</div>
        <div style={{ fontWeight: 600 }}>点击节点编辑属性</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>从左侧拖拽节点到画布，点击节点查看和修改配置</div>
      </div>
    );
  }

  const meta = NODE_TYPES_META[node.type || ''] || NODE_TYPES_META.trigger;
  const data = (node.data || {}) as Record<string, any>;
  const update = (patch: Record<string, any>) => onUpdate(node.id, { ...data, ...patch });

  return (
    <div style={panelStyles.container}>
      {/* 头部 */}
      <div style={panelStyles.header}>
        <span style={{ ...panelStyles.headerIcon, background: `${meta.color}20`, color: meta.color }}>{meta.icon}</span>
        <div>
          <div style={{ ...panelStyles.headerType, color: meta.color }}>{meta.label}</div>
          <div style={panelStyles.headerDesc}>{meta.desc}</div>
          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginTop: 4 }}>{node.id}</div>
        </div>
      </div>

      {/* 触发器面板 */}
      {node.type === 'trigger' && <TriggerFields data={data} update={update} />}

      {/* 参数提取 */}
      {node.type === 'extract' && (
        <>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>提取参数（逗号分隔）</label>
            <input style={panelStyles.input} value={(data.params || []).join(', ')}
              onChange={e => update({ params: e.target.value.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) })}
              placeholder="订单号, 退款原因" />
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>提取指导</label>
            <textarea style={panelStyles.textarea} value={data.extractPrompt || ''} onChange={e => update({ extractPrompt: e.target.value })} placeholder="额外提取指导说明" rows={2} />
          </div>
        </>
      )}

      {/* 条件分支 */}
      {node.type === 'condition' && (
        <>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>判断字段</label>
            <input style={panelStyles.input} value={data.conditionField || ''} onChange={e => update({ conditionField: e.target.value })} placeholder="userMessage 或参数名" />
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>操作符</label>
            <select style={panelStyles.select} value={data.conditionOp || 'contains'} onChange={e => update({ conditionOp: e.target.value })}>
              <option value="contains">contains 包含</option>
              <option value="equals">equals 等于</option>
              <option value="not_empty">not_empty 非空</option>
              <option value="has_result">has_result 有结果</option>
            </select>
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>比较值</label>
            <input style={panelStyles.input} value={data.conditionValue || ''} onChange={e => update({ conditionValue: e.target.value })} placeholder="比较值" />
          </div>
        </>
      )}

      {/* 回复 */}
      {node.type === 'reply' && (
        <div style={panelStyles.field}>
          <label style={panelStyles.label}>回复文本</label>
          <textarea style={panelStyles.textarea} value={data.replyText || ''} onChange={e => update({ replyText: e.target.value })} placeholder="支持 {{参数名}} 占位符" rows={4} />
        </div>
      )}

      {/* AI 生成 */}
      {node.type === 'llm_reply' && (
        <div style={panelStyles.field}>
          <label style={panelStyles.label}>生成提示词</label>
          <textarea style={panelStyles.textarea} value={data.prompt || ''} onChange={e => update({ prompt: e.target.value })} placeholder="根据工作流执行结果，生成友好的用户回复" rows={4} />
        </div>
      )}

      {/* 知识检索 */}
      {node.type === 'knowledge' && (
        <>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>检索查询</label>
            <input style={panelStyles.input} value={data.query || ''} onChange={e => update({ query: e.target.value })} placeholder="留空则使用用户原始消息" />
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>返回条数</label>
            <input style={panelStyles.input} type="number" value={data.topK || 3} onChange={e => update({ topK: parseInt(e.target.value) || 3 })} />
          </div>
        </>
      )}

      {/* 工单 */}
      {node.type === 'ticket' && <TicketFields data={data} update={update} />}

      {/* HTTP */}
      {node.type === 'http' && <HttpFields data={data} update={update} />}

      {/* Agent */}
      {node.type === 'agent' && <AgentFields data={data} update={update} agents={agents} />}

      {/* Agent Team */}
      {node.type === 'agent_team' && <AgentTeamFields data={data} update={update} agents={agents} />}

      {/* Master-Sub */}
      {node.type === 'master_sub_agent' && <MasterSubFields data={data} update={update} agents={agents} />}

      {/* 最终回复开关 */}
      {node.type !== 'trigger' && node.type !== 'end' && (
        <FinalReplyToggle isFinal={!!data.isFinalReply} onToggle={() => update({ isFinalReply: !data.isFinalReply })} />
      )}
    </div>
  );
};

// ==================== 子面板组件 ====================

const TriggerFields: React.FC<{ data: any; update: (p: any) => void }> = ({ data, update }) => {
  const triggerType = data.triggerType || 'intent';
  const triggerTypes = ['keyword', 'intent', 'always', 'regex'] as const;
  const colors: Record<string, string> = { keyword: '#f59e0b', intent: '#a855f7', always: '#10b981', regex: '#3b82f6' };
  const icons: Record<string, string> = { keyword: '🔑', intent: '🧠', always: '🔄', regex: '📐' };
  const labels: Record<string, string> = { keyword: '关键词匹配', intent: '意图识别', always: '始终触发', regex: '正则匹配' };
  const descs: Record<string, string> = {
    keyword: '消息包含指定关键词时触发', intent: 'AI 根据语义理解匹配用户意图',
    always: '收到任何消息都触发此工作流', regex: '消息匹配正则表达式时触发',
  };

  return (
    <>
      <div style={panelStyles.field}>
        <label style={panelStyles.label}>触发类型</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {triggerTypes.map(tt => {
            const selected = triggerType === tt;
            return (
              <label key={tt} style={{
                ...panelStyles.radioLabel,
                borderColor: selected ? colors[tt] : 'rgba(255,255,255,0.06)',
                background: selected ? `${colors[tt]}10` : 'transparent',
              }} onClick={() => update({ triggerType: tt })}>
                <div style={{ ...panelStyles.radioDot, border: `2px solid ${selected ? colors[tt] : '#475569'}`, background: selected ? colors[tt] : 'transparent' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: selected ? colors[tt] : '#e2e8f0' }}>{icons[tt]} {labels[tt]}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{descs[tt]}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>
      {triggerType === 'keyword' && (
        <div style={panelStyles.field}>
          <label style={panelStyles.label}>关键词（逗号分隔）</label>
          <input style={panelStyles.input} value={(data.keywords || []).join(', ')}
            onChange={e => update({ keywords: e.target.value.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) })}
            placeholder="退款, 取消订单, 退货" />
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>消息中包含任一关键词即触发</div>
        </div>
      )}
      {triggerType === 'intent' && (
        <div style={panelStyles.field}>
          <label style={panelStyles.label}>触发条件描述</label>
          <textarea style={panelStyles.textarea} value={data.triggerDesc || ''}
            onChange={e => update({ triggerDesc: e.target.value })}
            placeholder="描述什么场景触发此工作流，如：用户要求退款或取消订单" rows={3} />
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>AI 根据此描述智能匹配用户意图</div>
        </div>
      )}
      {triggerType === 'regex' && (
        <div style={panelStyles.field}>
          <label style={panelStyles.label}>正则表达式</label>
          <input style={{ ...panelStyles.input, fontFamily: 'monospace' }} value={data.regexPattern || ''}
            onChange={e => update({ regexPattern: e.target.value })}
            placeholder="^(退款|取消).*(订单|申请)" />
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>使用 JavaScript 正则语法，不区分大小写</div>
        </div>
      )}
      {triggerType === 'always' && (
        <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.08)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)' }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>⚡ 始终触发模式</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>该工作流将在收到任何消息时自动触发，请谨慎使用。</div>
        </div>
      )}
    </>
  );
};

const TicketFields: React.FC<{ data: any; update: (p: any) => void }> = ({ data, update }) => (
  <>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>工单标题</label>
      <input style={panelStyles.input} value={data.title || ''} onChange={e => update({ title: e.target.value })} placeholder="退款申请 - {{订单号}}" />
    </div>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>分类</label>
      <select style={panelStyles.select} value={data.category || 'general'} onChange={e => update({ category: e.target.value })}>
        <option value="general">general 通用</option>
        <option value="refund">refund 退款</option>
        <option value="complaint">complaint 投诉</option>
        <option value="inquiry">inquiry 咨询</option>
      </select>
    </div>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>优先级</label>
      <select style={panelStyles.select} value={data.ticketPriority || 'medium'} onChange={e => update({ ticketPriority: e.target.value })}>
        <option value="low">低</option>
        <option value="medium">中</option>
        <option value="high">高</option>
      </select>
    </div>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>描述</label>
      <textarea style={panelStyles.textarea} value={data.ticketDescription || ''} onChange={e => update({ ticketDescription: e.target.value })} rows={3} placeholder="退款原因: {{退款原因}}" />
    </div>
  </>
);

const HttpFields: React.FC<{ data: any; update: (p: any) => void }> = ({ data, update }) => (
  <>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>URL</label>
      <input style={panelStyles.input} value={data.url || ''} onChange={e => update({ url: e.target.value })} placeholder="https://api.example.com/..." />
    </div>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>方法</label>
      <select style={panelStyles.select} value={data.method || 'GET'} onChange={e => update({ method: e.target.value })}>
        <option value="GET">GET</option>
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="DELETE">DELETE</option>
      </select>
    </div>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>Body</label>
      <textarea style={panelStyles.textarea} value={data.body || ''} onChange={e => update({ body: e.target.value })} rows={3} placeholder='{"key": "{{value}}"}' />
    </div>
  </>
);

const AgentFields: React.FC<{ data: any; update: (p: any) => void; agents: Agent[] }> = ({ data, update, agents }) => (
  <>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>选择 Agent</label>
      {agents.filter(a => a.enabled).length === 0 ? (
        <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>暂无可用 Agent，请先在 Agent 池中创建</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agents.filter(a => a.enabled).map(agent => {
            const isSelected = data.agentId === agent.id;
            return (
              <label key={agent.id} style={{
                ...panelStyles.radioLabel,
                borderColor: isSelected ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                background: isSelected ? 'rgba(139,92,246,0.1)' : 'transparent',
              }} onClick={() => update({ agentId: agent.id, agentName: agent.name })}>
                <div style={{ ...panelStyles.radioDot, border: `2px solid ${isSelected ? '#8b5cf6' : '#475569'}`, background: isSelected ? '#8b5cf6' : 'transparent' }} />
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#8b5cf6' : '#e2e8f0' }}>{agent.icon} {agent.name}</div>
                  {agent.description && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{agent.description.slice(0, 50)}</div>}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
    {data.agentId && (() => {
      const selectedAgent = agents.find(a => a.id === data.agentId);
      if (!selectedAgent?.prompt) return null;
      return (
        <div style={panelStyles.field}>
          <label style={panelStyles.label}>Prompt 预览</label>
          <div style={{ fontSize: 11, color: '#94a3b8', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto', lineHeight: '1.5' }}>
            {selectedAgent.prompt.slice(0, 300)}{selectedAgent.prompt.length > 300 ? '...' : ''}
          </div>
        </div>
      );
    })()}
  </>
);

const AgentTeamFields: React.FC<{ data: any; update: (p: any) => void; agents: Agent[] }> = ({ data, update, agents }) => (
  <div style={panelStyles.field}>
    <label style={panelStyles.label}>选择 Agent（多选，并行执行）</label>
    {agents.filter(a => a.enabled).length === 0 ? (
      <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>暂无可用 Agent</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {agents.filter(a => a.enabled).map(agent => {
          const checked = (data.agentIds || []).includes(agent.id);
          return (
            <label key={agent.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: 8, border: `1.5px solid ${checked ? '#0ea5e9' : 'rgba(255,255,255,0.06)'}`,
              background: checked ? 'rgba(14,165,233,0.08)' : 'transparent', cursor: 'pointer',
            }} onClick={() => {
              const ids = data.agentIds || [];
              const names = data.agentNames || [];
              if (checked) {
                update({ agentIds: ids.filter((id: string) => id !== agent.id), agentNames: names.filter((n: string) => n !== agent.name) });
              } else {
                update({ agentIds: [...ids, agent.id], agentNames: [...names, agent.name] });
              }
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: `2px solid ${checked ? '#0ea5e9' : '#475569'}`,
                background: checked ? '#0ea5e9' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 700,
              }}>{checked ? '✓' : ''}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: checked ? '#7dd3fc' : '#e2e8f0' }}>{agent.icon} {agent.name}</div>
                {agent.description && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{agent.description.slice(0, 40)}</div>}
              </div>
            </label>
          );
        })}
      </div>
    )}
    <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>📋 所有选中的 Agent 将并行执行，通过共享黑板交换数据</div>
  </div>
);

const MasterSubFields: React.FC<{ data: any; update: (p: any) => void; agents: Agent[] }> = ({ data, update, agents }) => (
  <>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>👑 Master Agent（单选）</label>
      {agents.filter(a => a.enabled).length === 0 ? (
        <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>暂无可用 Agent</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agents.filter(a => a.enabled).map(agent => {
            const isSelected = data.masterAgentId === agent.id;
            return (
              <label key={agent.id} style={{
                ...panelStyles.radioLabel,
                borderColor: isSelected ? '#d946ef' : 'rgba(255,255,255,0.06)',
                background: isSelected ? 'rgba(217,70,239,0.1)' : 'transparent',
              }} onClick={() => update({ masterAgentId: agent.id, masterAgentName: agent.name })}>
                <div style={{ ...panelStyles.radioDot, border: `2px solid ${isSelected ? '#d946ef' : '#475569'}`, background: isSelected ? '#d946ef' : 'transparent' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#d946ef' : '#e2e8f0' }}>{agent.icon} {agent.name}</div>
                  {agent.description && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{agent.description.slice(0, 40)}</div>}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
    <div style={panelStyles.field}>
      <label style={panelStyles.label}>👤 Sub Agents（多选）</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {agents.filter(a => a.enabled && a.id !== data.masterAgentId).map(agent => {
          const checked = (data.subAgentIds || []).includes(agent.id);
          return (
            <label key={agent.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: 8, border: `1.5px solid ${checked ? '#a855f7' : 'rgba(255,255,255,0.06)'}`,
              background: checked ? 'rgba(168,85,247,0.08)' : 'transparent', cursor: 'pointer',
            }} onClick={() => {
              const ids = data.subAgentIds || [];
              const names = data.subAgentNames || [];
              if (checked) {
                update({ subAgentIds: ids.filter((id: string) => id !== agent.id), subAgentNames: names.filter((n: string) => n !== agent.name) });
              } else {
                update({ subAgentIds: [...ids, agent.id], subAgentNames: [...names, agent.name] });
              }
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: `2px solid ${checked ? '#a855f7' : '#475569'}`,
                background: checked ? '#a855f7' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 700,
              }}>{checked ? '✓' : ''}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: checked ? '#c4b5fd' : '#e2e8f0' }}>{agent.icon} {agent.name}</div>
                {agent.description && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{agent.description.slice(0, 40)}</div>}
              </div>
            </label>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>Master 通过 call_sub_agent 工具自主调用 Sub Agent</div>
    </div>
  </>
);

const FinalReplyToggle: React.FC<{ isFinal: boolean; onToggle: () => void }> = ({ isFinal, onToggle }) => (
  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={onToggle}>
      <div style={{
        width: 36, height: 20, borderRadius: 10,
        background: isFinal ? '#f59e0b' : 'rgba(255,255,255,0.1)',
        position: 'relative' as const, transition: 'background 0.2s', flexShrink: 0,
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          position: 'absolute' as const, top: 2,
          left: isFinal ? 18 : 2, transition: 'left 0.2s',
        }} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: isFinal ? '#f59e0b' : '#94a3b8' }}>📤 设为最终回复</div>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>此节点输出将作为工作流最终回复内容</div>
      </div>
    </label>
  </div>
);

export default PropertyPanel;
