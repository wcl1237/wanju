import React from 'react';

const Header: React.FC = () => {
  return (
    <header style={styles.header}>
      <div style={styles.logoSection}>
        <div style={styles.iconContainer}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={styles.icon}
          >
            <path
              d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z"
              fill="url(#headerGrad)"
              opacity="0.15"
            />
            <path
              d="M17 12.5C17 15.26 14.76 17.5 12 17.5C9.24 17.5 7 15.26 7 12.5V10C7 7.24 9.24 5 12 5C14.76 5 17 7.24 17 10V12.5Z"
              stroke="url(#headerGrad)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="9.5" cy="10.5" r="1" fill="#8b5cf6" />
            <circle cx="14.5" cy="10.5" r="1" fill="#6366f1" />
            <path
              d="M10 14C10 14 10.5 15 12 15C13.5 15 14 14 14 14"
              stroke="url(#headerGrad)"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M5 10V11"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M19 10V11"
              stroke="#8b5cf6"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M12 2V5"
              stroke="url(#headerGrad)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="12" cy="2" r="1" fill="#8b5cf6" />
            <path
              d="M9 17.5L8 20"
              stroke="#6366f1"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <path
              d="M15 17.5L16 20"
              stroke="#8b5cf6"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="headerGrad" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div style={styles.titleGroup}>
          <h1 style={styles.title}>智能客服</h1>
          <span style={styles.subtitle}>AI Customer Service</span>
        </div>
      </div>
      <div style={styles.rightSection}>
        <div style={styles.statusDot} />
        <span style={styles.statusText}>在线</span>
      </div>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    background: 'rgba(15, 15, 35, 0.8)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    zIndex: 1000,
    boxSizing: 'border-box',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  iconContainer: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: {
    filter: 'drop-shadow(0 0 6px rgba(99, 102, 241, 0.4))',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '0.5px',
    lineHeight: 1.2,
    fontFamily: "'Inter', sans-serif",
  },
  subtitle: {
    fontSize: '11px',
    fontWeight: 400,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: '0.3px',
    lineHeight: 1.2,
    fontFamily: "'Inter', sans-serif",
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#22c55e',
    boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  statusText: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: "'Inter', sans-serif",
  },
};

export default Header;
