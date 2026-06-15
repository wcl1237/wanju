import React, { useState } from 'react';
import { editorStyles } from '../styles/editor.styles';
import type { FlowDirection } from '../types';
import * as workflowApi from '../api';

interface WorkflowTopBarProps {
  workflowName: string;
  onNameChange: (name: string) => void;
  workflowMode: 'independent' | 'replace_input';
  onModeChange: (mode: 'independent' | 'replace_input') => void;
  direction: FlowDirection;
  onDirectionChange: (dir: FlowDirection) => void;
  saving: boolean;
  onSave: () => void;
  onBack: () => void;
  onAIGenerate?: (data: { name: string; nodes: any[]; edges: any[] }) => void;
}

/** 顶栏 — 名称输入 + AI 生成 + 模式切换 + 方向切换 + 保存 */
const WorkflowTopBar: React.FC<WorkflowTopBarProps> = ({
  workflowName, onNameChange,
  workflowMode, onModeChange,
  direction, onDirectionChange,
  saving, onSave, onBack,
  onAIGenerate,
}) => {
  const [showAI, setShowAI] = useState(false);
  const [requirement, setRequirement] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!requirement.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const result = await workflowApi.generateWorkflow(requirement.trim());
      if (result.success && result.data) {
        onAIGenerate?.(result.data);
        if (result.data.name) onNameChange(result.data.name);
        setShowAI(false);
        setRequirement('');
      } else {
        setError(result.message || 'AI 生成失败，请重试');
      }
    } catch (e: any) {
      setError('请求失败: ' + (e.message || '网络错误'));
    }
    setGenerating(false);
  };

  return (
    <>
      <div style={editorStyles.topBar}>
        <button style={editorStyles.backBtn} onClick={onBack}>← 返回列表</button>
        <input
          style={editorStyles.nameInput}
          value={workflowName}
          onChange={e => onNameChange(e.target.value)}
          placeholder="工作流名称"
        />
        {/* AI 生成按钮 */}
        <button
          style={aiStyles.aiBtn}
          onClick={() => setShowAI(true)}
          title="AI 智能搭建工作流"
        >
          ✨ AI 搭建
        </button>
        {/* 工作流模式切换 */}
        <div style={editorStyles.modeSwitch}>
          <button
            style={{ ...editorStyles.modeBtn, ...(workflowMode === 'independent' ? editorStyles.modeBtnActive : {}) }}
            onClick={() => onModeChange('independent')}
          >🔒 独立</button>
          <button
            style={{ ...editorStyles.modeBtn, ...(workflowMode === 'replace_input' ? editorStyles.modeBtnReplace : {}) }}
            onClick={() => onModeChange('replace_input')}
          >🔄 替代输入</button>
        </div>
        {/* 方向切换 */}
        <div style={editorStyles.modeSwitch}>
          <button
            style={{ ...editorStyles.modeBtn, ...(direction === 'TB' ? editorStyles.modeBtnActive : {}) }}
            onClick={() => onDirectionChange('TB')}
          >⬇️ 纵向</button>
          <button
            style={{ ...editorStyles.modeBtn, ...(direction === 'LR' ? editorStyles.modeBtnActive : {}) }}
            onClick={() => onDirectionChange('LR')}
          >➡️ 横向</button>
        </div>
        <button style={editorStyles.saveBtn} onClick={onSave} disabled={saving}>
          {saving ? '保存中...' : '💾 保存'}
        </button>
      </div>

      {/* AI 生成弹窗 */}
      {showAI && (
        <div style={aiStyles.overlay} onClick={() => !generating && setShowAI(false)}>
          <div style={aiStyles.modal} onClick={e => e.stopPropagation()}>
            <div style={aiStyles.modalHeader}>
              <span style={{ fontSize: 24 }}>✨</span>
              <div>
                <div style={aiStyles.modalTitle}>AI 智能搭建工作流</div>
                <div style={aiStyles.modalSubtitle}>描述你的需求，AI 自动生成工作流节点和连线</div>
              </div>
            </div>

            <div style={aiStyles.field}>
              <label style={aiStyles.label}>需求描述</label>
              <textarea
                style={aiStyles.textarea}
                value={requirement}
                onChange={e => setRequirement(e.target.value)}
                placeholder={'例如：\n• 用户咨询退款，先提取订单号和退款原因，然后检索知识库查找退款政策，如果符合退款条件则创建工单并回复用户，否则解释不能退款的原因\n• 用户投诉时，先安抚情绪，然后收集投诉详情并创建高优先级工单'}
                rows={6}
                disabled={generating}
              />
            </div>

            {/* 示例快捷选择 */}
            <div style={aiStyles.examples}>
              <span style={{ fontSize: 12, color: '#64748b' }}>快捷模板：</span>
              {examples.map((ex, i) => (
                <button
                  key={i}
                  style={aiStyles.exampleBtn}
                  onClick={() => setRequirement(ex.text)}
                  disabled={generating}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {error && (
              <div style={aiStyles.error}>⚠️ {error}</div>
            )}

            <div style={aiStyles.actions}>
              <button style={aiStyles.cancelBtn} onClick={() => setShowAI(false)} disabled={generating}>取消</button>
              <button
                style={{ ...aiStyles.generateBtn, opacity: generating || !requirement.trim() ? 0.6 : 1 }}
                onClick={handleGenerate}
                disabled={generating || !requirement.trim()}
              >
                {generating ? (
                  <span>🔄 AI 生成中...</span>
                ) : (
                  <span>✨ 开始生成</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* ─── 示例模板 ─── */
const examples = [
  { label: '🔄 退款处理', text: '用户咨询退款：先提取订单号和退款原因，检索知识库查找退款政策，判断是否符合退款条件，符合则创建退款工单并通知用户，不符合则解释原因' },
  { label: '😤 投诉处理', text: '处理用户投诉：先安抚用户情绪并表达歉意，然后提取投诉内容和相关订单信息，创建高优先级投诉工单，最后告知用户处理进度' },
  { label: '❓ 智能问答', text: '智能问答流程：接收用户问题，搜索知识库，如果有匹配结果则基于知识库内容用AI生成回复，如果没有匹配结果则用AI直接回复并标记为最终回复' },
];

/* ─── AI 弹窗样式 ─── */
const aiStyles: Record<string, React.CSSProperties> = {
  aiBtn: {
    padding: '6px 14px', fontSize: 13, fontWeight: 600, color: '#fff',
    background: 'linear-gradient(135deg, #a855f7, #6366f1)', border: 'none',
    borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
  },
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: 560, background: '#12121a', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16, padding: '28px 32px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18, fontWeight: 700, color: '#f1f5f9',
  },
  modalSubtitle: {
    fontSize: 13, color: '#64748b', marginTop: 2,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6,
  },
  textarea: {
    width: '100%', padding: '12px 14px', fontSize: 13, color: '#e2e8f0',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, outline: 'none', resize: 'vertical' as const,
    fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' as const,
  },
  examples: {
    display: 'flex', flexWrap: 'wrap' as const, gap: 8, alignItems: 'center', marginBottom: 20,
  },
  exampleBtn: {
    padding: '4px 10px', fontSize: 12, color: '#a78bfa', cursor: 'pointer',
    background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: 6,
  },
  error: {
    padding: '8px 12px', fontSize: 12, color: '#fbbf24', marginBottom: 16,
    background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
    borderRadius: 8,
  },
  actions: {
    display: 'flex', justifyContent: 'flex-end', gap: 12,
  },
  cancelBtn: {
    padding: '8px 20px', fontSize: 13, color: '#94a3b8', cursor: 'pointer',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  generateBtn: {
    padding: '8px 24px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer',
    background: 'linear-gradient(135deg, #a855f7, #6366f1)', border: 'none',
    borderRadius: 8, boxShadow: '0 4px 12px rgba(168,85,247,0.3)',
  },
};

export default WorkflowTopBar;
