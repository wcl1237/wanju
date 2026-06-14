import React, { useState, useEffect, useCallback } from 'react';
import { getSkills, createSkill, updateSkill, deleteSkill } from '../services/api';
import type { Skill } from '../services/api';

const ICON_OPTIONS = ['⚡', '🔧', '📋', '💡', '🎯', '🔍', '📊', '🛠️', '🤝', '📝', '🚀', '🎨', '💰', '📞', '🔔'];

const SkillHub: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [formData, setFormData] = useState({
    name: '', description: '', keywords: '', prompt: '', icon: '⚡',
  });

  const load = useCallback(async () => {
    try { setSkills(await getSkills()); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingSkill(null);
    setFormData({ name: '', description: '', keywords: '', prompt: '', icon: '⚡' });
    setShowForm(true);
  };

  const openEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setFormData({
      name: skill.name,
      description: skill.description,
      keywords: skill.keywords.join(', '),
      prompt: skill.prompt,
      icon: skill.icon,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const keywords = formData.keywords.split(/[,，]/).map(k => k.trim()).filter(k => k);
    if (!formData.name || !formData.prompt || keywords.length === 0) return;

    if (editingSkill) {
      await updateSkill(editingSkill.id, { ...formData, keywords });
    } else {
      await createSkill({ ...formData, keywords });
    }
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该技能？')) return;
    await deleteSkill(id);
    load();
  };

  const handleToggle = async (skill: Skill) => {
    await updateSkill(skill.id, { enabled: !skill.enabled });
    load();
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>⚡ 技能中心</h2>
        <p style={s.subtitle}>创建自定义技能，通过关键词在对话中自动触发</p>
        <button style={s.addBtn} onClick={openCreate}>+ 新建技能</button>
      </div>

      <div style={s.grid}>
        {skills.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚡</div>
            <div>暂无技能，点击上方按钮创建</div>
          </div>
        )}
        {skills.map(skill => (
          <div key={skill.id} style={{
            ...s.card,
            opacity: skill.enabled ? 1 : 0.5,
            borderColor: skill.enabled ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
          }}>
            <div style={s.cardHeader}>
              <span style={s.cardIcon}>{skill.icon}</span>
              <span style={s.cardName}>{skill.name}</span>
              <button
                style={{
                  ...s.toggleBtn,
                  background: skill.enabled ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)',
                  color: skill.enabled ? '#34d399' : 'rgba(255,255,255,0.3)',
                }}
                onClick={() => handleToggle(skill)}
              >
                {skill.enabled ? '已启用' : '已禁用'}
              </button>
            </div>

            {skill.description && (
              <div style={s.cardDesc}>{skill.description}</div>
            )}

            <div style={s.kwRow}>
              {skill.keywords.map((kw, i) => (
                <span key={i} style={s.kwTag}>{kw}</span>
              ))}
            </div>

            <div style={s.promptPreview}>
              {skill.prompt.length > 80 ? skill.prompt.slice(0, 80) + '...' : skill.prompt}
            </div>

            <div style={s.cardActions}>
              <button style={s.editBtn} onClick={() => openEdit(skill)}>编辑</button>
              <button style={s.delBtn} onClick={() => handleDelete(skill.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      {/* 新建/编辑弹窗 */}
      {showForm && (
        <div style={s.overlay} onClick={() => setShowForm(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>{editingSkill ? '编辑技能' : '新建技能'}</h3>

            <label style={s.label}>图标</label>
            <div style={s.iconPicker}>
              {ICON_OPTIONS.map(ic => (
                <button
                  key={ic}
                  style={{
                    ...s.iconOption,
                    background: formData.icon === ic ? 'rgba(99,102,241,0.2)' : 'transparent',
                    borderColor: formData.icon === ic ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)',
                  }}
                  onClick={() => setFormData(p => ({ ...p, icon: ic }))}
                >{ic}</button>
              ))}
            </div>

            <label style={s.label}>技能名称 *</label>
            <input
              style={s.input}
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="如: 退款处理"
            />

            <label style={s.label}>描述</label>
            <input
              style={s.input}
              value={formData.description}
              onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
              placeholder="简要描述技能用途"
            />

            <label style={s.label}>触发关键词 * <span style={s.hint}>用逗号分隔</span></label>
            <input
              style={s.input}
              value={formData.keywords}
              onChange={e => setFormData(p => ({ ...p, keywords: e.target.value }))}
              placeholder="如: 退款, 退货, 退钱"
            />

            <label style={s.label}>Prompt 模板 *</label>
            <textarea
              style={s.textarea}
              value={formData.prompt}
              onChange={e => setFormData(p => ({ ...p, prompt: e.target.value }))}
              placeholder="当用户消息触发该技能时，此 Prompt 会被注入 AI 的系统提示词中..."
              rows={5}
            />

            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setShowForm(false)}>取消</button>
              <button
                style={{
                  ...s.submitBtn,
                  opacity: formData.name && formData.prompt && formData.keywords ? 1 : 0.4,
                }}
                onClick={handleSubmit}
              >
                {editingSkill ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  page: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  header: {
    padding: '24px 28px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    position: 'relative',
  },
  title: {
    margin: 0, fontSize: '20px', fontWeight: 700, color: '#fff',
  },
  subtitle: {
    margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.35)',
  },
  addBtn: {
    position: 'absolute', top: '24px', right: '28px',
    padding: '8px 18px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none', borderRadius: '10px',
    color: '#fff', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.2s',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  grid: {
    flex: 1, overflowY: 'auto', padding: '20px 28px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '16px', alignContent: 'start',
  },
  empty: {
    gridColumn: '1 / -1',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '300px',
    color: 'rgba(255,255,255,0.2)', fontSize: '14px',
  },
  card: {
    padding: '18px', borderRadius: '14px',
    border: '1px solid rgba(99,102,241,0.15)',
    background: 'rgba(255,255,255,0.03)',
    transition: 'all 0.2s',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
  },
  cardIcon: { fontSize: '20px' },
  cardName: {
    fontSize: '15px', fontWeight: 700, color: '#fff', flex: 1,
  },
  toggleBtn: {
    padding: '4px 10px', borderRadius: '6px',
    border: 'none', fontSize: '11px', fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s',
    fontFamily: "'Inter', sans-serif",
  },
  cardDesc: {
    fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px',
    lineHeight: 1.5,
  },
  kwRow: {
    display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px',
  },
  kwTag: {
    fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
    background: 'rgba(99,102,241,0.12)', color: '#a78bfa', fontWeight: 600,
  },
  promptPreview: {
    fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.5,
    padding: '8px 10px', borderRadius: '8px',
    background: 'rgba(0,0,0,0.2)', marginBottom: '12px',
    whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
  },
  cardActions: {
    display: 'flex', gap: '8px', justifyContent: 'flex-end',
  },
  editBtn: {
    padding: '5px 14px', borderRadius: '6px',
    border: '1px solid rgba(99,102,241,0.2)',
    background: 'rgba(99,102,241,0.08)', color: '#a78bfa',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
  },
  delBtn: {
    padding: '5px 14px', borderRadius: '6px',
    border: '1px solid rgba(239,68,68,0.15)',
    background: 'rgba(239,68,68,0.06)', color: 'rgba(239,68,68,0.6)',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
  },

  // Modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    width: '520px', maxHeight: '80vh', overflowY: 'auto',
    background: 'linear-gradient(180deg, #141428 0%, #0e0e20 100%)',
    border: '1px solid rgba(99,102,241,0.15)',
    borderRadius: '16px', padding: '28px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  modalTitle: {
    margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: '#fff',
  },
  label: {
    display: 'block', fontSize: '12px', fontWeight: 600,
    color: 'rgba(255,255,255,0.5)', marginBottom: '6px', marginTop: '14px',
  },
  hint: {
    fontWeight: 400, color: 'rgba(255,255,255,0.25)',
  },
  iconPicker: {
    display: 'flex', flexWrap: 'wrap', gap: '4px',
  },
  iconOption: {
    width: '36px', height: '36px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'transparent', fontSize: '18px',
    cursor: 'pointer', transition: 'all 0.15s',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  input: {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)', color: '#fff',
    fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    transition: 'border-color 0.15s',
  },
  textarea: {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)', color: '#fff',
    fontSize: '13px', outline: 'none', resize: 'vertical' as const,
    boxSizing: 'border-box' as const, lineHeight: 1.6,
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    minHeight: '100px', transition: 'border-color 0.15s',
  },
  modalActions: {
    display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px',
  },
  cancelBtn: {
    padding: '8px 20px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  submitBtn: {
    padding: '8px 24px', borderRadius: '10px', border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.2s',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
};

export default SkillHub;
