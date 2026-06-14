import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentBlueprint, RuntimeType, CreateBlueprintDTO } from '../types';
import { RUNTIME_TYPE_META } from '../types';
import * as blueprintApi from '../api';

const BlueprintPage: React.FC = () => {
  const [blueprints, setBlueprints] = useState<AgentBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try { setBlueprints(await blueprintApi.getBlueprints()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClick = (bp: AgentBlueprint) => {
    // 「智能对话」类型 → 打开对话窗口
    if (bp.runtimeType === 'react' || bp.runtimeType === 'standalone') {
      navigate(`/blueprints/${bp.id}/chat`);
    } else {
      navigate(`/blueprints/${bp.id}/edit`);
    }
  };

  const handleToggle = async (e: React.MouseEvent, bp: AgentBlueprint) => {
    e.stopPropagation();
    await blueprintApi.updateBlueprint(bp.id, { enabled: !bp.enabled });
    load();
  };

  const handleDelete = async (e: React.MouseEvent, bp: AgentBlueprint) => {
    e.stopPropagation();
    if (bp.isDefault) return;
    if (!confirm(`确定删除「${bp.name}」？`)) return;
    await blueprintApi.deleteBlueprint(bp.id);
    load();
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🏭 智能体工坊</h1>
          <p style={s.subtitle}>创建和管理智能体，每个智能体拥有独立的运行时、能力和记忆</p>
        </div>
        <button style={s.createBtn} onClick={() => setShowCreateDialog(true)}>+ 新建智能体</button>
      </div>

      {loading ? (
        <div style={s.empty}>加载中...</div>
      ) : blueprints.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <div style={{ fontSize: 18, color: '#94a3b8' }}>暂无智能体</div>
        </div>
      ) : (
        <div style={s.grid}>
          {blueprints.map(bp => {
            const meta = RUNTIME_TYPE_META[bp.runtimeType];
            const isHovered = hoveredId === bp.id;
            return (
              <div
                key={bp.id}
                style={{ ...s.card, ...(isHovered ? s.cardHover : {}), opacity: bp.enabled ? 1 : 0.5, borderColor: isHovered ? `${meta.color}50` : undefined }}
                onMouseEnter={() => setHoveredId(bp.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleClick(bp)}
              >
                {/* 标签条 */}
                <div style={{ ...s.runtimeBadge, background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>
                  {meta.icon} {meta.label}
                </div>

                {/* 头部 */}
                <div style={s.cardHeader}>
                  <span style={{ ...s.cardIcon, background: `${meta.color}15` }}>{bp.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.cardName}>
                      {bp.name}
                      {bp.isDefault && <span style={s.defaultTag}>默认</span>}
                    </div>
                    <div style={s.cardDesc}>{bp.description || '暂无描述'}</div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div style={s.cardFooter}>
                  <button style={s.editBtn} onClick={(e) => { e.stopPropagation(); navigate(`/blueprints/${bp.id}/edit`); }}>
                    ⚙️ 配置
                  </button>
                  <div style={{ flex: 1 }} />
                  <button style={s.toggleBtn} onClick={(e) => handleToggle(e, bp)}>
                    {bp.enabled ? '✅' : '⏸️'}
                  </button>
                  {!bp.isDefault && (
                    <button style={s.delBtn} onClick={(e) => handleDelete(e, bp)}>🗑️</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateDialog && (
        <CreateBlueprintDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => { setShowCreateDialog(false); load(); }}
        />
      )}
    </div>
  );
};

/** 创建智能体对话框 */
const CreateBlueprintDialog: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🤖');
  const [runtimeType, setRuntimeType] = useState<RuntimeType>('react');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const defaultConfigs: Record<RuntimeType, any> = {
        react: {
          systemPrompt: `你是${name}，一个专业的智能助手。`, actions: ['search_knowledge', 'create_ticket', 'save_customer_info'],
          skillIds: [], workflowIds: [], maxRounds: 10, temperature: 0.7, enableMemory: true, enableCustomerCollection: false,
        },
        workflow: { workflowId: '', fallbackPrompt: '暂无可用流程' },
        harness: { chain: [] },
        standalone: { agentId: '', actions: [] },
      };

      const dto: CreateBlueprintDTO = {
        name: name.trim(),
        description: description.trim(),
        icon,
        runtimeType,
        config: defaultConfigs[runtimeType],
      };
      await blueprintApi.createBlueprint(dto);
      onCreated();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitle}>🆕 新建智能体</div>

        <div style={s.field}>
          <label style={s.label}>名称</label>
          <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="如：智能客服、退款助手" />
        </div>

        <div style={s.field}>
          <label style={s.label}>描述</label>
          <input style={s.input} value={description} onChange={e => setDescription(e.target.value)} placeholder="描述智能体的职责" />
        </div>

        <div style={s.field}>
          <label style={s.label}>图标</label>
          <input style={{ ...s.input, width: 80 }} value={icon} onChange={e => setIcon(e.target.value)} />
        </div>

        <div style={s.field}>
          <label style={s.label}>运行时类型</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.keys(RUNTIME_TYPE_META) as RuntimeType[]).map(rt => {
              const meta = RUNTIME_TYPE_META[rt];
              const selected = runtimeType === rt;
              return (
                <button
                  key={rt}
                  style={{
                    ...s.runtimeOption,
                    borderColor: selected ? meta.color : 'rgba(255,255,255,0.08)',
                    background: selected ? `${meta.color}10` : 'transparent',
                  }}
                  onClick={() => setRuntimeType(rt)}
                >
                  <span style={{ fontSize: 20 }}>{meta.icon}</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: selected ? meta.color : '#e2e8f0' }}>{meta.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{meta.desc}</div>
                  </div>
                  {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />}
                </button>
              );
            })}
          </div>
        </div>

        <div style={s.modalActions}>
          <button style={s.cancelBtn} onClick={onClose}>取消</button>
          <button style={s.saveBtn} onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: { width: '100%', height: '100%', overflow: 'auto', padding: '32px 40px', background: '#0a0a0f', boxSizing: 'border-box' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  title: { fontSize: 28, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  createBtn: { padding: '10px 24px', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  empty: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', height: 400, color: '#64748b' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 },
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, cursor: 'pointer', transition: 'all 0.25s' },
  cardHover: { background: 'rgba(255,255,255,0.06)', transform: 'translateY(-2px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' },
  runtimeBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, marginBottom: 12 },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  cardIcon: { fontSize: 28, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexShrink: 0 },
  cardName: { fontSize: 16, fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 },
  cardDesc: { fontSize: 13, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  defaultTag: { fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontWeight: 600 },
  cardFooter: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 },
  editBtn: { padding: '6px 14px', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  toggleBtn: { padding: '4px 8px', background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer' },
  delBtn: { padding: '4px 8px', background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer' },
  // Dialog
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { width: 520, maxHeight: '85vh', overflow: 'auto', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.5)' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 },
  input: { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const },
  runtimeOption: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', transition: 'all 0.2s', width: '100%' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  cancelBtn: { padding: '8px 20px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer' },
  saveBtn: { padding: '8px 20px', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
};

export default BlueprintPage;
