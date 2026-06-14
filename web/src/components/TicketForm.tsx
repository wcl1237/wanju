import React, { useState, useEffect } from 'react';

interface TicketFormProps {
  onClose: () => void;
  onCreated?: () => void;
}

type Priority = 'low' | 'medium' | 'high' | 'urgent';
type Category = 'bug' | 'feature' | 'question' | 'complaint';

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: 'low', label: '低优先级', color: '#9ca3af' },
  { value: 'medium', label: '中优先级', color: '#60a5fa' },
  { value: 'high', label: '高优先级', color: '#fb923c' },
  { value: 'urgent', label: '紧急', color: '#f87171' },
];

const CATEGORY_OPTIONS: { value: Category; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug 缺陷', icon: '🐛' },
  { value: 'feature', label: '功能需求', icon: '✨' },
  { value: 'question', label: '问题咨询', icon: '❓' },
  { value: 'complaint', label: '投诉反馈', icon: '📢' },
];

const TicketForm: React.FC<TicketFormProps> = ({ onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [category, setCategory] = useState<Category>('question');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请输入工单标题');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          category,
        }),
      });
      if (!res.ok) throw new Error('创建工单失败');
      onCreated?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = title.trim().length > 0 && !submitting;

  return (
    <div
      style={{
        ...styles.overlay,
        opacity: visible ? 1 : 0,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          ...styles.modal,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>🎫 创建工单</h3>
          <button
            style={styles.closeBtn}
            onClick={handleClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4L12 12M12 4L4 12"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <div style={styles.formBody}>
          {error && (
            <div style={styles.errorMsg}>
              ⚠️ {error}
            </div>
          )}

          {/* Title */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>标题 <span style={{ color: '#f87171' }}>*</span></label>
            <input
              style={styles.input}
              type="text"
              placeholder="请简要描述您的问题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>详细描述</label>
            <textarea
              style={styles.textarea}
              placeholder="请详细描述您遇到的问题..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              rows={4}
            />
          </div>

          {/* Priority & Category row */}
          <div style={styles.selectRow}>
            <div style={{ ...styles.fieldGroup, flex: 1 }}>
              <label style={styles.label}>优先级</label>
              <div style={styles.selectWrapper}>
                <select
                  style={styles.select}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div
                  style={{
                    ...styles.priorityIndicator,
                    background: PRIORITY_OPTIONS.find((p) => p.value === priority)?.color,
                  }}
                />
              </div>
            </div>
            <div style={{ ...styles.fieldGroup, flex: 1 }}>
              <label style={styles.label}>分类</label>
              <select
                style={styles.select}
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={styles.modalFooter}>
          <button
            style={styles.cancelBtn}
            onClick={handleClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            }}
          >
            取消
          </button>
          <button
            style={{
              ...styles.submitBtn,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? 'pointer' : 'default',
            }}
            onClick={handleSubmit}
            disabled={!canSubmit}
            onMouseEnter={(e) => {
              if (canSubmit) {
                e.currentTarget.style.boxShadow = '0 4px 24px rgba(99, 102, 241, 0.45)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (canSubmit) {
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(99, 102, 241, 0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {submitting ? (
              <span style={styles.submitLoading}>
                <span style={styles.submitSpinner} />
                提交中...
              </span>
            ) : (
              '提交工单'
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    transition: 'opacity 0.2s ease',
    padding: '20px',
  },
  modal: {
    width: '100%',
    maxWidth: '500px',
    background: 'rgba(18, 18, 40, 0.95)',
    backdropFilter: 'blur(30px)',
    WebkitBackdropFilter: 'blur(30px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.08)',
    overflow: 'hidden',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  modalTitle: {
    margin: 0,
    fontSize: '17px',
    fontWeight: 600,
    color: '#ffffff',
    fontFamily: "'Inter', sans-serif",
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.04)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    padding: 0,
  },
  formBody: {
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  errorMsg: {
    padding: '10px 14px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#fca5a5',
    fontFamily: "'Inter', sans-serif",
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: "'Inter', sans-serif",
  },
  input: {
    padding: '11px 14px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: '14px',
    fontFamily: "'Inter', sans-serif",
    outline: 'none',
    transition: 'all 0.2s ease',
  },
  textarea: {
    padding: '11px 14px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: '14px',
    fontFamily: "'Inter', sans-serif",
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    lineHeight: 1.6,
    transition: 'all 0.2s ease',
  },
  selectRow: {
    display: 'flex',
    gap: '12px',
  },
  selectWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  select: {
    width: '100%',
    padding: '11px 14px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: '13px',
    fontFamily: "'Inter', sans-serif",
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    paddingRight: '36px',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='rgba(255,255,255,0.3)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
  },
  priorityIndicator: {
    position: 'absolute',
    right: '32px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    pointerEvents: 'none',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '16px 24px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
  },
  cancelBtn: {
    padding: '10px 20px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  submitBtn: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 12px rgba(99, 102, 241, 0.25)',
  },
  submitLoading: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  submitSpinner: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.8s linear infinite',
  },
};

export default TicketForm;
