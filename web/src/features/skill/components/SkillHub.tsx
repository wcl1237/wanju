import React, { useState, useEffect, useCallback } from 'react';
import { getSkills, createSkill, updateSkill, deleteSkill, generateSkill } from '../api';
import type { Skill, SkillParameter } from '../types';

const ICON_OPTIONS = ['⚡', '🔧', '📋', '💡', '🎯', '🔍', '📊', '🛠️', '🤝', '📝', '🚀', '🎨', '💰', '📞', '🔔'];
const PARAM_TYPES = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
] as const;

const emptyParam = (): SkillParameter => ({
  name: '', type: 'string', description: '', required: true,
});

const SkillHub: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [formData, setFormData] = useState({
    name: '', description: '', tags: '', prompt: '', outputTemplate: '', icon: '⚡',
    parameters: [] as SkillParameter[],
  });

  // AI 生成状态
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    try { setSkills(await getSkills()); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingSkill(null);
    setFormData({ name: '', description: '', tags: '', prompt: '', outputTemplate: '', icon: '⚡', parameters: [] });
    setShowForm(true);
  };

  const openEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setFormData({
      name: skill.name,
      description: skill.description,
      tags: skill.tags.join(', '),
      prompt: skill.prompt,
      outputTemplate: skill.outputTemplate || '',
      icon: skill.icon,
      parameters: skill.parameters.length > 0 ? [...skill.parameters] : [],
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.description || !formData.prompt) return;
    const tags = formData.tags.split(/[,，]/).map(k => k.trim()).filter(k => k);
    const params = formData.parameters.filter(p => p.name.trim());

    if (editingSkill) {
      await updateSkill(editingSkill.id, { ...formData, tags, parameters: params });
    } else {
      await createSkill({ ...formData, tags, parameters: params });
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

  // AI 生成
  const handleAiGenerate = async () => {
    if (!aiDescription.trim()) return;
    setAiLoading(true);
    try {
      const generated = await generateSkill(aiDescription);
      setFormData({
        name: (generated.name as string) || '',
        description: (generated.description as string) || '',
        tags: ((generated.tags as string[]) || []).join(', '),
        prompt: (generated.prompt as string) || '',
        outputTemplate: (generated.outputTemplate as string) || '',
        icon: (generated.icon as string) || '⚡',
        parameters: (generated.parameters as SkillParameter[]) || [],
      });
      setShowAiInput(false);
      setAiDescription('');
      setShowForm(true);
    } catch (e: any) {
      alert(e.message || 'AI 生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  // 参数编辑
  const addParam = () => setFormData(p => ({ ...p, parameters: [...p.parameters, emptyParam()] }));
  const removeParam = (i: number) => setFormData(p => ({ ...p, parameters: p.parameters.filter((_, idx) => idx !== i) }));
  const updateParam = (i: number, field: string, value: any) => {
    setFormData(p => ({
      ...p,
      parameters: p.parameters.map((param, idx) => idx === i ? { ...param, [field]: value } : param),
    }));
  };

  // 可用占位符提示
  const availablePlaceholders = formData.parameters
    .filter(p => p.name.trim())
    .map(p => `{{${p.name}}}`)
    .join(', ');

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>⚡ 技能中心</h2>
        <p style={s.subtitle}>创建自定义 AI 工具，通过 Function Calling 在对话中自动调用</p>
        <div style={s.headerActions}>
          <button style={s.aiBtn} onClick={() => setShowAiInput(true)}>✨ AI 创建</button>
          <button style={s.addBtn} onClick={openCreate}>+ 手动创建</button>
        </div>
      </div>

      <div style={s.grid}>
        {skills.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚡</div>
            <div>暂无技能，点击上方按钮创建</div>
            <div style={{ fontSize: '12px', marginTop: '8px', color: 'rgba(255,255,255,0.15)' }}>
              技能会作为 AI 工具注册，LLM 在对话中自动判断是否调用
            </div>
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

            <div style={s.cardDesc}>{skill.description}</div>

            {/* 参数列表 */}
            {skill.parameters.length > 0 && (
              <div style={s.paramRow}>
                {skill.parameters.map((p, i) => (
                  <span key={i} style={s.paramTag}>
                    {p.required && <span style={{ color: '#ef4444', marginRight: '2px' }}>*</span>}
                    {p.name}
                    <span style={{ opacity: 0.5, marginLeft: '2px' }}>({p.type})</span>
                  </span>
                ))}
              </div>
            )}

            {/* 标签 */}
            {skill.tags.length > 0 && (
              <div style={s.tagRow}>
                {skill.tags.map((tag, i) => (
                  <span key={i} style={s.tagChip}>{tag}</span>
                ))}
              </div>
            )}

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

      {/* AI 创建弹窗 */}
      {showAiInput && (
        <div style={s.overlay} onClick={() => !aiLoading && setShowAiInput(false)}>
          <div style={s.aiModal} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>✨ AI 智能创建技能</h3>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>
              用自然语言描述你想要的技能，AI 会自动生成完整定义
            </p>
            <textarea
              style={{ ...s.textarea, minHeight: '120px' }}
              value={aiDescription}
              onChange={e => setAiDescription(e.target.value)}
              placeholder="例如：帮我创建一个处理用户退款请求的技能，需要知道订单号和退款原因，按照标准流程处理..."
              disabled={aiLoading}
              autoFocus
            />
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setShowAiInput(false)} disabled={aiLoading}>取消</button>
              <button
                style={{
                  ...s.submitBtn,
                  opacity: aiDescription.trim() && !aiLoading ? 1 : 0.4,
                  minWidth: '120px',
                }}
                onClick={handleAiGenerate}
                disabled={!aiDescription.trim() || aiLoading}
              >
                {aiLoading ? '🤖 AI 生成中...' : '✨ 生成技能'}
              </button>
            </div>
          </div>
        </div>
      )}

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

            <label style={s.label}>
              Tool 描述 * <span style={s.hint}>告诉 AI 何时使用这个技能（覆盖尽可能多的触发场景）</span>
            </label>
            <textarea
              style={{ ...s.textarea, minHeight: '80px' }}
              value={formData.description}
              onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
              placeholder="当用户需要退款、退货、换货、取消订单、对商品不满意时使用。即使用户没有明确说'退款'，只要涉及售后问题也应使用。"
              rows={3}
            />

            <label style={s.label}>标签 <span style={s.hint}>用逗号分隔，用于分类</span></label>
            <input
              style={s.input}
              value={formData.tags}
              onChange={e => setFormData(p => ({ ...p, tags: e.target.value }))}
              placeholder="如: 售后, 退款, 客服"
            />

            {/* 参数编辑器 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '18px' }}>
              <label style={{ ...s.label, margin: 0 }}>输入参数</label>
              <button style={s.addParamBtn} onClick={addParam}>+ 添加参数</button>
            </div>

            {formData.parameters.length > 0 && (
              <div style={s.paramEditor}>
                {formData.parameters.map((param, i) => (
                  <div key={i} style={s.paramItem}>
                    <input
                      style={{ ...s.input, flex: '1 1 120px', minWidth: 0 }}
                      value={param.name}
                      onChange={e => updateParam(i, 'name', e.target.value)}
                      placeholder="参数名 (英文)"
                    />
                    <select
                      style={{ ...s.input, flex: '0 0 80px', minWidth: 0 }}
                      value={param.type}
                      onChange={e => updateParam(i, 'type', e.target.value)}
                    >
                      {PARAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <input
                      style={{ ...s.input, flex: '2 1 160px', minWidth: 0 }}
                      value={param.description}
                      onChange={e => updateParam(i, 'description', e.target.value)}
                      placeholder="参数描述"
                    />
                    <button
                      style={{
                        ...s.toggleBtn,
                        background: param.required ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                        color: param.required ? '#ef4444' : 'rgba(255,255,255,0.3)',
                        flex: '0 0 auto',
                      }}
                      onClick={() => updateParam(i, 'required', !param.required)}
                    >
                      {param.required ? '必填' : '选填'}
                    </button>
                    <button style={s.removeParamBtn} onClick={() => removeParam(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <label style={s.label}>
              Prompt 模板 *
              {availablePlaceholders && (
                <span style={{ ...s.hint, marginLeft: '8px' }}>
                  可用参数: {availablePlaceholders}
                </span>
              )}
            </label>
            <textarea
              style={s.textarea}
              value={formData.prompt}
              onChange={e => setFormData(p => ({ ...p, prompt: e.target.value }))}
              placeholder="当此技能被调用时执行的 Prompt。用 {{参数名}} 引用参数值..."
              rows={5}
            />

            <label style={s.label}>输出格式模板 <span style={s.hint}>可选，留空则 AI 自由回复</span></label>
            <textarea
              style={{ ...s.textarea, minHeight: '60px' }}
              value={formData.outputTemplate}
              onChange={e => setFormData(p => ({ ...p, outputTemplate: e.target.value }))}
              placeholder="如: ## 处理结果\n- 订单号: ...\n- 状态: ..."
              rows={2}
            />

            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setShowForm(false)}>取消</button>
              <button
                style={{
                  ...s.submitBtn,
                  opacity: formData.name && formData.description && formData.prompt ? 1 : 0.4,
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
  headerActions: {
    position: 'absolute', top: '24px', right: '28px',
    display: 'flex', gap: '8px',
  },
  aiBtn: {
    padding: '8px 18px',
    background: 'linear-gradient(135deg, #10b981, #059669)',
    border: 'none', borderRadius: '10px',
    color: '#fff', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.2s',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  addBtn: {
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
  paramRow: {
    display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px',
  },
  paramTag: {
    fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
    background: 'rgba(16,185,129,0.12)', color: '#34d399', fontWeight: 600,
  },
  tagRow: {
    display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px',
  },
  tagChip: {
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

  // 参数编辑器
  paramEditor: {
    display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px',
  },
  paramItem: {
    display: 'flex', gap: '6px', alignItems: 'center',
  },
  addParamBtn: {
    padding: '3px 10px', borderRadius: '6px',
    border: '1px solid rgba(16,185,129,0.2)',
    background: 'rgba(16,185,129,0.08)', color: '#34d399',
    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
  },
  removeParamBtn: {
    width: '24px', height: '24px', borderRadius: '6px',
    border: '1px solid rgba(239,68,68,0.15)',
    background: 'rgba(239,68,68,0.06)', color: 'rgba(239,68,68,0.5)',
    fontSize: '11px', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    width: '600px', maxHeight: '85vh', overflowY: 'auto',
    background: 'linear-gradient(180deg, #141428 0%, #0e0e20 100%)',
    border: '1px solid rgba(99,102,241,0.15)',
    borderRadius: '16px', padding: '28px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  aiModal: {
    width: '520px', maxHeight: '60vh', overflowY: 'auto',
    background: 'linear-gradient(180deg, #0f2922 0%, #0e0e20 100%)',
    border: '1px solid rgba(16,185,129,0.2)',
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
