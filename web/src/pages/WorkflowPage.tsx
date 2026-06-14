import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api';

interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  triggerDescription: string;
  graph: { nodes: any[]; edges: any[] };
  enabled: boolean;
  priority: number;
  createdAt: string;
}

async function fetchWorkflows(): Promise<Workflow[]> {
  const res = await fetch(`${API_BASE}/workflows`, { credentials: 'include' });
  const data = await res.json();
  return data.data || [];
}
async function updateWorkflow(id: string, dto: any) {
  await fetch(`${API_BASE}/workflows/${id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto) });
}
async function deleteWorkflow(id: string) {
  await fetch(`${API_BASE}/workflows/${id}`, { method: 'DELETE', credentials: 'include' });
}

const NODE_COLORS: Record<string, string> = {
  trigger: '#10b981', end: '#ef4444', reply: '#3b82f6', llm_reply: '#a855f7', condition: '#f59e0b',
  knowledge: '#06b6d4', ticket: '#ec4899', extract: '#f97316', http: '#64748b',
};
const NODE_ICONS: Record<string, string> = {
  trigger: '⚡', end: '🏁', reply: '💬', llm_reply: '🤖', condition: '🔀',
  knowledge: '📚', ticket: '🎫', extract: '📝', http: '🌐',
};

const WorkflowPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try { setWorkflows(await fetchWorkflows()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (wf: Workflow) => { await updateWorkflow(wf.id, { enabled: !wf.enabled }); load(); };
  const handleDelete = async (wf: Workflow) => { if (!confirm(`确定删除 "${wf.name}"？`)) return; await deleteWorkflow(wf.id); load(); };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>⚙️ 工作流管理</h1>
          <p style={s.subtitle}>可视化编排自动化业务流程，支持多种触发方式和节点类型</p>
        </div>
        <button style={s.createBtn} onClick={() => navigate('/workflows/new')}>+ 新建工作流</button>
      </div>

      {loading ? (
        <div style={s.empty}>加载中...</div>
      ) : workflows.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
          <div style={{ fontSize: 18, color: '#94a3b8' }}>暂无工作流</div>
          <div style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>点击右上角创建你的第一个工作流</div>
        </div>
      ) : (
        <div style={s.grid}>
          {workflows.map(wf => (
            <div
              key={wf.id}
              style={{ ...s.card, ...(hoveredId === wf.id ? s.cardHover : {}), opacity: wf.enabled ? 1 : 0.55 }}
              onMouseEnter={() => setHoveredId(wf.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div style={s.cardHeader}>
                <span style={s.cardIcon}>{wf.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.cardName}>{wf.name}</div>
                  <div style={s.cardDesc}>{wf.description || '暂无描述'}</div>
                </div>
                <div style={{ ...s.toggle, ...(wf.enabled ? s.toggleOn : {}) }} onClick={() => handleToggle(wf)}>
                  <div style={{ ...s.toggleDot, ...(wf.enabled ? s.toggleDotOn : {}) }} />
                </div>
              </div>

              {/* 迷你节点预览 */}
              <div style={s.miniFlow}>
                {wf.graph.nodes.map((n, i) => {
                  const c = NODE_COLORS[n.type] || '#666';
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && <span style={s.miniArrow}>→</span>}
                      <span style={{ ...s.miniNode, background: `${c}15`, color: c, border: `1px solid ${c}40` }}>
                        {NODE_ICONS[n.type] || '?'}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* 标签 */}
              <div style={s.tags}>
                {wf.triggerDescription && <span style={s.tagTrigger}>🏷️ {wf.triggerDescription.slice(0, 20)}</span>}
                <span style={s.tag}>🔗 节点 <b>{wf.graph.nodes.length}</b></span>
              </div>

              {/* 底部操作 */}
              <div style={s.cardFooter}>
                <button style={s.editBtn} onClick={() => navigate(`/workflows/${wf.id}/edit`)}>✏️ 编辑</button>
                <button style={s.delBtn} onClick={() => handleDelete(wf)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: { width: '100%', height: '100%', overflow: 'auto', padding: '32px 40px', background: '#0a0a0f', boxSizing: 'border-box' as const },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  title: { fontSize: 28, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  createBtn: { padding: '10px 24px', background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  empty: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', height: 400, color: '#64748b' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 },
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, transition: 'all 0.2s' },
  cardHover: { background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(168,85,247,0.3)', transform: 'translateY(-2px)' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  cardIcon: { fontSize: 28, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(168,85,247,0.1)', borderRadius: 12, flexShrink: 0 },
  cardName: { fontSize: 16, fontWeight: 600, color: '#f1f5f9' },
  cardDesc: { fontSize: 13, color: '#64748b', marginTop: 2 },
  miniFlow: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, marginBottom: 12, overflowX: 'auto' as const, flexWrap: 'wrap' as const },
  miniArrow: { color: '#475569', fontSize: 11, flexShrink: 0 },
  miniNode: { width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 },
  tags: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 14 },
  tag: { fontSize: 12, padding: '3px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: 8, color: '#94a3b8' },
  tagTrigger: { fontSize: 12, padding: '3px 10px', background: 'rgba(168,85,247,0.1)', borderRadius: 8, color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)' },
  cardFooter: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  editBtn: { padding: '6px 16px', background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  delBtn: { padding: '6px 12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  toggle: { width: 40, height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative' as const, transition: 'background 0.2s', flexShrink: 0 },
  toggleOn: { background: 'rgba(168,85,247,0.6)' },
  toggleDot: { width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute' as const, top: 2, left: 2, transition: 'left 0.2s' },
  toggleDotOn: { left: 20 },
};

export default WorkflowPage;
