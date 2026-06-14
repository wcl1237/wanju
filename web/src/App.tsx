import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import './index.css';
import { useChat } from './features/chat/hooks/useChat';
import { getUser, setUser, removeUser } from './shared/http-client';
import LoginPage from './features/auth/components/LoginPage';
import TrajectoryPage from './features/trace/components/TrajectoryPage';
import NavSidebar from './shared/components/NavSidebar';
import type { NavPage } from './shared/components/NavSidebar';
import Sidebar from './features/chat/components/ConversationSidebar';
import ChatPanel from './features/chat/components/ChatPanel';
import KnowledgeBase from './features/knowledge/components/KnowledgeBase';
import TicketPanel from './features/ticket/components/TicketPanel';
import TicketForm from './features/ticket/components/TicketForm';
import SkillHub from './features/skill/components/SkillHub';
import WorkflowPage from './features/workflow/components/WorkflowPage';
import WorkflowEditor from './features/workflow/components/WorkflowEditor';

// 路由 → NavPage 映射
function getActivePage(pathname: string): NavPage {
  if (pathname.startsWith('/chat')) return 'chat';
  if (pathname.startsWith('/knowledge')) return 'knowledge';
  if (pathname.startsWith('/tickets')) return 'tickets';
  if (pathname.startsWith('/workflows')) return 'workflows';
  if (pathname.startsWith('/skills')) return 'skills';
  return 'chat';
}

const pageToRoute: Record<NavPage, string> = {
  chat: '/chat',
  knowledge: '/knowledge',
  tickets: '/tickets',
  workflows: '/workflows',
  skills: '/skills',
};

/**
 * 对话页面（带路由参数）
 */
function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();

  const onNavigate = useCallback((id: string | null) => {
    if (id) {
      navigate(`/chat/${id}`, { replace: true });
    } else {
      navigate('/chat', { replace: true });
    }
  }, [navigate]);

  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    toolStatuses,
    hasMore,
    newConversation,
    deleteConversation,
    send,
    loadMore,
  } = useChat(conversationId, onNavigate);

  return (
    <div style={styles.chatLayout}>
      <Sidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={(id) => navigate(`/chat/${id}`)}
        onDelete={deleteConversation}
        onNew={newConversation}
        onShowTrace={(id) => navigate(`/chat/${id}/trajectory`)}
      />
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        onSend={send}
        conversationId={activeConversationId}
        hasMore={hasMore}
        onLoadMore={loadMore}
        toolStatuses={toolStatuses}
      />
    </div>
  );
}

/**
 * 轨迹页面（带路由参数）
 */
function TrajectoryRoute() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();

  const onNavigate = useCallback((id: string | null) => {
    if (id) navigate(`/chat/${id}`, { replace: true });
    else navigate('/chat', { replace: true });
  }, [navigate]);

  const { conversations, messages } = useChat(conversationId, onNavigate);
  const activeConv = conversations.find(c => c.id === conversationId);

  return (
    <TrajectoryPage
      messages={messages}
      conversationTitle={activeConv?.title}
      onBack={() => navigate(`/chat/${conversationId}`)}
    />
  );
}

/**
 * 知识库页面
 */
function KnowledgePage() {
  return (
    <div style={styles.pageContent}>
      <KnowledgeBase />
    </div>
  );
}

/**
 * 工单页面
 */
function TicketsPage() {
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div style={styles.pageContent}>
      <div style={styles.ticketHeader}>
        <h2 style={styles.pageTitle}>🎫 工单管理</h2>
        <button
          style={styles.newTicketBtn}
          onClick={() => setShowTicketForm(true)}
        >
          + 新建工单
        </button>
      </div>
      <TicketPanel key={refreshKey} />
      {showTicketForm && (
        <TicketForm
          onClose={() => setShowTicketForm(false)}
          onCreated={() => {
            setShowTicketForm(false);
            setRefreshKey(k => k + 1);
          }}
        />
      )}
    </div>
  );
}

/**
 * 技能中心页面
 */
function SkillsPage() {
  return (
    <div style={styles.pageContent}>
      <SkillHub />
    </div>
  );
}

/**
 * 工作流编辑器路由页
 */
function WorkflowEditorRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return <WorkflowEditor workflowId={id || 'new'} onBack={() => navigate('/workflows')} />;
}

/**
 * 主布局 — 左侧导航 + 右侧路由内容
 */
function MainLayout({ user, onLogout }: { user: { id: string; username: string }; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  const activePage = getActivePage(location.pathname);

  const handleNavigate = (page: NavPage) => {
    navigate(pageToRoute[page]);
  };

  return (
    <div style={styles.appLayout}>
      <NavSidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        username={user.username}
        onLogout={onLogout}
      />
      <div style={styles.mainArea}>
        <Routes>
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/chat/:conversationId/trajectory" element={<TrajectoryRoute />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/workflows" element={<WorkflowPage />} />
          <Route path="/workflows/new" element={<WorkflowEditorRoute />} />
          <Route path="/workflows/:id/edit" element={<WorkflowEditorRoute />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </div>
    </div>
  );
}

/**
 * 根组件 — 认证 + 路由
 */
function App() {
  const [currentUser, setCurrentUser] = useState(getUser());

  useEffect(() => {
    const handleLogout = () => setCurrentUser(null);
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const handleLogin = useCallback((_token: string, user: { id: string; username: string }) => {
    setUser(user);
    setCurrentUser(user);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch { /* ignore */ }
    removeUser();
    setCurrentUser(null);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            currentUser ? <Navigate to="/chat" replace /> : <LoginPage onLogin={handleLogin} />
          }
        />
        <Route
          path="/*"
          element={
            currentUser
              ? <MainLayout user={currentUser} onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

const styles: Record<string, React.CSSProperties> = {
  appLayout: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1035 50%, #0d0d2b 100%)',
  },
  mainArea: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  chatLayout: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  pageContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  ticketHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 28px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  pageTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  newTicketBtn: {
    padding: '8px 18px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};

export default App;
