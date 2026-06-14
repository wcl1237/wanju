import React, { useState, useEffect } from 'react';
import type { Message } from '../types';

export type { Message };

interface ChatMessageProps {
  message: Message;
}

const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  create_ticket: { icon: '🎫', label: '创建工单' },
  search_knowledge: { icon: '🔍', label: '搜索知识库' },
  get_ticket: { icon: '📋', label: '查询工单' },
  update_ticket: { icon: '✏️', label: '更新工单' },
  list_tickets: { icon: '📑', label: '工单列表' },
};

const parseContent = (content: string): React.ReactNode[] => {
  const lines = content.split('\n');
  const result: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      result.push(<br key={`br-${lineIdx}`} />);
    }

    // Handle headers
    if (line.startsWith('### ')) {
      result.push(
        <strong key={`h3-${lineIdx}`} style={{ fontSize: '14px', display: 'block', margin: '8px 0 4px' }}>
          {line.slice(4)}
        </strong>
      );
      return;
    }
    if (line.startsWith('## ')) {
      result.push(
        <strong key={`h2-${lineIdx}`} style={{ fontSize: '15px', display: 'block', margin: '10px 0 4px' }}>
          {line.slice(3)}
        </strong>
      );
      return;
    }

    // Handle list items
    const listMatch = line.match(/^(\s*[-*]\s+)(.*)/);
    if (listMatch) {
      result.push(
        <div key={`li-${lineIdx}`} style={{ display: 'flex', gap: '6px', padding: '1px 0' }}>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
          <span>{parseInline(listMatch[2], lineIdx)}</span>
        </div>
      );
      return;
    }

    // Handle numbered list
    const numMatch = line.match(/^(\d+\.\s+)(.*)/);
    if (numMatch) {
      result.push(
        <div key={`ol-${lineIdx}`} style={{ display: 'flex', gap: '6px', padding: '1px 0' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{numMatch[1]}</span>
          <span>{parseInline(numMatch[2], lineIdx)}</span>
        </div>
      );
      return;
    }

    result.push(<span key={`line-${lineIdx}`}>{parseInline(line, lineIdx)}</span>);
  });

  return result;
};

const parseInline = (text: string, lineIdx: number): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  // Match **bold**, `code`, and plain text
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${lineIdx}-${partIdx++}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[2]) {
      parts.push(
        <strong key={`b-${lineIdx}-${partIdx++}`} style={{ fontWeight: 600, color: '#e0e0ff' }}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <code
          key={`c-${lineIdx}-${partIdx++}`}
          style={{
            background: 'rgba(99, 102, 241, 0.15)',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '0.9em',
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            color: '#c4b5fd',
          }}
        >
          {match[3]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`t-${lineIdx}-${partIdx}`}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : [<span key={`empty-${lineIdx}`}>{text}</span>];
};

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [visible, setVisible] = useState(false);
  const [showTime, setShowTime] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems:
      message.role === 'user'
        ? 'flex-end'
        : message.role === 'system' || message.role === 'tool'
        ? 'center'
        : 'flex-start',
    padding: '4px 0',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(10px)',
    transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  // Tool message
  if (message.role === 'tool') {
    const toolInfo = message.toolCallId
      ? TOOL_LABELS[message.toolCallId] || { icon: '⚙️', label: '工具调用' }
      : { icon: '⚙️', label: '工具调用' };

    return (
      <div style={containerStyle}>
        <div style={styles.toolMessage}>
          <div style={styles.toolHeader}>
            <span style={styles.toolIcon}>{toolInfo.icon}</span>
            <span style={styles.toolLabel}>{toolInfo.label} 结果</span>
          </div>
          <div style={styles.toolContent}>{message.content}</div>
        </div>
      </div>
    );
  }

  // System message
  if (message.role === 'system') {
    return (
      <div style={containerStyle}>
        <div style={styles.systemMessage}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" />
            <path d="M7 4V7.5M7 9.5V10" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  // User message
  if (message.role === 'user') {
    return (
      <div
        style={containerStyle}
        onMouseEnter={() => setShowTime(true)}
        onMouseLeave={() => setShowTime(false)}
      >
        <div style={styles.userBubble}>
          <div style={styles.userContent}>{parseContent(message.content)}</div>
        </div>
        <div
          style={{
            ...styles.timestamp,
            opacity: showTime ? 1 : 0,
            transform: showTime ? 'translateY(0)' : 'translateY(-4px)',
          }}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div
      style={containerStyle}
      onMouseEnter={() => setShowTime(true)}
      onMouseLeave={() => setShowTime(false)}
    >
      <div style={styles.assistantRow}>
        <div style={styles.avatar}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M17 12.5C17 15.26 14.76 17.5 12 17.5C9.24 17.5 7 15.26 7 12.5V10C7 7.24 9.24 5 12 5C14.76 5 17 7.24 17 10V12.5Z"
              stroke="url(#msgGrad)"
              strokeWidth="1.5"
              fill="none"
            />
            <circle cx="9.5" cy="10.5" r="1" fill="#8b5cf6" />
            <circle cx="14.5" cy="10.5" r="1" fill="#6366f1" />
            <path d="M10 14C10 14 10.5 15 12 15C13.5 15 14 14 14 14" stroke="url(#msgGrad)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
            <path d="M12 2V5" stroke="url(#msgGrad)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="12" cy="2" r="1" fill="#8b5cf6" />
            <defs>
              <linearGradient id="msgGrad" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div style={styles.assistantBubble}>
          {/* 思考过程 */}
          {message.traceSteps && message.traceSteps.filter(s =>
            s.tool === '__thinking__' && s.thinking
            && s.thinking !== '正在分析用户意图...'
            && s.thinking !== '无需调用工具，直接生成回复'
          ).length > 0 && (
            <div style={styles.thinkingContainer}>
              {message.traceSteps
                .filter(s =>
                  s.tool === '__thinking__' && s.thinking
                  && s.thinking !== '正在分析用户意图...'
                  && s.thinking !== '无需调用工具，直接生成回复'
                )
                .map((s, i) => (
                  <div key={i} style={styles.thinkingItem}>
                    <span style={styles.thinkingIcon}>
                      {s.status === 'running' ? '⏳' : '🧠'}
                    </span>
                    <span style={styles.thinkingText}>
                      {s.thinking!.length > 100 ? s.thinking!.slice(0, 100) + '...' : s.thinking}
                    </span>
                    {s.timeMs && (
                      <span style={styles.thinkingTimeTag}>
                        {(s.timeMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}

          <div style={styles.assistantContent}>{parseContent(message.content)}</div>
        </div>
      </div>
      <div
        style={{
          ...styles.timestamp,
          ...styles.timestampLeft,
          opacity: showTime ? 1 : 0,
          transform: showTime ? 'translateY(0)' : 'translateY(-4px)',
        }}
      >
        {formatTime(message.createdAt)}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  // User bubble
  userBubble: {
    maxWidth: '70%',
    padding: '12px 16px',
    borderRadius: '18px 18px 4px 18px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.25)',
  },
  userContent: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#ffffff',
    fontFamily: "'Inter', sans-serif",
    wordBreak: 'break-word',
  },

  // Assistant bubble
  assistantRow: {
    display: 'flex',
    gap: '10px',
    maxWidth: '80%',
    alignItems: 'flex-start',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '12px',
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '2px',
  },
  assistantBubble: {
    padding: '12px 16px',
    borderRadius: '4px 18px 18px 18px',
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 2px 16px rgba(0, 0, 0, 0.15)',
  },
  assistantContent: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: 'rgba(255, 255, 255, 0.88)',
    fontFamily: "'Inter', sans-serif",
    wordBreak: 'break-word',
  },

  // Thinking indicator
  thinkingContainer: {
    marginBottom: '8px',
    padding: '6px 10px',
    borderRadius: '8px',
    background: 'rgba(251, 191, 36, 0.04)',
    border: '1px solid rgba(251, 191, 36, 0.08)',
  },
  thinkingItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    marginBottom: '2px',
  },
  thinkingIcon: {
    fontSize: '12px',
    flexShrink: 0,
    marginTop: '1px',
  },
  thinkingText: {
    fontSize: '12px',
    color: 'rgba(251, 191, 36, 0.6)',
    lineHeight: 1.5,
    fontStyle: 'italic' as const,
    flex: 1,
  },
  thinkingTimeTag: {
    fontSize: '10px',
    color: 'rgba(52, 211, 153, 0.6)',
    fontWeight: 600,
    flexShrink: 0,
    fontFamily: "'Inter', monospace",
  },

  // Tool calls within assistant message
  toolCallsContainer: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  toolCallCard: {
    background: 'rgba(99, 102, 241, 0.08)',
    border: '1px solid rgba(99, 102, 241, 0.12)',
    borderRadius: '10px',
    padding: '10px 12px',
  },
  toolCallHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  toolCallIcon: {
    fontSize: '14px',
  },
  toolCallName: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#a78bfa',
    fontFamily: "'Inter', sans-serif",
  },
  toolCallSpinner: {
    display: 'flex',
    gap: '3px',
    marginLeft: '6px',
  },
  spinnerDot: {
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    background: '#8b5cf6',
    opacity: 0.5,
    animation: 'toolPulse 1.2s ease-in-out infinite',
  },
  toolCallArgs: {
    marginTop: '6px',
    padding: '6px 8px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '6px',
    overflow: 'auto',
  },
  toolCallCode: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  toolCallResult: {
    marginTop: '6px',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: "'Inter', sans-serif",
    lineHeight: 1.5,
  },
  toolResultLabel: {
    fontWeight: 600,
    color: '#a78bfa',
    marginRight: '4px',
  },

  // System message
  systemMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '20px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.35)',
    fontFamily: "'Inter', sans-serif",
  },

  // Tool result message
  toolMessage: {
    maxWidth: '60%',
    padding: '10px 14px',
    borderRadius: '12px',
    background: 'rgba(99, 102, 241, 0.06)',
    border: '1px solid rgba(99, 102, 241, 0.1)',
  },
  toolHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  toolIcon: {
    fontSize: '14px',
  },
  toolLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#a78bfa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    fontFamily: "'Inter', sans-serif",
  },
  toolContent: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.55)',
    fontFamily: "'Inter', sans-serif",
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },

  // Timestamp
  timestamp: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.2)',
    marginTop: '4px',
    transition: 'all 0.2s ease',
    fontFamily: "'Inter', sans-serif",
  },
  timestampLeft: {
    marginLeft: '46px',
  },
};

export default ChatMessage;
