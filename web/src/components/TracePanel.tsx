import React, { useMemo } from 'react';
import type { Message } from './ChatMessage';
import type { TraceStep } from './TraceTimeline';

interface Props {
  messages: Message[];
  onClose: () => void;
}

const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  search_knowledge: { icon: '🔍', label: '知识库检索', color: '#6366f1' },
  create_ticket: { icon: '🎫', label: '创建工单', color: '#8b5cf6' },
  save_customer_info: { icon: '💾', label: '保存信息', color: '#06b6d4' },
  __thinking__: { icon: '🧠', label: 'AI 思考', color: '#f59e0b' },
};

const TracePanel: React.FC<Props> = ({ messages, onClose }) => {
  // 提取所有带轨迹的 AI 消息
  const tracedMessages = useMemo(() => {
    return messages
      .filter(m => m.role === 'assistant' && m.traceSteps && m.traceSteps.length > 0)
      .map(m => ({
        id: m.id,
        content: m.content.slice(0, 80) + (m.content.length > 80 ? '...' : ''),
        time: new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        steps: m.traceSteps || [],
      }));
  }, [messages]);

  // 统计各节点调用次数
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    tracedMessages.forEach(m => {
      m.steps.forEach((s: any) => {
        counts[s.tool] = (counts[s.tool] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([tool, count]) => ({
        tool,
        count,
        meta: TOOL_META[tool] || { icon: '⚡', label: tool, color: '#64748b' },
      }));
  }, [tracedMessages]);

  const totalSteps = stats.reduce((sum, s) => sum + s.count, 0);
  const totalConversations = tracedMessages.length;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>🔬</span>
            <span style={styles.headerTitle}>推理轨迹回放</span>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.scrollArea}>
          {/* Stats Section */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>📊 节点调用统计</h4>
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={styles.statNumber}>{totalConversations}</div>
                <div style={styles.statLabel}>触发次数</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statNumber}>{totalSteps}</div>
                <div style={styles.statLabel}>总步骤数</div>
              </div>
            </div>

            {/* Bar chart */}
            <div style={styles.barChart}>
              {stats.map(s => (
                <div key={s.tool} style={styles.barRow}>
                  <div style={styles.barLabel}>
                    <span>{s.meta.icon}</span>
                    <span style={styles.barName}>{s.meta.label}</span>
                    <span style={styles.barCount}>{s.count}</span>
                  </div>
                  <div style={styles.barTrack}>
                    <div style={{
                      ...styles.barFill,
                      width: `${Math.max(8, (s.count / Math.max(totalSteps, 1)) * 100)}%`,
                      background: `linear-gradient(90deg, ${s.meta.color}, ${s.meta.color}88)`,
                    }} />
                  </div>
                </div>
              ))}
              {stats.length === 0 && (
                <div style={styles.emptyText}>暂无轨迹数据</div>
              )}
            </div>
          </div>

          {/* Detailed Timeline */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>📜 详细轨迹</h4>
            {tracedMessages.length === 0 ? (
              <div style={styles.emptyText}>发送消息后将在此显示 AI 推理过程</div>
            ) : (
              tracedMessages.map((msg, msgIdx) => (
                <div key={msg.id} style={styles.msgBlock}>
                  <div style={styles.msgHeader}>
                    <span style={styles.msgBadge}>对话 #{msgIdx + 1}</span>
                    <span style={styles.msgTime}>{msg.time}</span>
                  </div>
                  <div style={styles.msgPreview}>{msg.content || '(空回复)'}</div>

                  {/* Steps */}
                  <div style={styles.stepsContainer}>
                    {msg.steps.map((step: any, stepIdx: number) => {
                      const isThinking = step.tool === '__thinking__';
                      const meta = TOOL_META[step.tool] || { icon: '⚡', label: step.tool, color: '#64748b' };
                      return (
                        <div key={stepIdx} style={styles.traceItem}>
                          <div style={styles.traceConnector}>
                            <div style={{
                              ...styles.traceDot,
                              background: meta.color,
                            }} />
                            {stepIdx < msg.steps.length - 1 && <div style={styles.traceLine} />}
                          </div>
                          <div style={styles.traceBody}>
                            <div style={styles.traceHead}>
                              <span>{meta.icon} {meta.label}</span>
                              {step.round && (
                                <span style={styles.roundTag}>R{step.round}</span>
                              )}
                            </div>

                            {/* Thinking */}
                            {isThinking && step.thinking && (
                              <div style={styles.thinkingBox}>
                                {step.thinking}
                              </div>
                            )}

                            {/* Tool args */}
                            {!isThinking && step.args && (
                              <div style={styles.argsBox}>
                                <span style={styles.argsLabel}>参数:</span>
                                {step.tool === 'search_knowledge'
                                  ? `查询 "${step.args.query}"`
                                  : JSON.stringify(step.args).slice(0, 100)
                                }
                              </div>
                            )}

                            {/* Tool result */}
                            {!isThinking && step.result && (
                              <div style={styles.resultBox}>
                                {step.tool === 'search_knowledge' && (
                                  <>
                                    <div style={styles.resultLine}>
                                      <span style={styles.rlabel}>📄 命中:</span>
                                      {(step.result.sources || []).join('、') || '无'}
                                    </div>
                                    <div style={styles.resultLine}>
                                      <span style={styles.rlabel}>🔑 关键词:</span>
                                      {(step.result.keywords || []).slice(0, 5).join('、')}
                                    </div>
                                    <div style={styles.resultLine}>
                                      <span style={styles.rlabel}>📊 召回:</span>
                                      关键词 {step.result.keywordRecallCount || 0} 条 →
                                      精排 {step.result.recallCount || 0} 条
                                      {step.result.timeMs ? ` (${step.result.timeMs}ms)` : ''}
                                    </div>
                                    {step.result.context && (
                                      <details style={styles.contextDetails}>
                                        <summary style={styles.contextSummary}>
                                          📖 查看检索内容
                                        </summary>
                                        <div style={styles.contextBody}>
                                          {step.result.context}
                                        </div>
                                      </details>
                                    )}
                                  </>
                                )}
                                {step.tool === 'save_customer_info' && (
                                  <div style={styles.resultLine}>
                                    <span style={styles.rlabel}>状态:</span>
                                    {step.result.status === 'complete' ? '✅ 完整' : '📝 收集中'}
                                    {' | '}
                                    {Object.entries(step.result.saved || {})
                                      .filter(([, v]) => v)
                                      .map(([k, v]) => `${k}: ${v}`)
                                      .join('，')}
                                  </div>
                                )}
                                {step.tool === 'create_ticket' && (
                                  <div style={styles.resultLine}>✅ 工单创建成功</div>
                                )}
                                {!['search_knowledge', 'save_customer_info', 'create_ticket'].includes(step.tool) && (
                                  <div style={styles.resultLine}>
                                    {JSON.stringify(step.result).slice(0, 150)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  panel: {
    width: '440px',
    maxWidth: '90vw',
    height: '100vh',
    background: 'linear-gradient(180deg, #0f0f23 0%, #0a0a1a 100%)',
    borderLeft: '1px solid rgba(99,102,241,0.15)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
    animation: 'slideInRight 0.3s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(99,102,241,0.04)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  headerIcon: { fontSize: '18px' },
  headerTitle: {
    fontSize: '15px', fontWeight: 700, color: '#fff',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  closeBtn: {
    width: '28px', height: '28px', borderRadius: '8px',
    border: 'none', background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.5)', fontSize: '14px',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.15s',
  },
  scrollArea: {
    flex: 1, overflowY: 'auto', padding: '16px 20px',
  },
  section: { marginBottom: '24px' },
  sectionTitle: {
    margin: '0 0 12px', fontSize: '13px', fontWeight: 600,
    color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif",
  },

  // Stats
  statsGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px',
  },
  statCard: {
    padding: '14px', borderRadius: '12px',
    background: 'rgba(99,102,241,0.06)',
    border: '1px solid rgba(99,102,241,0.12)',
    textAlign: 'center' as const,
  },
  statNumber: {
    fontSize: '24px', fontWeight: 700, color: '#a78bfa',
    fontFamily: "'Inter', sans-serif",
  },
  statLabel: {
    fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '2px',
    fontFamily: "'Inter', sans-serif",
  },

  // Bar chart
  barChart: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  barRow: { display: 'flex', flexDirection: 'column' as const, gap: '3px' },
  barLabel: {
    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
    color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif",
  },
  barName: { flex: 1 },
  barCount: {
    fontSize: '11px', fontWeight: 600, color: '#a78bfa',
  },
  barTrack: {
    height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%', borderRadius: '3px',
    transition: 'width 0.5s ease',
  },

  // Message blocks
  msgBlock: {
    marginBottom: '16px', padding: '12px',
    borderRadius: '10px', background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  msgHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '6px',
  },
  msgBadge: {
    fontSize: '11px', fontWeight: 600, color: '#8b5cf6',
    background: 'rgba(139,92,246,0.12)', padding: '2px 8px', borderRadius: '6px',
    fontFamily: "'Inter', sans-serif",
  },
  msgTime: {
    fontSize: '10px', color: 'rgba(255,255,255,0.25)',
    fontFamily: "'Inter', sans-serif",
  },
  msgPreview: {
    fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '10px',
    lineHeight: 1.4, fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },

  // Steps
  stepsContainer: {},
  traceItem: { display: 'flex', gap: '10px', minHeight: '28px' },
  traceConnector: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    width: '14px', flexShrink: 0, paddingTop: '3px',
  },
  traceDot: {
    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
  },
  traceLine: {
    width: '2px', flex: 1, background: 'rgba(99,102,241,0.12)',
    margin: '2px 0', borderRadius: '1px',
  },
  traceBody: { flex: 1, paddingBottom: '8px', minWidth: 0 },
  traceHead: {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)',
    marginBottom: '3px', fontFamily: "'Inter', sans-serif",
  },
  roundTag: {
    fontSize: '9px', color: 'rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: '3px',
  },

  // Content boxes
  thinkingBox: {
    fontSize: '11px', color: 'rgba(251,191,36,0.65)', lineHeight: 1.5,
    padding: '6px 8px', background: 'rgba(251,191,36,0.05)',
    borderRadius: '6px', border: '1px solid rgba(251,191,36,0.08)',
    fontStyle: 'italic' as const, whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const, maxHeight: '100px', overflow: 'auto',
  },
  argsBox: {
    fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4,
    marginBottom: '3px',
  },
  argsLabel: {
    color: 'rgba(255,255,255,0.25)', marginRight: '4px', fontWeight: 500,
  },
  resultBox: {
    padding: '6px 8px', background: 'rgba(255,255,255,0.02)',
    borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)',
    fontSize: '11px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
  },
  resultLine: {
    marginBottom: '2px', wordBreak: 'break-word' as const,
  },
  rlabel: {
    color: 'rgba(255,255,255,0.3)', fontWeight: 500, marginRight: '4px',
  },
  contextDetails: { marginTop: '4px', cursor: 'pointer' },
  contextSummary: {
    fontSize: '10px', color: '#818cf8', cursor: 'pointer',
    outline: 'none', fontFamily: "'Inter', sans-serif",
  },
  contextBody: {
    marginTop: '4px', padding: '6px 8px', fontSize: '10px',
    color: 'rgba(255,255,255,0.4)', lineHeight: 1.6,
    background: 'rgba(0,0,0,0.2)', borderRadius: '4px',
    maxHeight: '150px', overflow: 'auto',
    whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
  },
  emptyText: {
    fontSize: '12px', color: 'rgba(255,255,255,0.25)', textAlign: 'center' as const,
    padding: '20px', fontFamily: "'Inter', sans-serif",
  },
};

export default TracePanel;
