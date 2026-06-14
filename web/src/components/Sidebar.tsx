import React, { useState } from 'react';

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messageCount?: number;
}

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onShowTrace?: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  conversations = [],
  activeId,
  onSelect,
  onDelete,
  onNew,
  onShowTrace,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <aside style={styles.sidebar}>
      <div style={styles.newChatContainer}>
        <button
          style={styles.newChatButton}
          onClick={onNew}
          onMouseEnter={(e) => {
            Object.assign(e.currentTarget.style, {
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
            });
          }}
          onMouseLeave={(e) => {
            Object.assign(e.currentTarget.style, {
              transform: 'translateY(0)',
              boxShadow: '0 2px 12px rgba(99, 102, 241, 0.25)',
            });
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3V13M3 8H13"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>新建对话</span>
        </button>
      </div>

      <div style={styles.listContainer}>
        <div style={styles.listHeader}>
          <span style={styles.listHeaderText}>历史对话</span>
          <span style={styles.countBadge}>{conversations.length}</span>
        </div>

        {conversations.length === 0 ? (
          <div style={styles.emptyState}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.3 }}>
              <path
                d="M12 16C12 13.79 13.79 12 16 12H32C34.21 12 36 13.79 36 16V28C36 30.21 34.21 32 32 32H20L14 38V32H16C13.79 32 12 30.21 12 28V16Z"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p style={styles.emptyText}>暂无对话记录</p>
            <p style={styles.emptySubtext}>点击上方按钮开始新对话</p>
          </div>
        ) : (
          <div style={styles.conversationList}>
            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const isHovered = conv.id === hoveredId;

              return (
                <div
                  key={conv.id}
                  style={{
                    ...styles.conversationItem,
                    ...(isActive ? styles.activeItem : {}),
                    ...(isHovered && !isActive ? styles.hoveredItem : {}),
                  }}
                  onClick={() => onSelect(conv.id)}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div style={styles.itemIcon}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3 5C3 3.9 3.9 3 5 3H11C12.1 3 13 3.9 13 5V9C13 10.1 12.1 11 11 11H7L4 14V11H5C3.9 11 3 10.1 3 9V5Z"
                        stroke={isActive ? '#a78bfa' : 'rgba(255,255,255,0.3)'}
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div style={styles.itemContent}>
                    <div style={styles.itemTitle}>{conv.title}</div>
                    <div style={styles.itemMeta}>
                      <span style={styles.itemTime}>{formatTime(conv.updatedAt)}</span>
                      {conv.messageCount !== undefined && (
                        <span style={styles.itemMsgCount}>{conv.messageCount}条消息</span>
                      )}
                    </div>
                  </div>
                  {(isHovered || isActive) && (
                    <div style={styles.actionButtons}>
                      <button
                        style={styles.traceButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onShowTrace) {
                            onShowTrace(conv.id);
                          }
                        }}
                        title="查看轨迹"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                          e.currentTarget.style.color = '#a78bfa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                        }}
                      >
                        🔬
                      </button>
                      <button
                        style={styles.deleteButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                          e.currentTarget.style.color = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M3 4H11M5.5 4V3C5.5 2.45 5.95 2 6.5 2H7.5C8.05 2 8.5 2.45 8.5 3V4M4 4V11C4 11.55 4.45 12 5 12H9C9.55 12 10 11.55 10 11V4"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '280px',
    height: '100vh',
    background: 'rgba(12, 12, 30, 0.6)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRight: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  newChatContainer: {
    padding: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  newChatButton: {
    width: '100%',
    height: '42px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '12px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 12px rgba(99, 102, 241, 0.25)',
  },
  listContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px 8px',
  },
  listHeaderText: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.35)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    fontFamily: "'Inter', sans-serif",
  },
  countBadge: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.3)',
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '2px 8px',
    borderRadius: '10px',
    fontFamily: "'Inter', sans-serif",
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    gap: '8px',
  },
  emptyText: {
    margin: 0,
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: "'Inter', sans-serif",
  },
  emptySubtext: {
    margin: 0,
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.2)',
    fontFamily: "'Inter', sans-serif",
  },
  conversationList: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  conversationItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
    minHeight: '48px',
    boxSizing: 'border-box',
  },
  activeItem: {
    background: 'rgba(99, 102, 241, 0.12)',
    border: '1px solid rgba(99, 102, 241, 0.15)',
    boxShadow: '0 0 20px rgba(99, 102, 241, 0.08)',
  },
  hoveredItem: {
    background: 'rgba(255, 255, 255, 0.03)',
  },
  itemIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.04)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  itemTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.85)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontFamily: "'Inter', sans-serif",
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  itemTime: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.25)',
    fontFamily: "'Inter', sans-serif",
  },
  itemMsgCount: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.2)',
    fontFamily: "'Inter', sans-serif",
  },
  actionButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  traceButton: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    padding: 0,
    fontSize: '12px',
  },
  deleteButton: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    padding: 0,
  },
};

export default Sidebar;
