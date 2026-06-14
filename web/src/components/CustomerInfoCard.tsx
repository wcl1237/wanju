import React, { useState, useEffect } from 'react';

interface CustomerProfile {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  position?: string;
  requirement?: string;
  status: 'partial' | 'complete';
}

interface Props {
  conversationId: string | null;
}

const CustomerInfoCard: React.FC<Props> = ({ conversationId }) => {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setProfile(null);
      return;
    }
    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/customers/by-conversation?conversationId=${conversationId}`, {
          credentials: 'same-origin',
        });
        const data = await res.json();
        if (data.success && data.data) {
          setProfile(data.data);
        } else {
          setProfile(null);
        }
      } catch {
        setProfile(null);
      }
    };
    fetchProfile();
    // 每 5 秒轮询刷新（AI 可能在对话中新增信息）
    const timer = setInterval(fetchProfile, 5000);
    return () => clearInterval(timer);
  }, [conversationId]);

  if (!profile) return null;

  const fields = [
    { label: '姓名', value: profile.name, icon: '👤' },
    { label: '手机', value: profile.phone, icon: '📱' },
    { label: '邮箱', value: profile.email, icon: '📧' },
    { label: '公司', value: profile.company, icon: '🏢' },
    { label: '职位', value: profile.position, icon: '💼' },
    { label: '需求', value: profile.requirement, icon: '📝' },
  ].filter(f => f.value);

  if (fields.length === 0) return null;

  const filledCount = fields.length;
  const isComplete = profile.status === 'complete';

  return (
    <div style={styles.container}>
      <button
        style={styles.header}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={styles.headerLeft}>
          <span style={{
            ...styles.statusDot,
            background: isComplete
              ? 'linear-gradient(135deg, #34d399, #10b981)'
              : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          }} />
          <span style={styles.headerTitle}>
            客户信息
          </span>
          <span style={styles.badge}>
            {filledCount}项{isComplete ? ' ✓' : ''}
          </span>
        </div>
        <span style={{
          ...styles.chevron,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          ▾
        </span>
      </button>

      {expanded && (
        <div style={styles.body}>
          {fields.map((f, i) => (
            <div key={i} style={styles.field}>
              <span style={styles.fieldIcon}>{f.icon}</span>
              <span style={styles.fieldLabel}>{f.label}</span>
              <span style={styles.fieldValue}>{f.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    margin: '0 24px 0',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.4)',
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '2px 8px',
    borderRadius: '8px',
  },
  chevron: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.3)',
    transition: 'transform 0.2s ease',
  },
  body: {
    padding: '0 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '8px',
  },
  fieldIcon: {
    fontSize: '13px',
    width: '20px',
    textAlign: 'center',
    flexShrink: 0,
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.35)',
    width: '36px',
    flexShrink: 0,
  },
  fieldValue: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: 500,
  },
};

export default CustomerInfoCard;
