import React, { useState } from 'react';

export type NavPage = 'chat' | 'knowledge' | 'tickets' | 'workflows' | 'skills' | 'agents';

interface NavSidebarProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  username: string;
  onLogout: () => void;
}

const navItems: { id: NavPage; icon: string; label: string }[] = [
  { id: 'chat', icon: '💬', label: '智能对话' },
  { id: 'knowledge', icon: '📚', label: '知识库' },
  { id: 'tickets', icon: '🎫', label: '工单管理' },
  { id: 'workflows', icon: '🔄', label: '工作流' },
  { id: 'agents', icon: '🧑‍💼', label: 'Agent 池' },
  { id: 'skills', icon: '⚡', label: '技能中心' },
];

const NavSidebar: React.FC<NavSidebarProps> = ({ activePage, onNavigate, username, onLogout }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <nav style={styles.nav}>
      {/* Logo */}
      <div style={styles.logoArea}>
        <div style={styles.logoIcon}>🤖</div>
        <span style={styles.logoText}>智能客服</span>
      </div>

      {/* Nav Items */}
      <div style={styles.navItems}>
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          const isHovered = hoveredId === item.id;

          return (
            <button
              key={item.id}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
                ...(isHovered && !isActive ? styles.navItemHover : {}),
              }}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span style={{
                ...styles.navLabel,
                color: isActive ? '#ffffff' : 'rgba(255,255,255,0.55)',
              }}>{item.label}</span>
              {isActive && <div style={styles.activeIndicator} />}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User Area */}
      <div style={styles.userArea}>
        <button
          style={styles.userButton}
          onClick={() => setShowUserMenu(!showUserMenu)}
        >
          <div style={styles.avatar}>
            {username.charAt(0).toUpperCase()}
          </div>
          <span style={styles.username}>{username}</span>
        </button>

        {showUserMenu && (
          <div style={styles.userMenu}>
            <button
              style={styles.menuItem}
              onClick={onLogout}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              🚪 退出登录
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

const styles: Record<string, React.CSSProperties> = {
  nav: {
    width: '180px',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(8, 8, 24, 0.9)',
    borderRight: '1px solid rgba(255, 255, 255, 0.06)',
    flexShrink: 0,
    boxSizing: 'border-box',
    paddingBottom: '12px',
    zIndex: 10,
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '20px 18px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    marginBottom: '8px',
  },
  logoIcon: {
    fontSize: '24px',
  },
  logoText: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#ffffff',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    letterSpacing: '0.5px',
  },
  navItems: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0 10px',
    gap: '2px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '11px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    textAlign: 'left',
  },
  navItemActive: {
    background: 'rgba(99, 102, 241, 0.15)',
  },
  navItemHover: {
    background: 'rgba(255, 255, 255, 0.04)',
  },
  activeIndicator: {
    position: 'absolute',
    left: '0',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '3px',
    height: '20px',
    borderRadius: '0 3px 3px 0',
    background: 'linear-gradient(180deg, #6366f1, #8b5cf6)',
  },
  navIcon: {
    fontSize: '18px',
    width: '24px',
    textAlign: 'center',
    flexShrink: 0,
  },
  navLabel: {
    fontSize: '14px',
    fontWeight: 500,
    transition: 'color 0.2s ease',
  },
  userArea: {
    padding: '0 10px',
    position: 'relative',
  },
  userButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    transition: 'all 0.15s ease',
  },
  avatar: {
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 700,
    flexShrink: 0,
  },
  username: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.7)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userMenu: {
    position: 'absolute',
    bottom: '100%',
    left: '10px',
    right: '10px',
    marginBottom: '6px',
    background: 'rgba(20, 20, 40, 0.95)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '4px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    transition: 'all 0.15s ease',
    textAlign: 'left',
  },
};

export default NavSidebar;
