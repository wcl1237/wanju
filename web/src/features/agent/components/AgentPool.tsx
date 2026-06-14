import React, { useState, useEffect, useCallback } from 'react';
import * as agentApi from '../api';
import type { Agent } from '../types';
import { getSkills } from '../../skill/api';
import { getWorkflows } from '../../workflow/api';
import type { Skill } from '../../skill/types';
import type { Workflow } from '../../workflow/types';

const AVAILABLE_ACTIONS: { name: string; label: string; icon: string }[] = [
  { name: 'search_knowledge', label: '知识检索', icon: '📚' },
  { name: 'create_ticket', label: '创建工单', icon: '🎫' },
  { name: 'save_customer_info', label: '保存客户信息', icon: '💾' },
];

const AgentPool: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', prompt: '', actions: [] as string[], skillIds: [] as string[], workflowIds: [] as string[], icon: '🧑‍💼' });
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  const loadAgents = useCallback(async () => {
    try {
      const list = await agentApi.getAgents();
      setAgents(list);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  useEffect(() => {
    Promise.all([getSkills(), getWorkflows()])
      .then(([sk, wf]) => { setSkills(sk || []); setWorkflows(wf || []); })
      .catch(console.error);
  }, []);

  const openNew = () => {
    setEditingAgent(null);
    setFormData({ name: '', description: '', prompt: '', actions: [], skillIds: [], workflowIds: [], icon: '🧑‍💼' });
    setShowForm(true);
  };

  const openEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setFormData({ name: agent.name, description: agent.description, prompt: agent.prompt, actions: agent.actions || [], skillIds: agent.skillIds || [], workflowIds: agent.workflowIds || [], icon: agent.icon });
    setShowForm(true);
  };

  const handleGeneratePrompt = async () => {
    if (!formData.name) return;
    setGenerating(true);
    try {
      const prompt = await agentApi.generateAgentPrompt(formData.name, formData.description);
      setFormData(f => ({ ...f, prompt }));
    } catch (e) { console.error(e); }
    setGenerating(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingAgent) {
        await agentApi.updateAgent(editingAgent.id, formData);
      } else {
        await agentApi.createAgent(formData);
      }
      setShowForm(false);
      loadAgents();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await agentApi.deleteAgent(id);
      loadAgents();
    } catch (e) { console.error(e); }
  };

  const handleToggle = async (agent: Agent) => {
    try {
      await agentApi.updateAgent(agent.id, { enabled: !agent.enabled });
      loadAgents();
    } catch (e) { console.error(e); }
  };

  return (
    <div style={styles.container}>
      {/* 头部 */}
      <div style={styles.header}>
        <h2 style={styles.title}>🧑‍💼 Agent 池</h2>
        <button style={styles.newBtn} onClick={openNew}>+ 新建 Agent</button>
      </div>

      {/* Agent 列表 */}
      <div style={styles.grid}>
        {agents.length === 0 && (
          <div style={styles.empty}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
            <div style={{ fontWeight: 600 }}>还没有 Agent</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>点击"新建 Agent"创建第一个</div>
          </div>
        )}
        {agents.map(agent => (
          <div key={agent.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>{agent.icon}</span>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={styles.cardName}>{agent.name}</div>
                <div style={styles.cardDesc}>{agent.description || '暂无描述'}</div>
              </div>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: agent.enabled ? '#10b981' : '#64748b',
                flexShrink: 0,
              }} />
            </div>
            {agent.prompt && (
              <div style={styles.cardPrompt}>
                {agent.prompt.slice(0, 120)}{agent.prompt.length > 120 ? '...' : ''}
              </div>
            )}
            {agent.actions && agent.actions.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {agent.actions.map(a => {
                  const meta = AVAILABLE_ACTIONS.find(x => x.name === a);
                  return <span key={a} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>{meta?.icon} {meta?.label || a}</span>;
                })}
              </div>
            )}
            <div style={styles.cardActions}>
              <button style={styles.actionBtn} onClick={() => openEdit(agent)}>编辑</button>
              <button style={styles.actionBtn} onClick={() => handleToggle(agent)}>
                {agent.enabled ? '禁用' : '启用'}
              </button>
              <button style={{ ...styles.actionBtn, color: '#ef4444' }} onClick={() => handleDelete(agent.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      {/* 编辑/新建弹窗 */}
      {showForm && (
        <div style={styles.overlay} onClick={() => setShowForm(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>
              {editingAgent ? '编辑 Agent' : '新建 Agent'}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>名称</label>
              <input style={styles.input} value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="如：退款客服专员" />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>描述</label>
              <textarea style={styles.textarea} value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="描述该 Agent 的职责和能力" rows={2} />
            </div>

            <div style={styles.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...styles.label, marginBottom: 0 }}>System Prompt</label>
                <button style={styles.generateBtn} onClick={handleGeneratePrompt} disabled={generating || !formData.name}>
                  {generating ? '✨ 生成中...' : '✨ AI 生成'}
                </button>
              </div>
              <textarea style={{ ...styles.textarea, fontFamily: 'monospace', minHeight: 160 }} value={formData.prompt}
                onChange={e => setFormData(f => ({ ...f, prompt: e.target.value }))}
                placeholder="Agent 的 System Prompt，定义其角色和行为..." rows={8} />
              <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                可手动编写或点击"AI 生成"根据名称和描述自动生成
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>可用 Action</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {AVAILABLE_ACTIONS.map(action => {
                  const checked = formData.actions.includes(action.name);
                  return (
                    <label key={action.name} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 8, border: `1.5px solid ${checked ? '#8b5cf6' : 'rgba(255,255,255,0.06)'}`,
                      background: checked ? 'rgba(139,92,246,0.08)' : 'transparent', cursor: 'pointer',
                    }} onClick={() => {
                      setFormData(f => ({
                        ...f,
                        actions: checked
                          ? f.actions.filter(a => a !== action.name)
                          : [...f.actions, action.name],
                      }));
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${checked ? '#8b5cf6' : '#475569'}`,
                        background: checked ? '#8b5cf6' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 12, fontWeight: 700,
                      }}>{checked ? '✓' : ''}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: checked ? '#c4b5fd' : '#e2e8f0' }}>{action.icon} {action.label}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{action.name}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>勾选后 Agent 在工作流中可调用这些工具</div>
            </div>

            {/* 可触发技能 */}
            <div style={styles.field}>
              <label style={styles.label}>🎯 可触发技能
                <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>不勾选则不启用</span>
              </label>
              {skills.length === 0 ? (
                <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>暂无技能</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {skills.map(sk => {
                    const checked = formData.skillIds.includes(sk.id);
                    return (
                      <label key={sk.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 8, border: `1.5px solid ${checked ? '#06b6d4' : 'rgba(255,255,255,0.06)'}`,
                        background: checked ? 'rgba(6,182,212,0.08)' : 'transparent', cursor: 'pointer',
                        opacity: sk.enabled ? 1 : 0.5,
                      }} onClick={() => {
                        setFormData(f => ({
                          ...f,
                          skillIds: checked ? f.skillIds.filter(id => id !== sk.id) : [...f.skillIds, sk.id],
                        }));
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${checked ? '#06b6d4' : '#475569'}`,
                          background: checked ? '#06b6d4' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 12, fontWeight: 700,
                        }}>{checked ? '✓' : ''}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: checked ? '#67e8f9' : '#e2e8f0' }}>{sk.icon || '🎯'} {sk.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{sk.description || sk.keywords?.join(', ') || ''}</div>
                        </div>
                        {!sk.enabled && <span style={{ fontSize: 10, color: '#f59e0b' }}>已禁用</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 可触发工作流 */}
            <div style={styles.field}>
              <label style={styles.label}>🔄 可触发工作流
                <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>不勾选则不启用</span>
              </label>
              {workflows.length === 0 ? (
                <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>暂无工作流</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {workflows.map(wf => {
                    const checked = formData.workflowIds.includes(wf.id);
                    return (
                      <label key={wf.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 8, border: `1.5px solid ${checked ? '#f59e0b' : 'rgba(255,255,255,0.06)'}`,
                        background: checked ? 'rgba(245,158,11,0.08)' : 'transparent', cursor: 'pointer',
                      }} onClick={() => {
                        setFormData(f => ({
                          ...f,
                          workflowIds: checked ? f.workflowIds.filter(id => id !== wf.id) : [...f.workflowIds, wf.id],
                        }));
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${checked ? '#f59e0b' : '#475569'}`,
                          background: checked ? '#f59e0b' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 12, fontWeight: 700,
                        }}>{checked ? '✓' : ''}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: checked ? '#fbbf24' : '#e2e8f0' }}>{wf.icon || '🔄'} {wf.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{wf.description || ''}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>图标</label>
              <input style={{ ...styles.input, width: 80 }} value={formData.icon}
                onChange={e => setFormData(f => ({ ...f, icon: e.target.value }))} />
            </div>

            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={() => setShowForm(false)}>取消</button>
              <button style={styles.saveBtn} onClick={handleSave} disabled={saving || !formData.name}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: "'Inter', 'PingFang SC', sans-serif" },
  newBtn: {
    padding: '8px 18px', background: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
    border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  grid: {
    flex: 1, overflow: 'auto', padding: 24,
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 16, alignContent: 'start',
  },
  empty: {
    gridColumn: '1 / -1', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: 60, color: '#94a3b8',
  },
  card: {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12, padding: 16, transition: 'border-color 0.2s',
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  cardIcon: {
    width: 40, height: 40, borderRadius: 10, background: 'rgba(139,92,246,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
  },
  cardName: { fontSize: 15, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cardDesc: { fontSize: 12, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cardPrompt: {
    fontSize: 11, color: '#94a3b8', lineHeight: '1.5', padding: '8px 10px',
    background: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 10,
    fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
  cardActions: { display: 'flex', gap: 8 },
  actionBtn: {
    padding: '4px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6, color: '#94a3b8', fontSize: 12, cursor: 'pointer',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    width: 520, maxHeight: '85vh', overflow: 'auto', background: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24,
    boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 },
  input: {
    width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0',
    fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0',
    fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  generateBtn: {
    padding: '4px 14px', background: 'linear-gradient(135deg, #f59e0b, #f97316)',
    border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
  },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  cancelBtn: {
    padding: '8px 20px', background: 'rgba(255,255,255,0.06)', border: 'none',
    borderRadius: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 20px', background: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
    border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
};

export default AgentPool;
