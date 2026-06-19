/**
 * WorkflowPushModal — 工作流推送弹窗
 *
 * 允许用户选择预设工作流或自定义 JSON 推送到 Code Agent 调试。
 */
import React, { useState } from 'react';

interface WorkflowPushModalProps {
  onClose: () => void;
  onPush: (workflow: any) => void;
}

// 预设工作流模板
const PRESET_WORKFLOWS = [
  {
    name: '📂 项目分析',
    description: '分析工作目录的项目结构和技术栈',
    workflow: {
      id: 'preset-analyze-' + Date.now(),
      name: '项目结构分析',
      description: '分析工作目录中的项目结构、技术栈和依赖',
      variables: {},
      context: { projectPath: '/workspace', userId: 'debug' },
      steps: [
        {
          id: 'step-1',
          type: 'agent_task',
          name: '分析项目结构',
          config: {
            type: 'agent_task',
            prompt: '请分析当前工作目录的项目结构。列出主要的目录和文件，识别使用的技术栈和框架，并给出简要概述。',
            maxTurns: 10,
          },
          nextSteps: [],
          onFailure: 'ask_user',
        },
      ],
    },
  },
  {
    name: '🔧 代码修改',
    description: '根据指令修改代码文件',
    workflow: {
      id: 'preset-edit-' + Date.now(),
      name: '代码修改任务',
      description: '根据用户指令修改项目代码',
      variables: {},
      context: { projectPath: '/workspace', userId: 'debug' },
      steps: [
        {
          id: 'step-1',
          type: 'decision_point',
          name: '确认修改需求',
          config: {
            type: 'decision_point',
            question: '请描述你需要修改的内容（例如：修改 README.md 添加项目描述）',
          },
          nextSteps: ['step-2'],
        },
        {
          id: 'step-2',
          type: 'agent_task',
          name: '执行代码修改',
          config: {
            type: 'agent_task',
            prompt: '根据用户的需求 "{{decision_step-1}}" 来修改代码。先阅读相关文件理解上下文，然后进行精确的修改。完成后汇报修改内容。',
            maxTurns: 15,
          },
          nextSteps: [],
          onFailure: 'ask_user',
        },
      ],
    },
  },
  {
    name: '🧪 运行测试',
    description: '执行项目测试并汇报结果',
    workflow: {
      id: 'preset-test-' + Date.now(),
      name: '运行测试',
      description: '执行项目测试并分析结果',
      variables: {},
      context: { projectPath: '/workspace', userId: 'debug' },
      steps: [
        {
          id: 'step-1',
          type: 'agent_task',
          name: '分析测试配置',
          config: {
            type: 'agent_task',
            prompt: '查看项目中是否配置了测试框架（如 jest, mocha, vitest 等），找到测试运行命令。',
            maxTurns: 5,
          },
          nextSteps: ['step-2'],
        },
        {
          id: 'step-2',
          type: 'bash_command',
          name: '执行测试',
          config: {
            type: 'bash_command',
            command: 'npm test 2>&1 || echo "测试完成（可能有失败）"',
            timeout: 120000,
          },
          nextSteps: ['step-3'],
          onFailure: 'skip',
        },
        {
          id: 'step-3',
          type: 'agent_task',
          name: '分析测试结果',
          config: {
            type: 'agent_task',
            prompt: '分析上一步测试执行的结果，总结通过和失败的测试用例。如果有失败的测试，分析可能的原因并给出修复建议。',
            maxTurns: 8,
          },
          nextSteps: [],
        },
      ],
    },
  },
];

export const WorkflowPushModal: React.FC<WorkflowPushModalProps> = ({ onClose, onPush }) => {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [customJson, setCustomJson] = useState('{\n  "id": "custom-' + Date.now() + '",\n  "name": "自定义工作流",\n  "description": "描述...",\n  "variables": {},\n  "context": { "projectPath": "/workspace", "userId": "debug" },\n  "steps": [\n    {\n      "id": "step-1",\n      "type": "agent_task",\n      "name": "执行任务",\n      "config": {\n        "type": "agent_task",\n        "prompt": "你的任务描述",\n        "maxTurns": 10\n      },\n      "nextSteps": [],\n      "onFailure": "ask_user"\n    }\n  ]\n}');
  const [error, setError] = useState('');

  const handlePushCustom = () => {
    try {
      const parsed = JSON.parse(customJson);
      if (!parsed.id || !parsed.steps) {
        setError('工作流定义必须包含 id 和 steps');
        return;
      }
      onPush(parsed);
    } catch (e: any) {
      setError('JSON 解析失败: ' + e.message);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>📋 推送工作流</h3>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 模式切换 */}
        <div style={styles.modeTabs}>
          <button
            style={{ ...styles.modeTab, ...(mode === 'preset' ? styles.modeTabActive : {}) }}
            onClick={() => setMode('preset')}
          >
            预设工作流
          </button>
          <button
            style={{ ...styles.modeTab, ...(mode === 'custom' ? styles.modeTabActive : {}) }}
            onClick={() => setMode('custom')}
          >
            自定义 JSON
          </button>
        </div>

        <div style={styles.modalBody}>
          {mode === 'preset' ? (
            <div style={styles.presetGrid}>
              {PRESET_WORKFLOWS.map((preset) => (
                <button
                  key={preset.name}
                  style={styles.presetCard}
                  onClick={() => onPush({ ...preset.workflow, id: preset.workflow.id.split('-').slice(0, 2).join('-') + '-' + Date.now() })}
                >
                  <div style={styles.presetName}>{preset.name}</div>
                  <div style={styles.presetDesc}>{preset.description}</div>
                  <div style={styles.presetSteps}>{preset.workflow.steps.length} 个步骤</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={styles.customArea}>
              <textarea
                value={customJson}
                onChange={(e) => { setCustomJson(e.target.value); setError(''); }}
                style={styles.jsonTextarea}
                spellCheck={false}
              />
              {error && <div style={styles.errorText}>{error}</div>}
              <button style={styles.pushBtn} onClick={handlePushCustom}>
                🚀 推送工作流
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { width: '600px', maxHeight: '80vh', background: 'rgba(18,18,36,0.98)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  modalTitle: { margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '18px', cursor: 'pointer', padding: '4px 8px' },
  modeTabs: { display: 'flex', padding: '0 20px', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  modeTab: { padding: '12px 20px', background: 'none', border: 'none', borderBottom: '2px solid transparent', color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontFamily: "'Inter', 'PingFang SC', sans-serif" },
  modeTabActive: { color: '#10b981', borderBottomColor: '#10b981' },
  modalBody: { flex: 1, padding: '20px', overflow: 'auto' },
  presetGrid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  presetCard: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', fontFamily: "'Inter', 'PingFang SC', sans-serif", color: '#fff' },
  presetName: { fontSize: '15px', fontWeight: 700 },
  presetDesc: { fontSize: '13px', color: 'rgba(255,255,255,0.5)' },
  presetSteps: { fontSize: '11px', color: 'rgba(16,185,129,0.7)', fontWeight: 600 },
  customArea: { display: 'flex', flexDirection: 'column', gap: '12px' },
  jsonTextarea: { width: '100%', height: '300px', padding: '14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#10b981', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
  errorText: { color: '#f87171', fontSize: '12px' },
  pushBtn: { alignSelf: 'flex-end', padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #06b6d4)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
};
