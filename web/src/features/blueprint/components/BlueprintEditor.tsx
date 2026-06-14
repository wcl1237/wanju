import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AgentBlueprint, UpdateBlueprintDTO } from '../types';
import { RUNTIME_TYPE_META } from '../types';
import * as blueprintApi from '../api';
import { getWorkflows } from '../../workflow/api';
import { getAgents } from '../../agent/api';
import { getSkills } from '../../skill/api';
import type { Workflow } from '../../workflow/types';
import type { Agent } from '../../agent/types';
import type { Skill } from '../../skill/types';

const AVAILABLE_ACTIONS = [
  { name: 'search_knowledge', label: '知识检索', icon: '📚' },
  { name: 'create_ticket', label: '创建工单', icon: '🎫' },
  { name: 'save_customer_info', label: '保存客户信息', icon: '💾' },
];

const BlueprintEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [blueprint, setBlueprint] = useState<AgentBlueprint | null>(null);
  const [config, setConfig] = useState<any>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🤖');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    blueprintApi.getBlueprint(id).then(bp => {
      setBlueprint(bp);
      setName(bp.name);
      setDescription(bp.description);
      setIcon(bp.icon);
      setConfig(bp.config || {});
    }).catch(console.error);
  }, [id]);

  const handleSave = async () => {
    if (!id || !blueprint) return;
    setSaving(true);
    try {
      const dto: UpdateBlueprintDTO = { name, description, icon, config };
      await blueprintApi.updateBlueprint(id, dto);
      alert('保存成功');
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (!blueprint) return <div style={s.loading}>加载中...</div>;

  const meta = RUNTIME_TYPE_META[blueprint.runtimeType];

  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button style={s.backBtn} onClick={() => navigate('/blueprints')}>← 返回</button>
        <div style={{ ...s.badge, background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>
          {meta.icon} {meta.label}
        </div>
        <input style={s.nameInput} value={name} onChange={e => setName(e.target.value)} placeholder="智能体名称" />
        <div style={{ flex: 1 }} />
        <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '💾 保存'}
        </button>
      </div>

      <div style={s.body}>
        <div style={s.sidebar}>
          <div style={s.field}>
            <label style={s.label}>图标</label>
            <input style={{ ...s.input, width: 80 }} value={icon} onChange={e => setIcon(e.target.value)} />
          </div>
          <div style={s.field}>
            <label style={s.label}>描述</label>
            <textarea style={s.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>
          <div style={s.field}>
            <label style={s.label}>状态</label>
            <div style={{ fontSize: 13, color: blueprint.enabled ? '#10b981' : '#64748b' }}>
              {blueprint.enabled ? '✅ 已启用' : '⏸️ 已禁用'}
            </div>
          </div>
          {blueprint.isDefault && (
            <div style={{ fontSize: 11, padding: '8px 12px', background: 'rgba(251,191,36,0.1)', borderRadius: 8, color: '#fbbf24' }}>
              ⭐ 默认智能体 — 新建对话时自动使用
            </div>
          )}
        </div>

        <div style={s.main}>
          <h3 style={s.sectionTitle}>运行时配置</h3>
          {blueprint.runtimeType === 'react' && (
            <ReactConfigPanel config={config} onChange={setConfig} />
          )}
          {blueprint.runtimeType === 'workflow' && (
            <WorkflowConfigPanel config={config} onChange={setConfig} />
          )}
          {blueprint.runtimeType === 'standalone' && (
            <StandaloneConfigPanel config={config} onChange={setConfig} />
          )}
          {blueprint.runtimeType === 'harness' && (
            <div style={{ color: '#94a3b8', padding: 20 }}>
              🔗 编排链配置器将在后续版本提供可视化编辑器。
              <br />当前可通过 API 直接配置 chain 步骤。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** ReAct 配置面板 */
const ReactConfigPanel: React.FC<{ config: any; onChange: (c: any) => void }> = ({ config, onChange }) => {
  const update = (key: string, val: any) => onChange({ ...config, [key]: val });
  const [skills, setSkills] = useState<Skill[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loadingRes, setLoadingRes] = useState(true);

  useEffect(() => {
    setLoadingRes(true);
    Promise.all([getSkills(), getWorkflows()])
      .then(([sk, wf]) => { setSkills(sk || []); setWorkflows(wf || []); })
      .catch(console.error)
      .finally(() => setLoadingRes(false));
  }, []);

  const toggleList = (key: string, id: string) => {
    const list: string[] = config[key] || [];
    const next = list.includes(id) ? list.filter((x: string) => x !== id) : [...list, id];
    update(key, next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={s.field}>
        <label style={s.label}>System Prompt</label>
        <textarea
          style={{ ...s.textarea, fontFamily: 'monospace', minHeight: 200 }}
          value={config.systemPrompt || ''}
          onChange={e => update('systemPrompt', e.target.value)}
          rows={10}
        />
      </div>
      <div style={s.field}>
        <label style={s.label}>可用工具</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {AVAILABLE_ACTIONS.map(a => {
            const checked = (config.actions || []).includes(a.name);
            return (
              <label key={a.name} style={{ ...s.checkboxRow, borderColor: checked ? '#8b5cf6' : 'rgba(255,255,255,0.06)', background: checked ? 'rgba(139,92,246,0.08)' : 'transparent' }}
                onClick={() => {
                  const actions = checked ? (config.actions || []).filter((x: string) => x !== a.name) : [...(config.actions || []), a.name];
                  update('actions', actions);
                }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${checked ? '#8b5cf6' : '#475569'}`, background: checked ? '#8b5cf6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 }}>{checked ? '✓' : ''}</div>
                <span>{a.icon} {a.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 可触发技能 */}
      <div style={s.field}>
        <label style={s.label}>🎯 可触发技能
          <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>空 = 匹配所有启用技能</span>
        </label>
        {loadingRes ? (
          <div style={{ fontSize: 13, color: '#64748b', padding: 8 }}>加载中...</div>
        ) : skills.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>暂无技能，请先在「技能」页面创建</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {skills.map(sk => {
              const checked = (config.skillIds || []).includes(sk.id);
              const isEnabled = sk.enabled;
              return (
                <label key={sk.id} style={{
                  ...s.checkboxRow,
                  borderColor: checked ? '#06b6d4' : 'rgba(255,255,255,0.06)',
                  background: checked ? 'rgba(6,182,212,0.08)' : 'transparent',
                  opacity: isEnabled ? 1 : 0.5,
                }} onClick={() => toggleList('skillIds', sk.id)}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${checked ? '#06b6d4' : '#475569'}`, background: checked ? '#06b6d4' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 }}>{checked ? '✓' : ''}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: checked ? '#67e8f9' : '#e2e8f0' }}>{sk.icon || '🎯'} {sk.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{sk.description || sk.keywords?.join(', ') || ''}</div>
                  </div>
                  {!isEnabled && <span style={{ fontSize: 10, color: '#f59e0b' }}>已禁用</span>}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 可触发工作流 */}
      <div style={s.field}>
        <label style={s.label}>🔄 可触发工作流
          <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>空 = 匹配所有启用工作流</span>
        </label>
        {loadingRes ? (
          <div style={{ fontSize: 13, color: '#64748b', padding: 8 }}>加载中...</div>
        ) : workflows.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>暂无工作流，请先在「工作流」页面创建</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {workflows.map(wf => {
              const checked = (config.workflowIds || []).includes(wf.id);
              return (
                <label key={wf.id} style={{
                  ...s.checkboxRow,
                  borderColor: checked ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                  background: checked ? 'rgba(245,158,11,0.08)' : 'transparent',
                }} onClick={() => toggleList('workflowIds', wf.id)}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${checked ? '#f59e0b' : '#475569'}`, background: checked ? '#f59e0b' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 }}>{checked ? '✓' : ''}</div>
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

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ ...s.field, flex: 1 }}>
          <label style={s.label}>最大 ReAct 轮次</label>
          <input style={s.input} type="number" value={config.maxRounds || 10} onChange={e => update('maxRounds', parseInt(e.target.value) || 10)} />
        </div>
        <div style={{ ...s.field, flex: 1 }}>
          <label style={s.label}>温度</label>
          <input style={s.input} type="number" step="0.1" value={config.temperature || 0.7} onChange={e => update('temperature', parseFloat(e.target.value) || 0.7)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <label style={s.toggleLabel}>
          <input type="checkbox" checked={config.enableMemory !== false} onChange={e => update('enableMemory', e.target.checked)} />
          <span>启用三层记忆</span>
        </label>
        <label style={s.toggleLabel}>
          <input type="checkbox" checked={config.enableCustomerCollection === true} onChange={e => update('enableCustomerCollection', e.target.checked)} />
          <span>启用用户信息收集</span>
        </label>
      </div>
    </div>
  );
};

/** Workflow 配置面板 */
const WorkflowConfigPanel: React.FC<{ config: any; onChange: (c: any) => void }> = ({ config, onChange }) => {
  const update = (key: string, val: any) => onChange({ ...config, [key]: val });
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loadingWf, setLoadingWf] = useState(true);

  useEffect(() => {
    setLoadingWf(true);
    getWorkflows().then(setWorkflows).catch(console.error).finally(() => setLoadingWf(false));
  }, []);

  const selected = workflows.find(w => w.id === config.workflowId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={s.field}>
        <label style={s.label}>绑定工作流</label>
        {loadingWf ? (
          <div style={{ fontSize: 13, color: '#64748b', padding: 8 }}>加载工作流列表...</div>
        ) : workflows.length === 0 ? (
          <div style={{ fontSize: 13, color: '#f59e0b', padding: 8 }}>⚠️ 暂无工作流，请先在「工作流」页面创建</div>
        ) : (
          <>
            <select
              style={s.select}
              value={config.workflowId || ''}
              onChange={e => update('workflowId', e.target.value)}
            >
              <option value="">— 请选择工作流 —</option>
              {workflows.map(w => (
                <option key={w.id} value={w.id}>
                  {w.icon || '🔄'} {w.name}{w.description ? ` — ${w.description}` : ''}
                </option>
              ))}
            </select>
            {selected && (
              <div style={s.selectedHint}>
                <span style={{ fontSize: 18 }}>{selected.icon || '🔄'}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {selected.description || '暂无描述'} · 模式: {selected.mode === 'independent' ? '独立' : '增强'}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div style={s.field}>
        <label style={s.label}>兜底回复</label>
        <textarea style={s.textarea} value={config.fallbackPrompt || ''} onChange={e => update('fallbackPrompt', e.target.value)} rows={3} placeholder="工作流未命中时的回复" />
      </div>
    </div>
  );
};

/** Standalone 配置面板 */
const StandaloneConfigPanel: React.FC<{ config: any; onChange: (c: any) => void }> = ({ config, onChange }) => {
  const update = (key: string, val: any) => onChange({ ...config, [key]: val });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAg, setLoadingAg] = useState(true);

  useEffect(() => {
    setLoadingAg(true);
    getAgents().then(setAgents).catch(console.error).finally(() => setLoadingAg(false));
  }, []);

  const selected = agents.find(a => a.id === config.agentId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={s.field}>
        <label style={s.label}>绑定 Agent</label>
        {loadingAg ? (
          <div style={{ fontSize: 13, color: '#64748b', padding: 8 }}>加载 Agent 列表...</div>
        ) : agents.length === 0 ? (
          <div style={{ fontSize: 13, color: '#f59e0b', padding: 8 }}>⚠️ 暂无 Agent，请先在「Agent 池」页面创建</div>
        ) : (
          <>
            <select
              style={s.select}
              value={config.agentId || ''}
              onChange={e => update('agentId', e.target.value)}
            >
              <option value="">— 请选择 Agent —</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.icon || '🤖'} {a.name}{a.description ? ` — ${a.description}` : ''}
                </option>
              ))}
            </select>
            {selected && (
              <div style={s.selectedHint}>
                <span style={{ fontSize: 18 }}>{selected.icon || '🤖'}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{selected.description || '暂无描述'}</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div style={s.field}>
        <label style={s.label}>可用工具</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {AVAILABLE_ACTIONS.map(a => {
            const checked = (config.actions || []).includes(a.name);
            return (
              <label key={a.name} style={{ ...s.checkboxRow, borderColor: checked ? '#3b82f6' : 'rgba(255,255,255,0.06)', background: checked ? 'rgba(59,130,246,0.08)' : 'transparent' }}
                onClick={() => {
                  const actions = checked ? (config.actions || []).filter((x: string) => x !== a.name) : [...(config.actions || []), a.name];
                  update('actions', actions);
                }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${checked ? '#3b82f6' : '#475569'}`, background: checked ? '#3b82f6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 }}>{checked ? '✓' : ''}</div>
                <span>{a.icon} {a.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0f', overflow: 'hidden' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' },
  topBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 },
  backBtn: { padding: '6px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6 },
  nameInput: { padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f1f5f9', fontSize: 16, fontWeight: 600, width: 240, outline: 'none' },
  saveBtn: { padding: '8px 20px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: 280, padding: 20, borderRight: '1px solid rgba(255,255,255,0.06)', overflow: 'auto', flexShrink: 0 },
  main: { flex: 1, padding: 24, overflow: 'auto' },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: '#f1f5f9', margin: '0 0 16px 0' },
  field: { marginBottom: 12 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 },
  input: { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const },
  textarea: { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, boxSizing: 'border-box' as const },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', fontSize: 13, color: '#e2e8f0' },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#94a3b8', cursor: 'pointer' },
  select: { width: '100%', padding: '10px 12px', background: '#12121f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, cursor: 'pointer', appearance: 'auto' as const },
  selectedHint: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 },
};

export default BlueprintEditor;
