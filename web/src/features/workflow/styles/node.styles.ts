import type React from 'react';

/** 节点渲染样式 */
export const nodeStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: '#1a1a2e', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 12,
    minWidth: 180, maxWidth: 240, padding: 0, cursor: 'pointer', transition: 'all 0.2s',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    borderLeft: '3px solid', borderRadius: '12px 12px 0 0',
  },
  icon: {
    width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 18, flexShrink: 0,
  },
  label: { fontSize: 13, fontWeight: 700 },
  summary: { padding: '8px 14px', fontSize: 11, color: '#94a3b8', lineHeight: '1.4' },
  handle: {
    width: 10, height: 10, borderRadius: '50%', background: '#a855f7',
    border: '2px solid #0f0f18',
  },
  handleLabels: {
    display: 'flex', justifyContent: 'space-between', padding: '4px 14px',
  },
};
