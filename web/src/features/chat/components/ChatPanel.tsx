import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { Message, ToolStatus } from '../types';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import CustomerInfoCard from '../../customer/components/CustomerInfoCard';

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (message: string) => void;
  onStop?: () => void;
  conversationId?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  toolStatuses?: ToolStatus[];
}

const SUGGESTIONS = [
  { icon: '💬', text: '我想咨询一个问题', desc: '向AI客服提问' },
  { icon: '🎫', text: '帮我创建一个工单', desc: '提交问题工单' },
  { icon: '🔍', text: '搜索知识库', desc: '查找相关文档' },
  { icon: '📋', text: '查看我的工单状态', desc: '跟踪处理进度' },
];

/**
 * 思考中指示器 — 带计时，支持工作流状态
 */
const ThinkingIndicator: React.FC<{ toolStatuses?: ToolStatus[] }> = ({ toolStatuses }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // 检测工作流状态
  const workflowState = useMemo(() => {
    if (!toolStatuses || toolStatuses.length === 0) return null;
    const match = toolStatuses.find(s => s.type === 'workflow_match');
    if (!match) return null;
    const steps = toolStatuses.filter(s => s.type === 'workflow_step');
    const ended = toolStatuses.find(s => s.type === 'workflow_end');
    if (ended) return null; // 已结束
    return {
      name: match.workflowName || '工作流',
      icon: match.workflowIcon || '🔄',
      stepCount: steps.length,
      lastStep: steps.length > 0 ? steps[steps.length - 1] : null,
    };
  }, [toolStatuses]);

  const isWorkflow = !!workflowState;

  return (
    <div style={styles.thinkingRow}>
      <div style={styles.thinkingAvatar}>
        {isWorkflow ? (
          <span style={{ fontSize: 18 }}>{workflowState!.icon}</span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M17 12.5C17 15.26 14.76 17.5 12 17.5C9.24 17.5 7 15.26 7 12.5V10C7 7.24 9.24 5 12 5C14.76 5 17 7.24 17 10V12.5Z"
              stroke="#8b5cf6" strokeWidth="1.5" fill="none"
            />
            <circle cx="9.5" cy="10.5" r="1" fill="#8b5cf6" />
            <circle cx="14.5" cy="10.5" r="1" fill="#6366f1" />
          </svg>
        )}
      </div>
      <div style={{ ...styles.thinkingBar, borderColor: isWorkflow ? 'rgba(236,72,153,0.3)' : undefined, background: isWorkflow ? 'rgba(236,72,153,0.06)' : undefined }}>
        <span style={styles.thinkingPulse}>{isWorkflow ? '⚙️' : '🧠'}</span>
        <span style={styles.thinkingLabel}>
          {isWorkflow ? `${workflowState!.name} 运行中` : '思考中'}
        </span>
        {isWorkflow && workflowState!.lastStep && (
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>
            · {workflowState!.lastStep.stepName || `步骤 ${workflowState!.stepCount}`}
          </span>
        )}
        <span style={styles.thinkingDots}>
          <span style={{ ...styles.dot, animationDelay: '0s' }} />
          <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
          <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
        </span>
        <span style={styles.thinkingTime}>{elapsed}s</span>
      </div>
    </div>
  );
};

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, isLoading, onSend, onStop, conversationId, hasMore, onLoadMore, toolStatuses }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const isEmpty = messages.length === 0;

  return (
    <div style={styles.panel}>
      {/* 客户信息卡片 */}
      {!isEmpty && <CustomerInfoCard conversationId={conversationId || null} />}
      <div style={styles.messagesArea} ref={listRef}>
        {hasMore && (
          <div style={styles.loadMoreWrap}>
            <button style={styles.loadMoreBtn} onClick={onLoadMore}>
              ⬆ 加载更早的消息
            </button>
          </div>
        )}
        {isEmpty ? (
          <div style={styles.welcomeContainer}>
            <div style={styles.welcomeIcon}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="30" fill="url(#welcomeGrad)" opacity="0.08" />
                <path
                  d="M44 34C44 40.63 38.63 46 32 46C25.37 46 20 40.63 20 34V28C20 21.37 25.37 16 32 16C38.63 16 44 21.37 44 28V34Z"
                  stroke="url(#welcomeGrad)"
                  strokeWidth="2"
                  fill="none"
                />
                <circle cx="27" cy="29" r="2" fill="#8b5cf6" />
                <circle cx="37" cy="29" r="2" fill="#6366f1" />
                <path
                  d="M28 37C28 37 29.5 39 32 39C34.5 39 36 37 36 37"
                  stroke="url(#welcomeGrad)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  fill="none"
                />
                <path d="M32 8V16" stroke="url(#welcomeGrad)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="32" cy="7" r="2.5" fill="#8b5cf6" />
                <path d="M15 27V30" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
                <path d="M49 27V30" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />
                <path d="M26 46L24 53" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M38 46L40 53" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" />
                <defs>
                  <linearGradient id="welcomeGrad" x1="16" y1="8" x2="48" y2="56">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h2 style={styles.welcomeTitle}>有什么可以帮您？</h2>
            <p style={styles.welcomeSubtitle}>
              我是您的AI智能助手，随时为您提供帮助
            </p>
            <div style={styles.suggestionsGrid}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  style={styles.suggestionCard}
                  onClick={() => onSend(s.text)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.25)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <span style={styles.suggestionIcon}>{s.icon}</span>
                  <span style={styles.suggestionText}>{s.text}</span>
                  <span style={styles.suggestionDesc}>{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.messagesList}>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ThinkingIndicator toolStatuses={toolStatuses} />
                {onStop && (
                  <button
                    onClick={onStop}
                    style={{
                      padding: '6px 14px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 8,
                      color: '#ef4444',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                    }}
                  >
                    ⏹ 停止
                  </button>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatInput onSend={onSend} disabled={isLoading} />

      {/* Inject keyframe animations */}
      <style>{`
        @keyframes inputBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes toolPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    position: 'relative',
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '16px 0',
  },
  messagesList: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '0 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  // Welcome screen
  welcomeContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px 20px',
    gap: '8px',
  },
  welcomeIcon: {
    marginBottom: '8px',
    animation: 'pulse 3s ease-in-out infinite',
  },
  welcomeTitle: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
    color: '#ffffff',
    fontFamily: "'Inter', sans-serif",
    letterSpacing: '-0.3px',
  },
  welcomeSubtitle: {
    margin: '4px 0 24px',
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: "'Inter', sans-serif",
  },
  suggestionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    maxWidth: '480px',
    width: '100%',
  },
  suggestionCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '14px',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    textAlign: 'left',
    fontFamily: "'Inter', sans-serif",
  },
  suggestionIcon: {
    fontSize: '22px',
  },
  suggestionText: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  suggestionDesc: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
  },

  // Typing indicator
  typingContainer: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '4px 0',
  },
  typingAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '12px',
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  typingBubble: {
    padding: '14px 18px',
    borderRadius: '4px 18px 18px 18px',
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  typingDots: {
    display: 'flex',
    gap: '5px',
    alignItems: 'center',
    height: '18px',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'inline-block',
    animation: 'dotBounce 1.4s ease-in-out infinite',
  },
  thinkingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '4px 0',
  },
  thinkingAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '12px',
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  thinkingBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    margin: '4px 0',
    maxWidth: '420px',
    borderRadius: '12px',
    background: 'rgba(251, 191, 36, 0.04)',
    border: '1px solid rgba(251, 191, 36, 0.1)',
    whiteSpace: 'nowrap' as const,
  },
  thinkingPulse: {
    fontSize: '14px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  thinkingLabel: {
    fontSize: '13px',
    color: 'rgba(251, 191, 36, 0.7)',
    fontWeight: 600,
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  thinkingDots: {
    display: 'flex',
    gap: '3px',
    alignItems: 'center',
  },
  thinkingTime: {
    fontSize: '12px',
    color: 'rgba(251, 191, 36, 0.45)',
    fontFamily: "'Inter', monospace",
    fontWeight: 500,
    marginLeft: 'auto',
  },
  loadMoreWrap: {
    textAlign: 'center' as const,
    padding: '12px 0',
  },
  loadMoreBtn: {
    background: 'rgba(99, 102, 241, 0.1)',
    color: '#818cf8',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    borderRadius: '20px',
    padding: '6px 18px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default ChatPanel;
