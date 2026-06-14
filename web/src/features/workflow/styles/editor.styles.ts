import type React from 'react';

/** 编辑器布局样式 */
export const editorStyles: Record<string, React.CSSProperties> = {
  root: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0f' },
  topBar: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
    background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  backBtn: {
    padding: '6px 16px', background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
    border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer',
  },
  nameInput: {
    flex: 1, padding: '8px 14px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
    color: '#f1f5f9', fontSize: 15, fontWeight: 600, outline: 'none',
  },
  saveBtn: {
    padding: '8px 20px', background: 'linear-gradient(135deg, #a855f7, #ec4899)',
    color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  modeSwitch: {
    display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0,
  },
  modeBtn: {
    padding: '6px 14px', background: 'transparent', color: '#64748b',
    border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  modeBtnActive: { background: 'rgba(16,185,129,0.15)', color: '#10b981' },
  modeBtnReplace: { background: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  leftPanel: {
    width: 180, background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.06)',
    padding: '16px 12px', overflow: 'auto', flexShrink: 0,
  },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' as const },
  nodeItem: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
    borderRadius: 8, cursor: 'grab', marginBottom: 4,
    border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)',
    transition: 'background 0.15s',
  },
  nodeItemIcon: {
    width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 14, flexShrink: 0,
  },
  nodeItemLabel: { fontSize: 13, color: '#e2e8f0', fontWeight: 500 },
  canvas: { flex: 1 },
  rightPanel: {
    width: 280, background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0, overflow: 'auto',
  },
};
