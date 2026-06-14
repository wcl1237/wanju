import React, { useState, useEffect, useCallback } from 'react';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string }> = {
  open: { label: '待处理', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' },
  in_progress: { label: '处理中', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)' },
  resolved: { label: '已解决', color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)' },
  closed: { label: '已关闭', color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.12)' },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  low: { label: '低', color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.12)' },
  medium: { label: '中', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' },
  high: { label: '高', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.12)' },
  urgent: { label: '紧急', color: '#f87171', bg: 'rgba(248, 113, 113, 0.12)' },
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: '🐛 Bug',
  feature: '✨ 功能',
  question: '❓ 咨询',
  complaint: '📢 投诉',
};

const STATUS_FLOW: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

const TicketPanel: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tickets');
      if (!res.ok) throw new Error('获取工单列表失败');
      const data = await res.json();
      setTickets(data.data || data.tickets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const updateStatus = async (id: string, status: TicketStatus) => {
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('更新工单状态失败');
      await fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>🎫 工单管理</h3>
        <button
          style={styles.refreshBtn}
          onClick={fetchTickets}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
          }}
        >
          🔄 刷新
        </button>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>⚠️ {error}</span>
          <button style={styles.errorClose} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div style={styles.content}>
        {loading ? (
          <div style={styles.loadingState}>
            <div style={styles.loadingSpinner} />
            <span>加载中...</span>
          </div>
        ) : tickets.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={{ fontSize: '48px', opacity: 0.25 }}>🎫</span>
            <p style={styles.emptyText}>暂无工单</p>
            <p style={styles.emptySubtext}>创建工单以跟踪问题处理进度</p>
          </div>
        ) : (
          <div style={styles.ticketList}>
            {tickets.map((ticket) => {
              const isExpanded = expandedId === ticket.id;
              const isHovered = hoveredId === ticket.id;
              const statusConf = STATUS_CONFIG[ticket.status];
              const priorityConf = PRIORITY_CONFIG[ticket.priority];

              return (
                <div
                  key={ticket.id}
                  style={{
                    ...styles.ticketCard,
                    borderColor: isExpanded
                      ? 'rgba(99, 102, 241, 0.2)'
                      : isHovered
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'rgba(255, 255, 255, 0.06)',
                    background: isExpanded
                      ? 'rgba(99, 102, 241, 0.05)'
                      : 'rgba(255, 255, 255, 0.03)',
                  }}
                  onMouseEnter={() => setHoveredId(ticket.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Card Header */}
                  <div
                    style={styles.cardHeader}
                    onClick={() => toggleExpand(ticket.id)}
                  >
                    <div style={styles.cardHeaderLeft}>
                      <div style={styles.ticketTitle}>
                        {(ticket as any).ticketNo && (
                          <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 600, marginRight: '8px' }}>
                            {(ticket as any).ticketNo}
                          </span>
                        )}
                        {ticket.title}
                      </div>
                      <div style={styles.badges}>
                        <span
                          style={{
                            ...styles.badge,
                            color: statusConf.color,
                            background: statusConf.bg,
                          }}
                        >
                          {statusConf.label}
                        </span>
                        <span
                          style={{
                            ...styles.badge,
                            color: priorityConf.color,
                            background: priorityConf.bg,
                          }}
                        >
                          {priorityConf.label}
                        </span>
                        {ticket.category && (
                          <span style={styles.categoryLabel}>
                            {CATEGORY_LABELS[ticket.category] || ticket.category}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                      }}
                    >
                      <path
                        d="M4 6L8 10L12 6"
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div style={styles.expandedContent}>
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>描述</span>
                        <p style={styles.detailValue}>{ticket.description || '无描述'}</p>
                      </div>
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>创建时间</span>
                        <span style={styles.detailValue}>
                          {new Date(ticket.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>更新时间</span>
                        <span style={styles.detailValue}>
                          {new Date(ticket.updatedAt).toLocaleString('zh-CN')}
                        </span>
                      </div>

                      {/* Status update buttons */}
                      <div style={styles.statusActions}>
                        <span style={styles.detailLabel}>更新状态</span>
                        <div style={styles.statusButtons}>
                          {STATUS_FLOW.map((s) => {
                            const conf = STATUS_CONFIG[s];
                            const isCurrent = ticket.status === s;
                            return (
                              <button
                                key={s}
                                style={{
                                  ...styles.statusBtn,
                                  color: conf.color,
                                  background: isCurrent ? conf.bg : 'rgba(255,255,255,0.03)',
                                  borderColor: isCurrent
                                    ? conf.color
                                    : 'rgba(255, 255, 255, 0.06)',
                                  fontWeight: isCurrent ? 600 : 400,
                                  cursor: isCurrent ? 'default' : 'pointer',
                                  opacity: isCurrent ? 1 : 0.7,
                                }}
                                onClick={() => !isCurrent && updateStatus(ticket.id, s)}
                                disabled={isCurrent}
                                onMouseEnter={(e) => {
                                  if (!isCurrent) {
                                    e.currentTarget.style.background = conf.bg;
                                    e.currentTarget.style.opacity = '1';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isCurrent) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                    e.currentTarget.style.opacity = '0.7';
                                  }
                                }}
                              >
                                {conf.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(12, 12, 30, 0.4)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px 12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    fontFamily: "'Inter', sans-serif",
  },
  refreshBtn: {
    padding: '6px 12px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '8px',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.15s ease',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.15)',
    fontSize: '12px',
    color: '#fca5a5',
    fontFamily: "'Inter', sans-serif",
  },
  errorClose: {
    background: 'none',
    border: 'none',
    color: '#fca5a5',
    cursor: 'pointer',
    padding: '2px',
    fontSize: '12px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '48px',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '13px',
    fontFamily: "'Inter', sans-serif",
  },
  loadingSpinner: {
    width: '24px',
    height: '24px',
    border: '2px solid rgba(99, 102, 241, 0.2)',
    borderTopColor: '#8b5cf6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    gap: '4px',
  },
  emptyText: {
    margin: 0,
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.35)',
    fontFamily: "'Inter', sans-serif",
  },
  emptySubtext: {
    margin: 0,
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.2)',
    fontFamily: "'Inter', sans-serif",
  },
  ticketList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  ticketCard: {
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    transition: 'all 0.25s ease',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    cursor: 'pointer',
    gap: '12px',
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  ticketTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.88)',
    fontFamily: "'Inter', sans-serif",
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 500,
    padding: '3px 8px',
    borderRadius: '6px',
    fontFamily: "'Inter', sans-serif",
    lineHeight: 1,
  },
  categoryLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.45)',
    fontFamily: "'Inter', sans-serif",
  },
  expandedContent: {
    padding: '0 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
    paddingTop: '12px',
    animation: 'fadeIn 0.2s ease',
  },
  detailRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  detailLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    fontFamily: "'Inter', sans-serif",
  },
  detailValue: {
    margin: 0,
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 1.6,
    fontFamily: "'Inter', sans-serif",
  },
  statusActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '4px',
  },
  statusButtons: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  statusBtn: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    fontSize: '12px',
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.15s ease',
  },
};

export default TicketPanel;
