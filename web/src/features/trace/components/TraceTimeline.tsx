import React, { useState } from 'react';
import type { TraceStep } from '../types';

export type { TraceStep };

interface Props {
  steps: TraceStep[];
  compact?: boolean; // inline mode (in message bubble)
}

const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  search_knowledge: { icon: '🔍', label: '知识库检索' },
  create_ticket: { icon: '🎫', label: '创建工单' },
  save_customer_info: { icon: '💾', label: '保存用户信息' },
  __thinking__: { icon: '🧠', label: 'AI 思考' },
};

function getToolMeta(name: string) {
  return TOOL_LABELS[name] || { icon: '⚡', label: name };
}

function formatArgs(tool: string, args: any): string {
  if (!args) return '';
  if (tool === 'search_knowledge') return `查询: "${args.query || ''}"`;
  if (tool === 'save_customer_info') {
    const parts: string[] = [];
    if (args.name) parts.push(`姓名: ${args.name}`);
    if (args.phone) parts.push(`手机: ${args.phone}`);
    if (args.company) parts.push(`公司: ${args.company}`);
    if (args.requirement) parts.push(`需求: ${args.requirement}`);
    return parts.join('，') || JSON.stringify(args);
  }
  if (tool === 'create_ticket') return `标题: "${args.title || ''}"`;
  return JSON.stringify(args).slice(0, 80);
}

function formatResult(tool: string, result: any): React.ReactNode {
  if (!result) return null;
  if (tool === 'search_knowledge') {
    const sources = result.sources || [];
    const keywords = result.keywords || [];
    const count = result.recallCount || 0;
    const kwCount = result.keywordRecallCount || 0;
    const timeMs = result.timeMs || 0;
    const context = result.context || '';
    return (
      <div style={styles.resultDetail}>
        <div style={styles.resultRow}>
          <span style={styles.resultLabel}>命中文档:</span>
          <span style={styles.resultValue}>
            {sources.length > 0 ? sources.join('、') : '无'}
          </span>
        </div>
        <div style={styles.resultRow}>
          <span style={styles.resultLabel}>关键词召回:</span>
          <span style={styles.resultValue}>{kwCount} 条</span>
          <span style={styles.resultLabel}>语义精排:</span>
          <span style={styles.resultValue}>{count} 条</span>
          {timeMs > 0 && <>
            <span style={styles.resultLabel}>耗时:</span>
            <span style={styles.resultValue}>{timeMs}ms</span>
          </>}
        </div>
        {keywords.length > 0 && (
          <div style={styles.keywordRow}>
            {keywords.slice(0, 8).map((kw: string, i: number) => (
              <span key={i} style={styles.keyword}>{kw}</span>
            ))}
          </div>
        )}
        {context && (
          <div style={styles.contextPreview}>
            <div style={styles.contextLabel}>检索内容:</div>
            <div style={styles.contextText}>{context.slice(0, 200)}...</div>
          </div>
        )}
      </div>
    );
  }
  if (tool === 'save_customer_info') {
    const saved = result.saved || {};
    const status = result.status || '';
    return (
      <div style={styles.resultDetail}>
        <div style={styles.resultRow}>
          <span style={styles.resultLabel}>状态:</span>
          <span style={{
            ...styles.resultValue,
            color: status === 'complete' ? '#34d399' : '#fbbf24',
          }}>
            {status === 'complete' ? '✅ 信息完整' : '📝 收集中'}
          </span>
        </div>
        {Object.entries(saved).filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={styles.resultRow}>
            <span style={styles.resultLabel}>{k}:</span>
            <span style={styles.resultValue}>{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (tool === 'create_ticket') {
    return (
      <div style={styles.resultDetail}>
        <div style={styles.resultRow}>
          <span style={{ ...styles.resultValue, color: '#34d399' }}>✅ 工单创建成功</span>
        </div>
      </div>
    );
  }
  return (
    <div style={styles.resultDetail}>
      <div style={styles.resultRow}>
        <span style={styles.resultValue}>{JSON.stringify(result).slice(0, 120)}</span>
      </div>
    </div>
  );
}

const TraceTimeline: React.FC<Props> = ({ steps, compact = true }) => {
  const [expanded, setExpanded] = useState(!compact);

  if (steps.length === 0) return null;

  const allDone = steps.every(s => s.status === 'done');
  const runningCount = steps.filter(s => s.status === 'running').length;
  const toolSteps = steps.filter(s => s.tool !== '__thinking__');

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={() => setExpanded(!expanded)}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>{allDone ? '✅' : '⏳'}</span>
          <span style={styles.headerTitle}>AI 推理轨迹</span>
          <span style={styles.headerBadge}>
            {allDone
              ? `${toolSteps.length} 步完成`
              : `${runningCount} 步执行中...`}
          </span>
        </div>
        <span style={styles.expandBtn}>{expanded ? '▲ 收起' : '▼ 展开'}</span>
      </div>

      {expanded && (
        <div style={styles.timeline}>
          {steps.map((step, idx) => {
            const isThinking = step.tool === '__thinking__';
            const meta = getToolMeta(step.tool);
            const isRunning = step.status === 'running';
            return (
              <div key={idx} style={styles.step}>
                <div style={styles.connector}>
                  <div style={{
                    ...styles.dot,
                    background: isThinking
                      ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                      : isRunning
                      ? '#fbbf24'
                      : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    boxShadow: isRunning ? '0 0 8px rgba(251,191,36,0.5)' : '0 0 6px rgba(99,102,241,0.3)',
                    animation: isRunning ? 'toolPulse 1.2s ease-in-out infinite' : 'none',
                  }} />
                  {idx < steps.length - 1 && <div style={styles.line} />}
                </div>
                <div style={styles.stepContent}>
                  <div style={styles.stepHeader}>
                    <span style={styles.stepIcon}>{meta.icon}</span>
                    <span style={styles.stepLabel}>{meta.label}</span>
                    {step.round && (
                      <span style={styles.roundBadge}>Round {step.round}</span>
                    )}
                    <span style={{
                      ...styles.stepStatus,
                      color: isRunning ? '#fbbf24' : '#34d399',
                    }}>
                      {isRunning ? '执行中...' : '完成'}
                    </span>
                  </div>

                  {/* Thinking content */}
                  {isThinking && step.thinking && (
                    <div style={styles.thinkingBlock}>
                      {step.thinking.slice(0, 300)}
                      {step.thinking.length > 300 ? '...' : ''}
                    </div>
                  )}

                  {/* Tool args */}
                  {!isThinking && step.args && (
                    <div style={styles.argsText}>{formatArgs(step.tool, step.args)}</div>
                  )}

                  {/* Tool result */}
                  {!isThinking && step.status === 'done' && step.result && (
                    formatResult(step.tool, step.result)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    margin: '8px 0',
    borderRadius: '10px',
    border: '1px solid rgba(99, 102, 241, 0.15)',
    background: 'rgba(99, 102, 241, 0.04)',
    overflow: 'hidden',
    fontSize: '12px',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    cursor: 'pointer',
    background: 'rgba(99, 102, 241, 0.06)',
    borderBottom: '1px solid rgba(99, 102, 241, 0.08)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '6px' },
  headerIcon: { fontSize: '13px' },
  headerTitle: { fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.75)' },
  headerBadge: {
    fontSize: '10px', color: '#a78bfa',
    background: 'rgba(99,102,241,0.12)', padding: '1px 7px', borderRadius: '8px',
  },
  expandBtn: { fontSize: '10px', color: 'rgba(255,255,255,0.3)' },
  timeline: { padding: '10px 12px 6px' },
  step: { display: 'flex', gap: '10px', minHeight: '36px' },
  connector: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    width: '16px', flexShrink: 0, paddingTop: '2px',
  },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  line: {
    width: '2px', flex: 1, background: 'rgba(99,102,241,0.15)',
    margin: '3px 0', borderRadius: '1px',
  },
  stepContent: { flex: 1, paddingBottom: '10px', minWidth: 0 },
  stepHeader: { display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' },
  stepIcon: { fontSize: '12px' },
  stepLabel: { fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' },
  stepStatus: { fontSize: '10px', fontWeight: 500, marginLeft: 'auto' },
  roundBadge: {
    fontSize: '9px', color: 'rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px',
  },
  argsText: { fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginBottom: '4px', lineHeight: 1.4 },
  thinkingBlock: {
    fontSize: '11px', color: 'rgba(251, 191, 36, 0.7)', lineHeight: 1.5,
    padding: '6px 8px', background: 'rgba(251,191,36,0.06)',
    borderRadius: '6px', border: '1px solid rgba(251,191,36,0.1)',
    fontStyle: 'italic' as const, whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  resultDetail: {
    padding: '6px 8px', background: 'rgba(255,255,255,0.03)',
    borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)',
  },
  resultRow: {
    display: 'flex', alignItems: 'baseline', gap: '6px',
    marginBottom: '2px', lineHeight: 1.5, flexWrap: 'wrap' as const,
  },
  resultLabel: { fontSize: '10px', color: 'rgba(255,255,255,0.35)', flexShrink: 0, fontWeight: 500 },
  resultValue: { fontSize: '11px', color: 'rgba(255,255,255,0.65)', wordBreak: 'break-all' as const },
  keywordRow: { display: 'flex', flexWrap: 'wrap' as const, gap: '3px', marginTop: '4px' },
  keyword: {
    fontSize: '9px', padding: '1px 5px', borderRadius: '4px',
    background: 'rgba(99,102,241,0.12)', color: '#a78bfa',
  },
  contextPreview: { marginTop: '6px' },
  contextLabel: { fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '2px', fontWeight: 500 },
  contextText: {
    fontSize: '10px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5,
    padding: '4px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px',
    maxHeight: '60px', overflow: 'hidden', whiteSpace: 'pre-wrap' as const,
  },
};

export default TraceTimeline;
