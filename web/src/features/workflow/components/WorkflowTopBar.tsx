import React from 'react';
import { editorStyles } from '../styles/editor.styles';
import type { FlowDirection } from '../types';

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
}

/** 顶栏 — 名称输入 + 模式切换 + 方向切换 + 保存 */
const WorkflowTopBar: React.FC<WorkflowTopBarProps> = ({
  workflowName, onNameChange,
  workflowMode, onModeChange,
  direction, onDirectionChange,
  saving, onSave, onBack,
}) => {
  return (
    <div style={editorStyles.topBar}>
      <button style={editorStyles.backBtn} onClick={onBack}>← 返回列表</button>
      <input
        style={editorStyles.nameInput}
        value={workflowName}
        onChange={e => onNameChange(e.target.value)}
        placeholder="工作流名称"
      />
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
  );
};

export default WorkflowTopBar;
