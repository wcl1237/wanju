import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled = false }) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const scrollHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${scrollHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // AI 回复结束后自动聚焦输入框
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    // 保持光标在输入框
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div style={styles.wrapper}>
      <div
        style={{
          ...styles.container,
          borderColor: isFocused
            ? 'rgba(99, 102, 241, 0.3)'
            : 'rgba(255, 255, 255, 0.06)',
          boxShadow: isFocused
            ? '0 0 30px rgba(99, 102, 241, 0.08), 0 4px 20px rgba(0, 0, 0, 0.15)'
            : '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        <textarea
          ref={textareaRef}
          style={{
            ...styles.textarea,
            opacity: disabled ? 0.5 : 1,
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={disabled ? 'AI 正在思考中...' : '输入您的问题... (Enter 发送, Shift+Enter 换行)'}
          disabled={disabled}
          rows={1}
        />
        <div style={styles.actions}>
          {disabled && (
            <div style={styles.loadingContainer}>
              <div style={styles.loadingDots}>
                <span style={{ ...styles.loadingDot, animationDelay: '0s' }} />
                <span style={{ ...styles.loadingDot, animationDelay: '0.2s' }} />
                <span style={{ ...styles.loadingDot, animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <button
            style={{
              ...styles.sendButton,
              opacity: canSend ? 1 : 0.35,
              cursor: canSend ? 'pointer' : 'default',
              transform: canSend ? 'scale(1)' : 'scale(0.92)',
            }}
            onClick={handleSend}
            disabled={!canSend}
            onMouseEnter={(e) => {
              if (canSend) {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(99, 102, 241, 0.5)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (canSend) {
                e.currentTarget.style.boxShadow = '0 2px 10px rgba(99, 102, 241, 0.3)';
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M3 9L8 4M8 4L13 9M8 4V15"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="rotate(-45 9 9)"
              />
            </svg>
          </button>
        </div>
      </div>
      <div style={styles.hint}>
        <span>按 Enter 发送 · Shift + Enter 换行</span>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    padding: '0 20px 16px',
    maxWidth: '800px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
  },
  container: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    padding: '10px 12px 10px 16px',
    background: 'rgba(255, 255, 255, 0.04)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    transition: 'all 0.25s ease',
    boxSizing: 'border-box',
  },
  textarea: {
    flex: 1,
    resize: 'none',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: '14px',
    lineHeight: '22px',
    fontFamily: "'Inter', sans-serif",
    maxHeight: '200px',
    minHeight: '22px',
    overflowY: 'auto',
    padding: '2px 0',
    transition: 'opacity 0.2s ease',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 4px',
  },
  loadingDots: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  loadingDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#8b5cf6',
    display: 'inline-block',
    animation: 'inputBounce 1.4s ease-in-out infinite',
  },
  sendButton: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)',
    padding: 0,
  },
  hint: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '6px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.15)',
    fontFamily: "'Inter', sans-serif",
  },
};

export default ChatInput;
