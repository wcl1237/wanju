import type React from 'react';

/** 属性面板样式 */
export const panelStyles: Record<string, React.CSSProperties> = {
  container: { padding: 16, overflow: 'auto', height: '100%' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', textAlign: 'center', padding: 20 },
  header: { display: 'flex', gap: 10, alignItems: 'center', padding: '12px 0', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  headerIcon: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 },
  headerType: { fontSize: 15, fontWeight: 700 },
  headerDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 },
  input: { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const },
  textarea: { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, boxSizing: 'border-box' as const },
  select: { width: '100%', padding: '8px 12px', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' as const },
  radioLabel: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all 0.15s' },
  radioDot: { width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2 },
};
