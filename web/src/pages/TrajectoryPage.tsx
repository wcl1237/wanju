import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Message } from '../components/ChatMessage';

interface TraceStep {
  type: string;
  tool?: string;
  args?: any;
  result?: any;
  content?: string;
  round?: number;
  timeMs?: number;
  hasToolCalls?: boolean;
  skills?: any[];
  ts?: number;
  // workflow fields
  workflowId?: string;
  workflowName?: string;
  workflowIcon?: string;
  workflowMode?: string;
  stepIndex?: number;
  nodeId?: string;
  stepType?: string;
  stepName?: string;
  params?: any;
  output?: any;
  error?: string;
  conditionResult?: boolean;
  totalSteps?: number;
  totalTimeMs?: number;
  [key: string]: any;
}

interface Props {
  messages: Message[];
  conversationTitle?: string;
  onBack: () => void;
}

const STEP_META: Record<string, { icon: string; label: string; color: string }> = {
  memory_init: { icon: '📦', label: '初始化对话', color: '#64748b' },
  message_save: { icon: '💬', label: '保存用户消息', color: '#64748b' },
  memory_load: { icon: '🧠', label: '记忆加载', color: '#8b5cf6' },
  skill_match: { icon: '⚡', label: '技能匹配', color: '#a855f7' },
  workflow_match: { icon: '🔄', label: '工作流匹配', color: '#ec4899' },
  workflow_start: { icon: '▶️', label: '工作流启动', color: '#ec4899' },
  workflow_step: { icon: '⚙️', label: '工作流步骤', color: '#f472b6' },
  workflow_llm: { icon: '🤖', label: '工作流 LLM', color: '#f59e0b' },
  workflow_output: { icon: '📨', label: '工作流输出', color: '#10b981' },
  workflow_end: { icon: '✅', label: '工作流完成', color: '#10b981' },
  thinking_end: { icon: '💭', label: 'AI 思考', color: '#f59e0b' },
  tool_start: { icon: '🔧', label: '调用工具', color: '#06b6d4' },
  tool_result: { icon: '📋', label: '工具返回', color: '#34d399' },
};

const TOOL_META: Record<string, { icon: string; label: string }> = {
  search_knowledge: { icon: '🔍', label: 'RAG 检索' },
  create_ticket: { icon: '🎫', label: '创建工单' },
  save_customer_info: { icon: '💾', label: '保存信息' },
};

const WORKFLOW_NODE_META: Record<string, { icon: string; label: string }> = {
  trigger: { icon: '⚡', label: '触发器' },
  end: { icon: '🏁', label: '结束' },
  extract: { icon: '📝', label: '参数提取' },
  condition: { icon: '🔀', label: '条件分支' },
  knowledge: { icon: '📚', label: '知识检索' },
  ticket: { icon: '🎫', label: '创建工单' },
  reply: { icon: '💬', label: '消息回复' },
  llm_reply: { icon: '🤖', label: 'AI 生成' },
  http: { icon: '🌐', label: 'HTTP 请求' },
};

function getStepMeta(step: TraceStep) {
  const base = STEP_META[step.type] || { icon: '⚡', label: step.type, color: '#64748b' };
  if ((step.type === 'tool_start' || step.type === 'tool_result') && step.tool) {
    const toolInfo = TOOL_META[step.tool] || { icon: '⚙️', label: step.tool };
    return { ...base, icon: toolInfo.icon, label: `${base.label}: ${toolInfo.label}` };
  }
  if (step.type === 'workflow_step' && step.stepType) {
    const nodeMeta = WORKFLOW_NODE_META[step.stepType];
    if (nodeMeta) return { ...base, icon: nodeMeta.icon, label: `${nodeMeta.label}: ${step.stepName || ''}` };
  }
  return base;
}

const TrajectoryPage: React.FC<Props> = ({ messages, conversationTitle, onBack }) => {
  const [playIndex, setPlayIndex] = useState(-1); // -1 = show all
  const [speed, setSpeed] = useState(1);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [expandAll, setExpandAll] = useState(false);
  const playTimer = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Extract traced messages
  const tracedMessages = useMemo(() => {
    return messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map((m, idx) => ({
        idx,
        id: m.id,
        role: m.role,
        content: m.content,
        time: new Date(m.createdAt).toLocaleTimeString('zh-CN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }),
        steps: (m.traceSteps || []) as TraceStep[],
      }));
  }, [messages]);

  // Statistics
  const stats = useMemo(() => {
    let msgCount = tracedMessages.length;
    let toolCalls = 0;
    let ragRecall = 0;
    let thinkingCount = 0;
    let skillMatchCount = 0;
    let totalTimeMs = 0;
    let ticketCount = 0;
    let workflowMatchCount = 0;
    let workflowStepCount = 0;
    let workflowTimeMs = 0;

    tracedMessages.forEach(m => {
      m.steps.forEach(s => {
        if (s.type === 'thinking_end') {
          thinkingCount++;
          if (s.timeMs) totalTimeMs += s.timeMs;
        } else if (s.type === 'skill_match') {
          skillMatchCount += (s.skills?.length || 0);
        } else if (s.type === 'tool_result') {
          toolCalls++;
          if (s.timeMs) totalTimeMs += s.timeMs;
          if (s.tool === 'search_knowledge' && s.result) {
            ragRecall += (s.result.recallCount || 0);
          }
          if (s.tool === 'create_ticket') ticketCount++;
        } else if (s.type === 'workflow_match') {
          workflowMatchCount++;
          if (s.timeMs) workflowTimeMs += s.timeMs;
        } else if (s.type === 'workflow_step') {
          workflowStepCount++;
          if (s.timeMs) workflowTimeMs += s.timeMs;
        } else if (s.type === 'workflow_end') {
          if (s.totalTimeMs) workflowTimeMs += s.totalTimeMs;
        }
      });
    });

    return {
      msgCount, toolCalls, ragRecall, thinkingCount, skillMatchCount,
      totalTimeMs, ticketCount, workflowMatchCount, workflowStepCount, workflowTimeMs,
    };
  }, [tracedMessages]);

  // Playback
  const isPlaying = playIndex >= 0;
  const visibleMessages = isPlaying
    ? tracedMessages.slice(0, playIndex + 1)
    : tracedMessages;

  const startPlay = () => {
    setPlayIndex(0);
  };

  const stopPlay = () => {
    if (playTimer.current) clearInterval(playTimer.current);
    setPlayIndex(-1);
  };

  useEffect(() => {
    if (playIndex >= 0 && playIndex < tracedMessages.length - 1) {
      playTimer.current = setTimeout(() => {
        setPlayIndex(prev => prev + 1);
      }, 1500 / speed);
    } else if (playIndex >= tracedMessages.length - 1) {
      // finished
    }
    return () => {
      if (playTimer.current) clearTimeout(playTimer.current);
    };
  }, [playIndex, speed, tracedMessages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages.length]);

  const toggleStep = (key: string) => {
    setExpandedSteps(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleExpandAll = () => {
    const newVal = !expandAll;
    setExpandAll(newVal);
    const newExpanded: Record<string, boolean> = {};
    visibleMessages.forEach((m, mi) => {
      m.steps.forEach((_, si) => {
        newExpanded[`${mi}-${si}`] = newVal;
      });
    });
    setExpandedSteps(newExpanded);
  };

  const statCards = [
    { icon: '💬', value: stats.msgCount, label: '消息总数', color: '#6366f1' },
    { icon: '⚡', value: stats.toolCalls, label: '技能触发', color: '#f59e0b' },
    { icon: '📄', value: stats.ragRecall, label: 'RAG 召回', color: '#8b5cf6' },
    { icon: '🧠', value: stats.thinkingCount, label: '思考过程', color: '#06b6d4' },
    { icon: '🎯', value: stats.skillMatchCount, label: '技能命中', color: '#a855f7' },
    { icon: '🔄', value: stats.workflowMatchCount, label: '工作流命中', color: '#ec4899' },
    { icon: '⚙️', value: stats.workflowStepCount, label: '工作流步骤', color: '#f472b6' },
    { icon: '⏱️', value: stats.totalTimeMs > 0 ? `${(stats.totalTimeMs / 1000).toFixed(1)}s` : '0s', label: '总耗时', color: '#34d399' },
    { icon: '🎫', value: stats.ticketCount, label: '创建工单', color: '#ec4899' },
  ];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <button style={s.backBtn} onClick={onBack}>← 返回</button>
          <span style={s.headerTitle}>
            {conversationTitle || '对话轨迹'}
          </span>
          <span style={s.msgBadge}>{stats.msgCount} 条消息</span>
        </div>
        <div style={s.headerRight}>
          {/* Playback controls */}
          {!isPlaying ? (
            <button style={s.playBtn} onClick={startPlay}>▶ 重播</button>
          ) : (
            <button style={{ ...s.playBtn, background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }} onClick={stopPlay}>
              ■ 停止
            </button>
          )}
          {[0.5, 1, 2, 4].map(sp => (
            <button
              key={sp}
              style={{
                ...s.speedBtn,
                background: speed === sp ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: speed === sp ? '#a78bfa' : 'rgba(255,255,255,0.3)',
                borderColor: speed === sp ? 'rgba(99,102,241,0.3)' : 'transparent',
              }}
              onClick={() => setSpeed(sp)}
            >
              {sp}x
            </button>
          ))}
          {isPlaying && (
            <span style={s.progress}>
              {playIndex + 1} / {tracedMessages.length}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isPlaying && (
        <div style={s.progressBar}>
          <div style={{
            ...s.progressFill,
            width: `${((playIndex + 1) / tracedMessages.length) * 100}%`,
          }} />
        </div>
      )}

      {/* Stats cards */}
      <div style={s.statsRow}>
        {statCards.map((c, i) => (
          <div key={i} style={s.statCard}>
            <div style={s.statIcon}>{c.icon}</div>
            <div style={{ ...s.statValue, color: c.color }}>
              {c.value}
            </div>
            <div style={s.statLabel}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={s.content} ref={scrollRef}>
        {visibleMessages.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔬</div>
            <div>发送消息后将在此展示 AI 推理轨迹</div>
          </div>
        ) : (
          visibleMessages.map((msg, mi) => (
            <div key={msg.id} style={s.msgBlock}>
              {/* Execution chain — 放在消息气泡上方 */}
              {msg.role === 'assistant' && msg.steps.length > 0 && (
                <div style={s.chainContainer}>
                  <div style={s.chainHeader}>
                    <span style={s.chainIcon}>⚡</span>
                    <span style={s.chainTitle}>执行链路 ({msg.steps.length} 步)</span>
                    <span style={s.chainTotalTime}>
                      {(() => {
                        const total = msg.steps.reduce((sum, st) => sum + (st.timeMs || 0), 0);
                        return total > 0 ? `${(total / 1000).toFixed(1)}s` : '';
                      })()}
                    </span>
                    <button style={s.expandAllBtn} onClick={toggleExpandAll}>
                      {expandAll ? '▲ 全部收起' : '▼ 全部展开'}
                    </button>
                  </div>
                  <div style={s.chainSteps}>
                    {msg.steps.map((step, si) => {
                      const meta = getStepMeta(step);
                      const stepKey = `${mi}-${si}`;
                      const isExpanded = expandedSteps[stepKey] || false;
                      return (
                        <div key={si} style={s.chainStep}>
                          <div
                            style={s.stepRow}
                            onClick={() => toggleStep(stepKey)}
                          >
                            <span style={{
                              ...s.stepNum,
                              background: meta.color,
                            }}>{si + 1}</span>
                            <span style={s.stepIcon}>{meta.icon}</span>
                            <span style={s.stepLabel}>{meta.label}</span>

                            {/* 简要信息 */}
                            {step.type === 'memory_load' && step.meta && (
                              <span style={s.stepHint}>
                                {step.meta.hasSummary ? '摘要✓ ' : ''}
                                短期{step.meta.shortTermCount}条 · 长期{step.meta.longTermCount}条 · 画像{step.meta.profileCount}条
                              </span>
                            )}
                            {step.type === 'skill_match' && step.skills && (
                              <span style={s.stepHint}>
                                {step.skills.map((sk: any) => `${sk.icon}${sk.name}`).join(', ')}
                              </span>
                            )}
                            {step.type === 'thinking_end' && (
                              <span style={s.stepHint}>
                                Round {step.round} · {(step.content || '').length} 字
                              </span>
                            )}
                            {step.type === 'tool_start' && step.args && (
                              <span style={s.stepHint}>
                                {JSON.stringify(step.args).slice(0, 40)}...
                              </span>
                            )}
                            {step.type === 'tool_result' && step.tool === 'search_knowledge' && step.result && (
                              <span style={s.stepHint}>{step.result.recallCount || 0} 条命中</span>
                            )}
                            {step.type === 'tool_result' && step.tool === 'create_ticket' && step.result && (
                              <span style={s.stepHint}>{step.result.ticketNo || ''}</span>
                            )}
                            {step.type === 'workflow_match' && (
                              <span style={s.stepHint}>{(step as any).workflowIcon} {(step as any).workflowName}</span>
                            )}
                            {step.type === 'workflow_start' && (
                              <span style={s.stepHint}>{(step as any).workflowName} · {(step as any).stepCount} 步</span>
                            )}
                            {step.type === 'workflow_step' && (
                              <span style={s.stepHint}>{(step as any).stepName}{(step as any).error ? ' ❌' : ' ✅'}</span>
                            )}
                            {step.type === 'workflow_end' && (
                              <span style={s.stepHint}>{(step as any).totalSteps} 步完成 · {((step as any).totalTimeMs / 1000).toFixed(1)}s</span>
                            )}

                            <span style={s.stepTime}>
                              {step.timeMs ? `${step.timeMs > 1000 ? (step.timeMs / 1000).toFixed(1) + 's' : step.timeMs + 'ms'}` : ''}
                            </span>
                            <span style={s.stepExpand}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          </div>

                          {isExpanded && (
                            <div style={s.stepDetail}>
                              {/* 记忆加载详情 */}
                              {step.type === 'memory_load' && step.meta && (
                                <div style={s.detailSection}>
                                  <div style={s.detailLabel}>🧠 记忆加载详情</div>
                                  <div style={s.ragResult}>
                                    <div style={s.ragRow}>
                                      <span style={s.ragKey}>对话摘要:</span>
                                      <span>{step.meta.hasSummary ? '✅ 已加载' : '❌ 无摘要'}</span>
                                    </div>
                                    <div style={s.ragRow}>
                                      <span style={s.ragKey}>短期记忆(Redis):</span>
                                      <span>{step.meta.shortTermCount} 条</span>
                                    </div>
                                    <div style={s.ragRow}>
                                      <span style={s.ragKey}>长期记忆(mem0):</span>
                                      <span>{step.meta.longTermCount} 条</span>
                                    </div>
                                    <div style={s.ragRow}>
                                      <span style={s.ragKey}>用户画像:</span>
                                      <span>{step.meta.profileCount} 条</span>
                                    </div>
                                    {step.timeMs && (
                                      <div style={s.ragRow}>
                                        <span style={s.ragKey}>加载耗时:</span>
                                        <span>{step.timeMs}ms</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 思考内容 */}
                              {step.type === 'thinking_end' && step.content && (
                                <div style={s.thinkingBox}>
                                  <div style={s.detailLabel}>💭 AI 输出内容</div>
                                  <div style={s.thinkingText}>{step.content}</div>
                                  {step.timeMs && (
                                    <div style={s.thinkingTime}>⏱ 耗时 {(step.timeMs / 1000).toFixed(1)}s</div>
                                  )}
                                </div>
                              )}

                              {/* 技能匹配详情 */}
                              {step.type === 'skill_match' && step.skills && (
                                <div style={s.detailSection}>
                                  <div style={s.detailLabel}>⚡ 命中技能</div>
                                  <div style={s.skillList}>
                                    {step.skills.map((sk: any, ski: number) => (
                                      <div key={ski} style={s.skillItem}>
                                        <span style={s.skillIcon}>{sk.icon}</span>
                                        <span style={s.skillName}>{sk.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 工具参数 */}
                              {step.type === 'tool_start' && step.args && (
                                <div style={s.detailSection}>
                                  <div style={s.detailLabel}>📥 输入参数</div>
                                  <pre style={s.codeBlock}>
                                    {JSON.stringify(step.args, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* 工具结果 */}
                              {step.type === 'tool_result' && step.result && (
                                <div style={s.detailSection}>
                                  <div style={s.detailLabel}>📤 返回结果</div>
                                  <pre style={s.codeBlock}>
                                    {JSON.stringify(step.result, null, 2)}
                                  </pre>
                                  {step.timeMs && (
                                    <div style={s.thinkingTime}>⏱ 耗时 {step.timeMs}ms</div>
                                  )}
                                </div>
                              )}

                              {/* 工作流匹配详情 */}
                              {step.type === 'workflow_match' && (
                                <div style={s.detailSection}>
                                  <div style={s.detailLabel}>🔄 工作流匹配</div>
                                  <div style={s.ragResult}>
                                    <div style={s.ragRow}><span style={s.ragKey}>工作流:</span><span>{step.workflowIcon} {step.workflowName}</span></div>
                                    <div style={s.ragRow}><span style={s.ragKey}>模式:</span><span>{step.workflowMode === 'replace_input' ? '🔄 替代输入' : '🔒 独立工作流'}</span></div>
                                    {step.timeMs && <div style={s.ragRow}><span style={s.ragKey}>匹配耗时:</span><span>{step.timeMs}ms</span></div>}
                                  </div>
                                </div>
                              )}

                              {/* 工作流步骤详情：输入/执行/输出 */}
                              {step.type === 'workflow_step' && (
                                <div style={s.detailSection}>
                                  <div style={s.detailLabel}>
                                    {WORKFLOW_NODE_META[step.stepType || '']?.icon || '⚙️'} {step.stepName || step.stepType}
                                  </div>
                                  <div style={s.ragResult}>
                                    <div style={s.ragRow}><span style={s.ragKey}>节点类型:</span><span>{WORKFLOW_NODE_META[step.stepType || '']?.label || step.stepType}</span></div>
                                    <div style={s.ragRow}><span style={s.ragKey}>节点 ID:</span><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{step.nodeId}</span></div>
                                    {step.params && (
                                      <>
                                        <div style={{ ...s.ragKey, marginTop: 8, marginBottom: 4 }}>📥 输入参数:</div>
                                        <pre style={s.codeBlock}>{JSON.stringify(step.params, null, 2)}</pre>
                                      </>
                                    )}
                                    {step.conditionResult !== undefined && (
                                      <div style={s.ragRow}><span style={s.ragKey}>条件结果:</span><span>{step.conditionResult ? '✅ true' : '❌ false'}</span></div>
                                    )}
                                    {step.result && (
                                      <>
                                        <div style={{ ...s.ragKey, marginTop: 8, marginBottom: 4 }}>📤 执行结果:</div>
                                        <pre style={s.codeBlock}>{typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}</pre>
                                      </>
                                    )}
                                    {step.output && (
                                      <>
                                        <div style={{ ...s.ragKey, marginTop: 8, marginBottom: 4 }}>📨 输出内容:</div>
                                        <pre style={s.codeBlock}>{typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}</pre>
                                      </>
                                    )}
                                    {step.error && (
                                      <div style={{ ...s.ragRow, color: '#ef4444' }}><span style={s.ragKey}>❌ 错误:</span><span>{step.error}</span></div>
                                    )}
                                    {step.timeMs && (
                                      <div style={s.ragRow}><span style={s.ragKey}>耗时:</span><span>{step.timeMs}ms</span></div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 工作流完成详情 */}
                              {step.type === 'workflow_end' && (
                                <div style={s.detailSection}>
                                  <div style={s.detailLabel}>✅ 工作流完成</div>
                                  <div style={s.ragResult}>
                                    <div style={s.ragRow}><span style={s.ragKey}>总步骤:</span><span>{step.totalSteps} 步</span></div>
                                    <div style={s.ragRow}><span style={s.ragKey}>总耗时:</span><span>{step.totalTimeMs ? `${(step.totalTimeMs / 1000).toFixed(1)}s` : '-'}</span></div>
                                  </div>
                                </div>
                              )}

                              {/* 工作流 LLM 调用详情 */}
                              {step.type === 'workflow_llm' && (
                                <div style={s.detailSection}>
                                  <div style={s.detailLabel}>🤖 {step.purpose || 'LLM 调用'}</div>
                                  <div style={s.ragResult}>
                                    <div style={s.ragRow}><span style={s.ragKey}>阶段:</span><span>{step.stage === 'start' ? '⏳ 开始调用' : '✅ 调用完成'}</span></div>
                                    <div style={s.ragRow}><span style={s.ragKey}>节点 ID:</span><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{step.nodeId}</span></div>
                                    {step.input && <div style={s.ragRow}><span style={s.ragKey}>输入:</span><span>{step.input}</span></div>}
                                    {step.timeMs && <div style={s.ragRow}><span style={s.ragKey}>耗时:</span><span>{step.timeMs}ms</span></div>}
                                  </div>
                                </div>
                              )}

                              {/* 工作流输出（replace_input 模式） */}
                              {step.type === 'workflow_output' && (
                                <div style={s.detailSection}>
                                  <div style={s.detailLabel}>📨 工作流输出（{step.mode === 'replace_input' ? '替代用户输入' : '直接返回'}）</div>
                                  <pre style={s.codeBlock}>{step.content}</pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Message bubble */}
              <div style={{
                ...s.msgBubble,
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))'
                  : 'rgba(255,255,255,0.04)',
                borderColor: msg.role === 'user'
                  ? 'rgba(99,102,241,0.2)'
                  : 'rgba(255,255,255,0.06)',
                maxWidth: msg.role === 'user' ? '60%' : '80%',
              }}>
                <div style={s.msgText}>
                  {msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content}
                </div>
                <div style={s.msgMeta}>
                  <span style={s.metaTime}>{msg.time}</span>
                  {msg.steps.filter(st => st.type === 'tool_result').length > 0 && (
                    <span style={s.metaTag}>
                      ⚡{msg.steps.filter(st => st.type === 'tool_result').length}
                    </span>
                  )}
                  {msg.steps.some(st => st.type === 'thinking_end') && (
                    <span style={{ ...s.metaTag, background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
                      🧠
                    </span>
                  )}
                  {msg.steps.some(st => st.timeMs) && (
                    <span style={{ ...s.metaTag, background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                      ⏱ {(msg.steps.reduce((sum, st) => sum + (st.timeMs || 0), 0) / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
    background: 'linear-gradient(180deg, #0c0c1d 0%, #080816 100%)',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },

  // Header
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(99,102,241,0.03)', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  backBtn: {
    padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)',
    fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
  },
  headerTitle: {
    fontSize: '16px', fontWeight: 700, color: '#fff',
  },
  msgBadge: {
    fontSize: '11px', color: '#a78bfa',
    background: 'rgba(99,102,241,0.12)', padding: '2px 10px',
    borderRadius: '10px', fontWeight: 500,
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: '6px' },
  playBtn: {
    padding: '6px 16px', borderRadius: '8px',
    border: '1px solid rgba(99,102,241,0.3)',
    background: 'rgba(99,102,241,0.15)', color: '#a78bfa',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
  },
  speedBtn: {
    padding: '4px 10px', borderRadius: '6px',
    border: '1px solid transparent', background: 'transparent',
    color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s',
  },
  progress: {
    fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginLeft: '8px',
  },

  // Progress bar
  progressBar: {
    height: '3px', background: 'rgba(99,102,241,0.1)', flexShrink: 0,
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
    borderRadius: '0 2px 2px 0',
    transition: 'width 0.3s ease',
  },

  // Stats
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px',
    padding: '16px 24px', flexShrink: 0,
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  statCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '12px 8px', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    transition: 'all 0.2s',
  },
  statIcon: { fontSize: '16px', marginBottom: '4px' },
  statValue: {
    fontSize: '22px', fontWeight: 700, lineHeight: 1.2,
  },
  statLabel: {
    fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '2px',
    fontWeight: 500,
  },

  // Content
  content: {
    flex: 1, overflowY: 'auto', padding: '16px 24px',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '300px',
    color: 'rgba(255,255,255,0.2)', fontSize: '14px',
  },

  // Message block
  msgBlock: {
    display: 'flex', flexDirection: 'column', marginBottom: '16px',
  },
  msgBubble: {
    padding: '12px 16px', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    maxWidth: '80%',
  },
  msgText: {
    fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.75)',
    whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
  },
  msgMeta: {
    display: 'flex', alignItems: 'center', gap: '6px',
    marginTop: '8px', flexWrap: 'wrap',
  },
  metaTime: {
    fontSize: '10px', color: 'rgba(255,255,255,0.2)',
  },
  metaTag: {
    fontSize: '10px', fontWeight: 600,
    padding: '1px 6px', borderRadius: '4px',
    background: 'rgba(245,158,11,0.12)', color: '#fbbf24',
  },

  // Execution chain
  chainContainer: {
    marginTop: '8px', borderRadius: '10px',
    border: '1px solid rgba(99,102,241,0.12)',
    background: 'rgba(99,102,241,0.03)',
    overflow: 'hidden', maxWidth: '80%',
  },
  chainHeader: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '10px 14px',
    background: 'rgba(99,102,241,0.05)',
    borderBottom: '1px solid rgba(99,102,241,0.08)',
  },
  chainIcon: { fontSize: '13px' },
  chainTitle: {
    fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  chainTotalTime: {
    fontSize: '11px', fontWeight: 600, color: '#34d399',
    marginRight: '8px',
  },
  expandAllBtn: {
    fontSize: '10px', color: 'rgba(255,255,255,0.3)',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '2px 6px',
  },
  chainSteps: { padding: '6px 0' },

  // Step row
  chainStep: {
    borderBottom: '1px solid rgba(255,255,255,0.03)',
  },
  stepRow: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '8px 14px', cursor: 'pointer',
    transition: 'background 0.1s',
  },
  stepNum: {
    width: '22px', height: '22px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  stepIcon: { fontSize: '14px' },
  stepLabel: {
    fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.75)',
  },
  stepHint: {
    fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginLeft: 'auto',
  },
  stepTime: {
    fontSize: '10px', color: 'rgba(52,211,153,0.7)', fontWeight: 500,
  },
  stepExpand: {
    fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginLeft: '6px',
  },

  // Step detail
  stepDetail: {
    padding: '0 14px 10px 44px',
  },
  detailSection: { marginBottom: '8px' },
  detailLabel: {
    fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)',
    marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px',
  },
  codeBlock: {
    fontSize: '10px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5,
    padding: '8px 10px', borderRadius: '6px',
    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.04)',
    margin: 0, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const,
    maxHeight: '120px', overflow: 'auto',
  },
  thinkingBox: { marginBottom: '8px' },
  thinkingText: {
    fontSize: '11px', color: 'rgba(251,191,36,0.6)', lineHeight: 1.6,
    padding: '8px 10px', borderRadius: '6px',
    background: 'rgba(251,191,36,0.04)',
    border: '1px solid rgba(251,191,36,0.08)',
    fontStyle: 'italic', whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const, maxHeight: '150px', overflow: 'auto',
  },

  // RAG result
  ragResult: {
    padding: '8px 10px', borderRadius: '6px',
    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)',
  },
  ragRow: {
    display: 'flex', alignItems: 'baseline', gap: '6px',
    fontSize: '11px', color: 'rgba(255,255,255,0.55)',
    marginBottom: '4px', flexWrap: 'wrap' as const,
  },
  ragKey: {
    color: 'rgba(255,255,255,0.3)', fontWeight: 600, fontSize: '10px',
  },
  ragKeywords: {
    display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px',
  },
  kwTag: {
    fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
    background: 'rgba(99,102,241,0.12)', color: '#a78bfa',
  },
  ragContext: { marginTop: '8px' },
  contextText: {
    fontSize: '10px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6,
    padding: '6px 8px', borderRadius: '4px',
    background: 'rgba(0,0,0,0.3)', maxHeight: '120px',
    overflow: 'auto', whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },

  // Thinking time
  thinkingTime: {
    fontSize: '10px', color: 'rgba(52,211,153,0.6)', fontWeight: 600,
    marginTop: '6px', textAlign: 'right' as const,
  },

  // Skill match
  skillList: {
    display: 'flex', flexWrap: 'wrap' as const, gap: '8px',
    padding: '8px 10px', borderRadius: '6px',
    background: 'rgba(168,85,247,0.05)',
    border: '1px solid rgba(168,85,247,0.1)',
  },
  skillItem: {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '4px 10px', borderRadius: '6px',
    background: 'rgba(168,85,247,0.12)',
  },
  skillIcon: { fontSize: '14px' },
  skillName: {
    fontSize: '12px', fontWeight: 600, color: '#c084fc',
  },
};

export default TrajectoryPage;
