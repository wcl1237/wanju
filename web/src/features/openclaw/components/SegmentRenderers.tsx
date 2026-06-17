import React, { useState, useEffect } from 'react';
import type { ToolCallState } from '../utils/stream-normalizer';

// --- Text Renderer ---
const parseInline = (text: string, lineIdx: number): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
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
        <strong key={`b-${lineIdx}-${partIdx++}`} style={styles.bold}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <code key={`c-${lineIdx}-${partIdx++}`} style={styles.inlineCode}>
          {match[3]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`t-${lineIdx}-${partIdx++}`}>{text.slice(lastIndex)}</span>);
  }

  return parts;
};

const parseLines = (text: string): React.ReactNode[] => {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      result.push(<br key={`br-${lineIdx}`} />);
    }

    // Headers
    if (line.startsWith('### ')) {
      result.push(
        <strong key={`h3-${lineIdx}`} style={styles.h3}>
          {line.slice(4)}
        </strong>
      );
      return;
    }
    if (line.startsWith('## ')) {
      result.push(
        <strong key={`h2-${lineIdx}`} style={styles.h2}>
          {line.slice(3)}
        </strong>
      );
      return;
    }
    if (line.startsWith('# ')) {
      result.push(
        <strong key={`h1-${lineIdx}`} style={styles.h1}>
          {line.slice(2)}
        </strong>
      );
      return;
    }

    // Bullet lists
    const listMatch = line.match(/^(\s*[-*]\s+)(.*)/);
    if (listMatch) {
      result.push(
        <div key={`li-${lineIdx}`} style={styles.li}>
          <span style={styles.bullet}>•</span>
          <span>{parseInline(listMatch[2], lineIdx)}</span>
        </div>
      );
      return;
    }

    // Numbered lists
    const numMatch = line.match(/^(\d+\.\s+)(.*)/);
    if (numMatch) {
      result.push(
        <div key={`ol-${lineIdx}`} style={styles.li}>
          <span style={styles.number}>{numMatch[1]}</span>
          <span>{parseInline(numMatch[2], lineIdx)}</span>
        </div>
      );
      return;
    }

    result.push(<span key={`line-${lineIdx}`}>{parseInline(line, lineIdx)}</span>);
  });

  return result;
};

export const TextRenderer: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;

  // Split content by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div style={styles.textContainer}>
      {parts.map((part, idx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          // Parse language and code content
          const match = part.match(/```(\w*)\n([\s\S]*?)```/);
          const lang = match ? match[1] : '';
          const code = match ? match[2] : part.slice(3, -3);

          return (
            <div key={idx} style={styles.codeBlockContainer}>
              {lang && <div style={styles.codeBlockLang}>{lang}</div>}
              <pre style={styles.codeBlockPre}>
                <code style={styles.codeBlockCode}>{code}</code>
              </pre>
            </div>
          );
        } else {
          return <React.Fragment key={idx}>{parseLines(part)}</React.Fragment>;
        }
      })}
    </div>
  );
};

// --- Error Renderer ---
export const ErrorRenderer: React.FC<{ error: string }> = ({ error }) => {
  if (!error) return null;
  return (
    <div style={styles.errorBox}>
      <div style={styles.errorHeader}>
        <span style={styles.errorIcon}>⚠️</span>
        <span style={styles.errorTitle}>执行错误 / 超时</span>
      </div>
      <div style={styles.errorContent}>{error}</div>
    </div>
  );
};

// --- Browser Screenshot / Details Renderer ---
const getScreenshotData = (result: any): string | null => {
  if (!result) return null;

  if (typeof result === 'string') {
    const cleaned = result.trim();
    if (cleaned.startsWith('data:image/')) return cleaned;
    if (cleaned.length > 500 && /^[A-Za-z0-9+/=\s\n]+$/.test(cleaned)) {
      return `data:image/png;base64,${cleaned}`;
    }
  }

  if (typeof result === 'object') {
    const keys = ['screenshot', 'image', 'img', 'base64', 'data'];
    for (const key of keys) {
      if (typeof result[key] === 'string') {
        const val = result[key].trim();
        if (val.startsWith('data:image/')) return val;
        if (val.length > 500 && /^[A-Za-z0-9+/=\s\n]+$/.test(val)) {
          return `data:image/png;base64,${val}`;
        }
      }
    }
  }

  return null;
};

export const BrowserToolCard: React.FC<{ toolCall: ToolCallState }> = ({ toolCall }) => {
  const screenshot = getScreenshotData(toolCall.result);
  const parsedArgs = typeof toolCall.arguments === 'string'
    ? (() => {
        try { return JSON.parse(toolCall.arguments); } catch { return toolCall.arguments; }
      })()
    : toolCall.arguments;

  return (
    <div style={styles.toolDetailCard}>
      <div style={styles.detailSection}>
        <span style={styles.detailLabel}>操作参数:</span>
        <pre style={styles.argsPre}>
          {typeof parsedArgs === 'object'
            ? JSON.stringify(parsedArgs, null, 2)
            : String(parsedArgs)}
        </pre>
      </div>
      {screenshot && (
        <div style={styles.screenshotContainer}>
          <div style={styles.screenshotHeader}>📸 浏览器屏幕截图</div>
          <img src={screenshot} alt="Browser screenshot" style={styles.screenshotImg} />
        </div>
      )}
    </div>
  );
};

// --- Terminal Code/Command Execution Card ---
export const CommandToolCard: React.FC<{ toolCall: ToolCallState }> = ({ toolCall }) => {
  const parsedArgs = typeof toolCall.arguments === 'string'
    ? (() => {
        try { return JSON.parse(toolCall.arguments); } catch { return toolCall.arguments; }
      })()
    : toolCall.arguments;

  const cmd = parsedArgs?.CommandLine || parsedArgs?.cmd || parsedArgs?.command || '';
  const cwd = parsedArgs?.Cwd || parsedArgs?.cwd || '';

  const getOutputText = (result: any): string => {
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (typeof result === 'object') {
      return result.stdout || result.output || result.result || JSON.stringify(result, null, 2);
    }
    return String(result);
  };

  const output = getOutputText(toolCall.result);

  return (
    <div style={styles.terminalContainer}>
      <div style={styles.terminalHeader}>
        <span style={styles.terminalDotRed} />
        <span style={styles.terminalDotYellow} />
        <span style={styles.terminalDotGreen} />
        <span style={styles.terminalTitle}>终端命令行</span>
      </div>
      <div style={styles.terminalBody}>
        {cwd && <div style={styles.terminalCwd}>Cwd: {cwd}</div>}
        {cmd && <div style={styles.terminalCmd}>$ {cmd}</div>}
        {toolCall.phase === 'running' && (
          <div style={styles.terminalRunning}>⏳ 正在执行命令...</div>
        )}
        {toolCall.phase === 'result' && output && (
          <pre style={styles.terminalOutput}>{output}</pre>
        )}
      </div>
    </div>
  );
};

// --- Tool Call Main Renderer ---
export const ToolCallRenderer: React.FC<{ toolCall: ToolCallState }> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(
    toolCall.phase === 'running' || !!toolCall.isError
  );

  useEffect(() => {
    if (toolCall.phase === 'running' || toolCall.isError) {
      setIsExpanded(true);
    }
  }, [toolCall.phase, toolCall.isError]);

  const name = toolCall.name;
  const isBrowser = name.startsWith('browser') || 
                    ['click', 'navigate', 'type', 'press_key', 'hover', 'drag', 'take_screenshot', 'lighthouse_audit', 'close_page', 'new_page', 'resize_page'].includes(name) ||
                    name.includes('screenshot');
  const isCommand = name.startsWith('run_command') || name.startsWith('execute') || name.includes('bash') || name.includes('sh');

  const getStatusText = () => {
    if (toolCall.isError) return '运行失败';
    if (toolCall.phase === 'start') return '准备中';
    if (toolCall.phase === 'running') return '运行中';
    return '已完成';
  };

  const getStatusColor = () => {
    if (toolCall.isError) return '#ef4444';
    if (toolCall.phase === 'start') return '#fbbf24';
    if (toolCall.phase === 'running') return '#3b82f6';
    return '#10b981';
  };

  const getToolIcon = () => {
    if (isBrowser) return '🌐';
    if (isCommand) return '💻';
    if (name.includes('file') || name.includes('dir')) return '📂';
    return '⚙️';
  };

  return (
    <div style={{
      ...styles.toolCallCard,
      borderLeft: `3px solid ${getStatusColor()}`
    }}>
      <div 
        style={styles.toolCallHeader} 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span style={styles.toolCallIcon}>{getToolIcon()}</span>
        <span style={styles.toolCallName}>{name}</span>
        <div style={styles.headerRight}>
          <span style={{
            ...styles.statusBadge,
            backgroundColor: `${getStatusColor()}1a`,
            color: getStatusColor(),
            border: `1px solid ${getStatusColor()}33`
          }}>
            {getStatusText()}
          </span>
          {toolCall.phase === 'running' && (
            <div style={styles.toolCallSpinner}>
              <div style={{ ...styles.spinnerDot, animationDelay: '0s' }} />
              <div style={{ ...styles.spinnerDot, animationDelay: '0.2s' }} />
              <div style={{ ...styles.spinnerDot, animationDelay: '0.4s' }} />
            </div>
          )}
          <span style={styles.expandArrow}>{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {isExpanded && (
        <div style={styles.toolCallContent}>
          {isBrowser ? (
            <BrowserToolCard toolCall={toolCall} />
          ) : isCommand ? (
            <CommandToolCard toolCall={toolCall} />
          ) : (
            <div style={styles.genericDetails}>
              <div style={styles.detailSection}>
                <span style={styles.detailLabel}>传入参数:</span>
                <pre style={styles.argsPre}>
                  {typeof toolCall.arguments === 'string'
                    ? toolCall.arguments
                    : JSON.stringify(toolCall.arguments, null, 2)}
                </pre>
              </div>
              {toolCall.phase === 'result' && (
                <div style={styles.detailSection}>
                  <span style={styles.detailLabel}>执行结果:</span>
                  <pre style={styles.resultPre}>
                    {typeof toolCall.result === 'string'
                      ? toolCall.result
                      : JSON.stringify(toolCall.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Styles ---
const styles: Record<string, React.CSSProperties> = {
  // Text Styles
  textContainer: {
    lineHeight: 1.6,
    fontSize: '14px',
    color: '#e2e8f0',
  },
  bold: {
    fontWeight: 700,
    color: '#ffffff',
  },
  inlineCode: {
    background: 'rgba(99, 102, 241, 0.18)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '12.5px',
    color: '#a78bfa',
    border: '1px solid rgba(99, 102, 241, 0.2)',
  },
  h1: {
    fontSize: '18px',
    display: 'block',
    margin: '14px 0 8px',
    color: '#c084fc',
    fontWeight: 700,
  },
  h2: {
    fontSize: '16px',
    display: 'block',
    margin: '12px 0 6px',
    color: '#8b5cf6',
    fontWeight: 700,
  },
  h3: {
    fontSize: '14.5px',
    display: 'block',
    margin: '10px 0 4px',
    color: '#a78bfa',
    fontWeight: 600,
  },
  li: {
    display: 'flex',
    gap: '8px',
    padding: '3px 0',
    marginLeft: '10px',
  },
  bullet: {
    color: '#8b5cf6',
    fontWeight: 'bold',
  },
  number: {
    color: '#a78bfa',
    fontWeight: 600,
    fontFamily: 'monospace',
  },
  codeBlockContainer: {
    margin: '12px 0',
    borderRadius: '10px',
    background: 'rgba(5, 5, 15, 0.55)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
  },
  codeBlockLang: {
    padding: '6px 12px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '11px',
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  codeBlockPre: {
    margin: 0,
    padding: '12px',
    overflowX: 'auto',
  },
  codeBlockCode: {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '12.5px',
    color: '#34d399',
  },

  // Tool Card Styles
  toolCallCard: {
    margin: '8px 0',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
  },
  toolCallHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 0.2s',
  },
  toolCallIcon: {
    marginRight: '8px',
    fontSize: '15px',
  },
  toolCallName: {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  headerRight: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusBadge: {
    fontSize: '10.5px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '20px',
    textTransform: 'uppercase',
  },
  toolCallSpinner: {
    display: 'flex',
    gap: '3px',
  },
  spinnerDot: {
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    background: '#3b82f6',
    animation: 'toolPulse 1.2s ease-in-out infinite',
  },
  expandArrow: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.3)',
    marginLeft: '4px',
  },
  toolCallContent: {
    padding: '14px',
    background: 'rgba(0, 0, 0, 0.15)',
    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
  },

  // Details Styles
  genericDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  detailLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  argsPre: {
    margin: 0,
    padding: '8px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '8px',
    overflowX: 'auto',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '11px',
    color: '#93c5fd',
  },
  resultPre: {
    margin: 0,
    padding: '8px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '8px',
    overflowX: 'auto',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '11px',
    color: '#34d399',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },

  // Terminal Command Styles
  terminalContainer: {
    background: '#04020a',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
  },
  terminalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  terminalDotRed: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' },
  terminalDotYellow: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' },
  terminalDotGreen: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' },
  terminalTitle: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'monospace',
    marginLeft: '6px',
  },
  terminalBody: {
    padding: '12px',
    fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
    fontSize: '12px',
    lineHeight: 1.5,
  },
  terminalCwd: {
    color: '#818cf8',
    marginBottom: '4px',
  },
  terminalCmd: {
    color: '#f43f5e',
    marginBottom: '8px',
  },
  terminalRunning: {
    color: '#fbbf24',
    fontStyle: 'italic',
  },
  terminalOutput: {
    margin: 0,
    color: '#34d399',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '260px',
    overflowY: 'auto',
  },

  // Browser Detail Card Styles
  toolDetailCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  screenshotContainer: {
    marginTop: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  screenshotHeader: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  screenshotImg: {
    width: '100%',
    maxHeight: '400px',
    objectFit: 'contain',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
    transition: 'transform 0.3s ease',
    cursor: 'zoom-in',
  },

  // Error Styles
  errorBox: {
    margin: '8px 0',
    background: 'rgba(239, 68, 68, 0.06)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    borderRadius: '10px',
    padding: '12px 16px',
  },
  errorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  errorIcon: {
    fontSize: '16px',
  },
  errorTitle: {
    fontWeight: 600,
    fontSize: '13px',
    color: '#f87171',
  },
  errorContent: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#fca5a5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
};
