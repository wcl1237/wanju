import React, { useState } from 'react';
import * as authApi from '../api';

interface LoginPageProps {
  onLogin: (token: string, user: { id: string; username: string }) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    if (mode === 'register') {
      if (password.length < 6) {
        setError('密码长度至少6位');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次密码不一致');
        return;
      }
    }

    setLoading(true);

    try {
      const dto = { username: username.trim(), password };

      if (mode === 'register') {
        const regData = await authApi.register(dto);
        if (!regData.success) {
          setError(regData.message || '注册失败');
          return;
        }
        // 注册成功后自动登录
        const loginData = await authApi.login(dto);
        if (loginData.success && loginData.data) {
          onLogin(loginData.data.token, loginData.data.user);
        }
      } else {
        const data = await authApi.login(dto);
        if (!data.success) {
          setError(data.message || '登录失败');
          return;
        }
        if (data.data) {
          onLogin(data.data.token, data.data.user);
        }
      }
    } catch {
      setError('网络错误，请检查服务器连接');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Background decorations */}
      <div style={styles.bgOrb1} />
      <div style={styles.bgOrb2} />
      <div style={styles.bgOrb3} />

      <div style={styles.card}>
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>🤖</div>
          <h1 style={styles.logoTitle}>智能客服系统</h1>
          <p style={styles.logoSubtitle}>Smart Customer Service</p>
        </div>

        {/* Tab Switcher */}
        <div style={styles.tabBar}>
          <button
            style={{
              ...styles.tab,
              ...(mode === 'login' ? styles.tabActive : {}),
            }}
            onClick={() => { setMode('login'); setError(null); }}
          >
            登录
          </button>
          <button
            style={{
              ...styles.tab,
              ...(mode === 'register' ? styles.tabActive : {}),
            }}
            onClick={() => { setMode('register'); setError(null); }}
          >
            注册
          </button>
        </div>

        <form style={styles.form} onSubmit={handleSubmit}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>用户名</label>
            <input
              style={styles.input}
              type="text"
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>密码</label>
            <input
              style={styles.input}
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div style={styles.fieldGroup}>
              <label style={styles.label}>确认密码</label>
              <input
                style={styles.input}
                type="password"
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div style={styles.error}>
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              ...styles.submitBtn,
              opacity: loading ? 0.6 : 1,
            }}
            disabled={loading}
          >
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <p style={styles.switchText}>
          {mode === 'login' ? '没有账号？' : '已有账号？'}
          <span
            style={styles.switchLink}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          >
            {mode === 'login' ? '立即注册' : '去登录'}
          </span>
        </p>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1035 50%, #0d0d2b 100%)',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  bgOrb1: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
    top: '-100px',
    right: '-50px',
    filter: 'blur(60px)',
  },
  bgOrb2: {
    position: 'absolute',
    width: '300px',
    height: '300px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
    bottom: '-80px',
    left: '-30px',
    filter: 'blur(50px)',
  },
  bgOrb3: {
    position: 'absolute',
    width: '200px',
    height: '200px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 70%)',
    top: '40%',
    left: '20%',
    filter: 'blur(40px)',
  },
  card: {
    width: '400px',
    padding: '40px',
    background: 'rgba(20, 20, 40, 0.8)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.4)',
    position: 'relative',
    zIndex: 1,
  },
  logoSection: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logoIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  logoTitle: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '1px',
  },
  logoSubtitle: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.3)',
    letterSpacing: '2px',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '12px',
    marginBottom: '28px',
  },
  tab: {
    flex: 1,
    padding: '10px',
    background: 'transparent',
    border: 'none',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  tabActive: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#ffffff',
    boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  input: {
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    color: '#ffffff',
    fontSize: '14px',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  error: {
    padding: '10px 14px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#fca5a5',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  submitBtn: {
    padding: '14px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '14px',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
    marginTop: '4px',
  },
  switchText: {
    textAlign: 'center',
    marginTop: '20px',
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.35)',
  },
  switchLink: {
    color: '#a78bfa',
    cursor: 'pointer',
    fontWeight: 600,
    marginLeft: '4px',
  },
};

export default LoginPage;
