import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '../../../shared/http-client';
import { useOpenClawStore } from '../store/useOpenClawStore';
import { TextRenderer, ToolCallRenderer } from './SegmentRenderers';

export const OpenClawPage: React.FC = () => {
  // Use Zustand store for global conversation states
  const {
    status,
    session,
    messages,
    logs,
    latency,
    reconnectCount,
    activeRunId,
    thinkingElapsed,
    isLoading,
    setStatus,
    setSession,
    addLog,
    clearLogs,
    setMessages,
    appendMessage,
    clearMessages,
    setIsLoading,
    setActiveRunId,
    setThinkingElapsed,
    incrementThinkingElapsed,
    setReconnectCount,
  } = useOpenClawStore();

  // Local state for input field only
  const [chatText, setChatText] = useState<string>('');
  const [shouldAutoScroll, setShouldAutoScroll] = useState<boolean>(true);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesListRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const latencyTimerRef = useRef<any>(null);
  const reconnectTimerRef = useRef<any>(null);

  // Clean up WebSockets
  const cleanupWS = useCallback(() => {
    if (wsRef.current) {
      // Remove handlers first to prevent callbacks during cleanup
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (latencyTimerRef.current) {
      clearInterval(latencyTimerRef.current);
      latencyTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // Connect to WS via Midway gateway proxy
  const connectWS = useCallback((sessionId: string) => {
    cleanupWS();
    
    const store = useOpenClawStore.getState();
    if (store.status !== 'reconnecting') {
      store.setStatus('running');
    }
    store.addLog('正在建立与后端的 WebSocket 通信链路...');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/openclaw?sessionId=${sessionId}`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      const currentStore = useOpenClawStore.getState();
      currentStore.setStatus('running');
      currentStore.setReconnectCount(0); // Reset reconnect count on successful connection
      currentStore.addLog('🚀 云龙虾控制链路已打通！');

      // Request chat history (gateway queues this safely until challenge handshake completes)
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'req',
          id: 'chat-history-' + Date.now(),
          method: 'chat.history',
          params: {
            sessionKey: 'agent:main:main',
            limit: 50
          }
        }));
      }

      // RTT measurement (3s heartbeat)
      let lastPingTime = 0;
      latencyTimerRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          lastPingTime = Date.now();
          socket.send(JSON.stringify({ type: 'ping', timestamp: lastPingTime }));
        }
      }, 3000);
    };

    socket.onmessage = async (event) => {
      let textData: string;
      if (event.data instanceof Blob) {
        textData = await event.data.text();
      } else if (typeof event.data === 'string') {
        textData = event.data;
      } else {
        const decoder = new TextDecoder('utf-8');
        textData = decoder.decode(event.data);
      }
      const currentStore = useOpenClawStore.getState();
      currentStore.handleWSMessage(textData);
    };

    socket.onclose = (e) => {
      cleanupWS();
      const currentStore = useOpenClawStore.getState();
      currentStore.setLatency(null);
      currentStore.setIsLoading(false);

      // Code 4009 is SUPERSEDED, meaning takeover by another connection
      if (e.code === 4009 || currentStore.status === 'superseded') {
        currentStore.setStatus('superseded');
        currentStore.addLog(`通信链路已断开: 您的账号已在其他窗口/设备中打开，当前连接已被断开。`);
        return;
      }

      currentStore.addLog(`通信链路已断开 (Code: ${e.code}, Reason: ${e.reason || '无'})`);

      // Attempt reconnection up to 5 times
      const { reconnectCount, status: curStatus } = currentStore;
      if (curStatus === 'running' || curStatus === 'reconnecting') {
        if (reconnectCount < 5) {
          const delay = Math.pow(2, reconnectCount + 1) * 1000; // 2s, 4s, 8s, 16s, 32s
          currentStore.setStatus('reconnecting');
          currentStore.addLog(`⏱️ 第 ${reconnectCount + 1}/5 次重连将在 ${delay / 1000} 秒后触发...`);

          reconnectTimerRef.current = setTimeout(() => {
            currentStore.incrementReconnectCount();
            connectWS(sessionId);
          }, delay);
        } else {
          currentStore.setStatus('failed');
          currentStore.addLog('❌ 自动重连次数已达上限(5次)，请检查网络状态或尝试手动连接。');
        }
      }
    };

    socket.onerror = (err) => {
      const currentStore = useOpenClawStore.getState();
      currentStore.addLog(`通信网关异常错误`);
      currentStore.setIsLoading(false);
      console.error(err);
    };
  }, [cleanupWS]);

  // Initial user session status check
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await authFetch('/api/openclaw/status');
        const json = await res.json();
        if (json.success && json.data) {
          const activeSession = json.data as any;
          setSession(activeSession);
          setStatus('running');
          addLog(`检测到已存在的云龙虾会话: ${activeSession.id}`);
          connectWS(activeSession.id);
        }
      } catch (err) {
        const error = err as any;
        addLog(`获取状态失败: ${error?.message || String(err)}`);
      }
    };
    checkStatus();

    return () => {
      cleanupWS();
    };
  }, [connectWS, cleanupWS, setSession, setStatus, addLog]);

  // Smooth scroll chat list to bottom
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    if (chatMessagesListRef.current) {
      chatMessagesListRef.current.scrollTo({
        top: chatMessagesListRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  // Monitor user scrolling to toggle auto-scroll
  const handleScroll = () => {
    if (!chatMessagesListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatMessagesListRef.current;
    // Keep auto-scroll active if user is within 120px of bottom
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    setShouldAutoScroll(isNearBottom);
  };

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom('smooth');
    }
  }, [messages, isLoading, shouldAutoScroll, scrollToBottom]);

  // Scroll terminal logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Thinking timer trigger
  useEffect(() => {
    let timer: any;
    if (isLoading) {
      setThinkingElapsed(0);
      timer = setInterval(() => {
        incrementThinkingElapsed();
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLoading, setThinkingElapsed, incrementThinkingElapsed]);



  // Spin up Docker container session
  const startOpenClaw = async () => {
    setStatus('starting');
    clearLogs();
    addLog('正在向后端网关发出按需引导容器指令...');

    try {
      setTimeout(() => addLog('⚡ 正在检查本地环境及容器状态...'), 800);
      setTimeout(() => addLog('⚙️ 正在向 Docker API 注册资源分配，并映射空闲端口...'), 1600);
      setTimeout(() => addLog('🐳 正在拉起 OpenClaw 服务容器...'), 2400);

      const res = await authFetch('/api/openclaw/start', {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success && json.data) {
        const activeSession = json.data as any;
        setTimeout(() => {
          setSession(activeSession);
          setStatus('running');
          addLog(`✅ 云龙虾容器部署成功！容器ID: ${activeSession.containerId.slice(0, 12)}`);
          connectWS(activeSession.id);
        }, 3500); // startup buffer for container dev server
      } else {
        setStatus('failed');
        addLog(`❌ 容器启动失败: ${json.message}`);
      }
    } catch (err) {
      const error = err as any;
      setStatus('failed');
      addLog(`❌ 容器引导异常: ${error?.message || String(err)}`);
    }
  };

  // Pause session (keeps history data)
  const pauseOpenClaw = async () => {
    if (!session) return;
    addLog('正在暂停并释放容器资源...');
    cleanupWS();

    try {
      const res = await authFetch('/api/openclaw/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus('unstarted');
        setSession(null);
        clearMessages();
        addLog('✅ 容器已成功暂停，数据仍保留。您可随时重新启动恢复对话。');
      } else {
        addLog(`❌ 暂停容器失败: ${json.message}`);
      }
    } catch (err) {
      const error = err as any;
      addLog(`❌ 暂停容器异常: ${error?.message || String(err)}`);
    }
  };

  // Destroy session (wipes history and workspace data)
  const destroyOpenClaw = async () => {
    if (!session) return;
    const confirmWipe = window.confirm('⚠️ 警告：此操作将彻底删除此会话的所有聊天历史、工作区代码文件及设置。此操作不可逆！\n\n您确定要继续销毁吗？');
    if (!confirmWipe) return;

    addLog('正在彻底销毁云龙虾实例及全部持久化数据...');
    cleanupWS();

    try {
      const res = await authFetch('/api/openclaw/destroy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus('unstarted');
        setSession(null);
        clearMessages();
        addLog('✅ 云龙虾实例及其聊天历史、工作区文件已全部清空。');
      } else {
        addLog(`❌ 销毁实例失败: ${json.message}`);
      }
    } catch (err) {
      const error = err as any;
      addLog(`❌ 销毁实例异常: ${error?.message || String(err)}`);
    }
  };

  // Send message
  const handleSend = (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('发送失败: 通信链路未连接');
      return;
    }

    const idempotencyKey = 'idempotency-' + Date.now();

    const userMsg = {
      id: idempotencyKey + '-user',
      role: 'user' as const,
      content: textToSend,
      timestamp: Date.now(),
    };

    appendMessage(userMsg);
    setIsLoading(true);
    setActiveRunId(idempotencyKey);

    const chatPayload = {
      type: 'req',
      id: 'chat-req-' + Date.now(),
      method: 'chat.send',
      params: {
        sessionKey: 'agent:main:main',
        message: textToSend,
        idempotencyKey: idempotencyKey,
      },
    };

    wsRef.current.send(JSON.stringify(chatPayload));
  };

  // Stop generation
  const handleStopGenerating = () => {
    if (!activeRunId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const abortPayload = {
      type: 'req',
      id: 'abort-req-' + Date.now(),
      method: 'chat.abort',
      params: {
        sessionKey: 'agent:main:main',
        runId: activeRunId,
      },
    };

    wsRef.current.send(JSON.stringify(abortPayload));
    setIsLoading(false);

    setMessages(
      messages.map((m) => {
        if (m.id === activeRunId + '-assistant') {
          return {
            ...m,
            isStreaming: false,
            content: m.content + '\n\n*（已由用户停止生成）*',
          };
        }
        return m;
      })
    );
    setActiveRunId(null);
  };

  const triggerManualReconnect = () => {
    if (!session) return;
    setReconnectCount(0);
    connectWS(session.id);
  };

  return (
    <div style={styles.container}>
      {/* Header Info */}
      <div style={styles.header}>
        <div style={styles.titleArea}>
          <h2 style={styles.title}>🦞 云龙虾 (OpenClaw) 对话控制台</h2>
          <p style={styles.subtitle}>按需热拉起云龙虾 AI 运行实例，支持实时双向 WebSockets 交互与诊断分析</p>
        </div>
        {(status === 'running' || status === 'reconnecting' || status === 'superseded') && session && (
          <div style={styles.metaArea}>
            <div style={styles.metaBadge}>
              <span style={status === 'running' ? styles.dotActive : styles.dotInactive} />
              {status === 'running' ? '运行中' : status === 'reconnecting' ? '重连中' : '已被接管'}
            </div>
            {latency !== null ? (
              <div style={styles.metaBadge}>
                ⏱️ 延迟: <span style={{ color: latency < 50 ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>{latency}ms</span>
              </div>
            ) : (
              <div style={styles.metaBadge}>⏱️ 延迟: 计算中...</div>
            )}
            <button style={styles.pauseBtn} onClick={pauseOpenClaw}>
              ⏸️ 暂停实例
            </button>
            <button style={styles.destroyBtn} onClick={destroyOpenClaw}>
              🗑️ 销毁实例
            </button>
          </div>
        )}
      </div>

      {/* Main panel layout */}
      <div style={styles.mainLayout}>
        {status === 'unstarted' && (
          <div style={styles.unstartedPanel}>
            <div style={styles.unstartedIcon}>🦞</div>
            <h3 style={styles.unstartedTitle}>云龙虾服务就绪</h3>
            <p style={styles.unstartedText}>
              点击下方按钮将为您按需拉起一个专属的 OpenClaw AI 运行实例。
              系统将通过后端 WebSockets 网关在内存中桥接连接，确保通信的高安全与隔离度。
            </p>
            <button style={styles.startBtn} onClick={startOpenClaw}>
              🔥 一键启动云龙虾
            </button>
          </div>
        )}

        {status === 'starting' && (
          <div style={styles.unstartedPanel}>
            <div style={styles.loadingSpinner} />
            <h3 style={styles.unstartedTitle}>云龙虾容器启动中</h3>
            <p style={styles.unstartedText}>
              正在准备系统镜像并分配独立端口。这通常需要几秒钟，请稍候...
            </p>
            <div style={styles.startingLogs}>
              {logs.map((log, index) => (
                <div key={index} style={styles.startingLogLine}>{log}</div>
              ))}
            </div>
          </div>
        )}

        {status === 'failed' && !session && (
          <div style={styles.unstartedPanel}>
            <div style={styles.failedIcon}>⚠️</div>
            <h3 style={styles.unstartedTitle}>容器启动失败</h3>
            <p style={styles.unstartedText}>
              未能成功部署 openclaw 容器。请检查宿主机的 Docker Daemon 状态是否正常。
            </p>
            <button style={styles.startBtn} onClick={startOpenClaw}>
              🔄 重新尝试启动
            </button>
            <div style={styles.startingLogs}>
              {logs.map((log, index) => (
                <div key={index} style={{ ...styles.startingLogLine, color: '#f87171' }}>{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* Conversation Cockpit View */}
        {(status === 'running' || status === 'reconnecting' || status === 'superseded' || (status === 'failed' && session)) && (
          <div style={styles.cockpitLayout}>
            {/* Left Column: Chat Dialog interface */}
            <div style={styles.chatContainer}>
              {/* Alert Banners for WS issues */}
              {status === 'superseded' && (
                <div style={styles.alertBanner}>
                  <span style={styles.alertIcon}>⚠️</span>
                  <span style={styles.alertText}>当前会话已在其他标签页/设备中打开，此标签页的实时连接已被断开。</span>
                  <button style={styles.reconnectBtn} onClick={triggerManualReconnect}>
                    夺回连接
                  </button>
                </div>
              )}
              {status === 'failed' && session && (
                <div style={styles.alertBannerError}>
                  <span style={styles.alertIcon}>❌</span>
                  <span style={styles.alertText}>实时通信连接断开，尝试自动重连均失败。</span>
                  <button style={styles.reconnectBtn} onClick={triggerManualReconnect}>
                    手动重连
                  </button>
                </div>
              )}
              {status === 'reconnecting' && (
                <div style={styles.alertBannerWarning}>
                  <span style={styles.alertIcon}>⏳</span>
                  <span style={styles.alertText}>连接断开，正在进行指数退避自动重连中... (已重试: {reconnectCount}/5)</span>
                </div>
              )}

              <div 
                ref={chatMessagesListRef}
                style={styles.chatMessagesList}
                onScroll={handleScroll}
              >
                {messages.length === 0 ? (
                  <div style={styles.welcomeContainer}>
                    <div style={styles.welcomeIcon}>🦞</div>
                    <h3 style={styles.welcomeTitle}>我是云龙虾智能助手</h3>
                    <p style={styles.welcomeSubtitle}>
                      我已经连接到专属于您的虚拟运行实例，可以通过对话或者右侧雷达对它进行监视与操作。
                    </p>
                    <div style={styles.suggestionsGrid}>
                      <button
                        style={styles.suggestionCard}
                        onClick={() => handleSend('你好！用一句话介绍你自己。')}
                      >
                        <span style={styles.suggestionIcon}>💬</span>
                        <span style={styles.suggestionText}>介绍自己</span>
                        <span style={styles.suggestionDesc}>询问AI客服基本信息</span>
                      </button>
                      <button
                        style={styles.suggestionCard}
                        onClick={() => handleSend('你有什么功能？如何控制这个虚拟环境？')}
                      >
                        <span style={styles.suggestionIcon}>🎮</span>
                        <span style={styles.suggestionText}>功能清单</span>
                        <span style={styles.suggestionDesc}>了解其控制协议与机制</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  messages.map((m) => {
                    // 如果是 AI 助理的空消息（既无内容，也无工具调用），则跳过渲染，避免在思考阶段出现空框
                    if (m.role === 'assistant' && !m.content && (!m.toolCalls || m.toolCalls.length === 0)) {
                      return null;
                    }
                    return (
                      <div
                        key={m.id}
                        style={{
                          ...styles.messageRow,
                          ...(m.role === 'user' ? styles.userRow : styles.assistantRow),
                        }}
                      >
                        {m.role !== 'user' && (
                          <div style={{ ...styles.avatar, ...styles.assistantAvatar }}>🦞</div>
                        )}
                        <div
                          style={{
                            ...styles.messageBubble,
                            ...(m.role === 'user' ? styles.userBubble : styles.assistantBubble),
                          }}
                        >
                          <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                            <TextRenderer content={m.content} />
                          </div>

                          {/* Rendering Tool Executions inside assistant bubbles */}
                          {m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 && (
                            <div style={styles.toolCallsContainer}>
                              {m.toolCalls.map((tc) => (
                                <ToolCallRenderer key={tc.id} toolCall={tc} />
                              ))}
                            </div>
                          )}

                          <span style={styles.messageTime}>
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {m.role === 'user' && (
                          <div style={{ ...styles.avatar, ...styles.userAvatar }}>👤</div>
                        )}
                      </div>
                    );
                  })
                )}

                {(() => {
                  const currentAssistantMsg = activeRunId ? messages.find(m => m.id === activeRunId + '-assistant') : null;
                  const showThinking = isLoading && (!currentAssistantMsg || (!currentAssistantMsg.content && (!currentAssistantMsg.toolCalls || currentAssistantMsg.toolCalls.length === 0)));
                  if (!showThinking) return null;
                  return (
                    <div style={styles.thinkingRow}>
                      <div style={{ ...styles.avatar, ...styles.assistantAvatar }}>🦞</div>
                      <div style={styles.thinkingBubble}>
                        <span>思考中 ({thinkingElapsed}s)</span>
                        <div style={styles.thinkingDots}>
                          <div style={{ ...styles.thinkingDot, animationDelay: '0s' }} />
                          <div style={{ ...styles.thinkingDot, animationDelay: '0.2s' }} />
                          <div style={{ ...styles.thinkingDot, animationDelay: '0.4s' }} />
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div ref={chatEndRef} />
              </div>

              <div style={styles.chatInputArea}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (chatText.trim()) {
                      handleSend(chatText);
                      setChatText('');
                    }
                  }}
                  style={styles.chatInputForm}
                >
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder={
                      status === 'superseded' 
                        ? '会话已被抢占，夺回连接后才可发送消息' 
                        : status === 'reconnecting' 
                          ? '网络重连中，请稍后...' 
                          : '给云龙虾发送消息...'
                    }
                    style={styles.chatInput}
                    disabled={isLoading || status === 'superseded' || status === 'reconnecting'}
                  />
                  {isLoading ? (
                    <button 
                      type="button" 
                      onClick={handleStopGenerating}
                      style={styles.chatStopBtn}
                    >
                      停止
                    </button>
                  ) : (
                    <button 
                      type="submit" 
                      style={styles.chatSendBtn} 
                      disabled={!chatText.trim() || status === 'superseded' || status === 'reconnecting'}
                    >
                      发送
                    </button>
                  )}
                </form>
              </div>
            </div>

            {/* Right Column: Telemetry Diagnostic Sidebar */}
            <div style={styles.sidebarContainer}>
              {/* Debug Log terminal */}
              <div style={styles.consoleCard}>
                <div style={styles.consoleHeader}>
                  <span>💾 容器实时通信日志</span>
                  <button style={styles.clearBtn} onClick={clearLogs}>清空</button>
                </div>
                <div style={styles.consoleBody}>
                  {logs.map((log, index) => (
                    <div key={index} style={styles.consoleLine}>
                      {log}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.95); }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes toolPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    boxSizing: 'border-box',
    padding: '24px',
    fontFamily: "'Inter', 'Outfit', 'PingFang SC', sans-serif",
    color: '#ffffff',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    paddingBottom: '16px',
    flexShrink: 0,
  },
  titleArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #a78bfa, #8b5cf6, #3b82f6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    margin: 0,
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  metaArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  metaBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '8px',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  dotActive: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#10b981',
    boxShadow: '0 0 8px #10b981',
  },
  dotInactive: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#ef4444',
    boxShadow: '0 0 8px #ef4444',
  },
  pauseBtn: {
    padding: '6px 14px',
    background: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '8px',
    color: '#f59e0b',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  destroyBtn: {
    padding: '6px 14px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#f87171',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  mainLayout: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  unstartedPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    maxWidth: '520px',
    padding: '40px',
    background: 'rgba(15, 15, 35, 0.45)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
  },
  unstartedIcon: {
    fontSize: '64px',
    marginBottom: '20px',
    filter: 'drop-shadow(0 0 16px rgba(139, 92, 246, 0.5))',
    animation: 'pulse 2s infinite ease-in-out',
  },
  failedIcon: {
    fontSize: '64px',
    marginBottom: '20px',
    filter: 'drop-shadow(0 0 16px rgba(239, 68, 68, 0.5))',
  },
  unstartedTitle: {
    margin: '0 0 12px 0',
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
  },
  unstartedText: {
    margin: '0 0 24px 0',
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.6,
  },
  startBtn: {
    padding: '14px 32px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '12px',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
  },
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '3px solid rgba(139, 92, 246, 0.1)',
    borderTop: '3px solid #8b5cf6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px',
  },
  startingLogs: {
    width: '100%',
    maxHeight: '120px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '20px',
    overflowY: 'auto',
    textAlign: 'left',
    boxSizing: 'border-box',
  },
  startingLogLine: {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '4px',
  },
  cockpitLayout: {
    display: 'flex',
    width: '100%',
    height: '100%',
    gap: '20px',
  },
  chatContainer: {
    flex: 2,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(15, 15, 35, 0.45)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
    height: '100%',
  },
  chatMessagesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  welcomeContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    height: '100%',
    padding: '40px 20px',
    color: '#ffffff',
  },
  welcomeIcon: {
    fontSize: '50px',
    marginBottom: '16px',
    filter: 'drop-shadow(0 0 12px rgba(139, 92, 246, 0.4))',
  },
  welcomeTitle: {
    fontSize: '22px',
    fontWeight: 700,
    margin: '0 0 8px 0',
  },
  welcomeSubtitle: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.5)',
    margin: '0 0 32px 0',
  },
  suggestionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    width: '100%',
    maxWidth: '640px',
  },
  suggestionCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    padding: '14px 16px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    color: '#ffffff',
    outline: 'none',
  },
  suggestionIcon: {
    fontSize: '18px',
  },
  suggestionText: {
    fontSize: '13px',
    fontWeight: 600,
  },
  suggestionDesc: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  messageRow: {
    display: 'flex',
    width: '100%',
    gap: '12px',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    flexShrink: 0,
  },
  userAvatar: {
    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  },
  assistantAvatar: {
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: '16px',
    padding: '12px 16px',
    fontSize: '14px',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  userBubble: {
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(29, 78, 216, 0.25))',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderTopRightRadius: '4px',
    color: '#ffffff',
  },
  assistantBubble: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderTopLeftRadius: '4px',
    color: '#ffffff',
  },
  toolCallsContainer: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  messageTime: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: '4px',
    display: 'block',
    textAlign: 'right',
  },
  chatInputArea: {
    padding: '16px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(10, 10, 25, 0.25)',
  },
  chatInputForm: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    background: 'rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '12px 16px',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.2s',
  },
  chatSendBtn: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
  },
  chatStopBtn: {
    padding: '12px 24px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
    color: '#f87171',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.1)',
  },
  thinkingRow: {
    display: 'flex',
    gap: '12px',
    width: '100%',
    alignItems: 'center',
  },
  thinkingBubble: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    borderTopLeftRadius: '4px',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  thinkingDots: {
    display: 'flex',
    gap: '4px',
  },
  thinkingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#8b5cf6',
    animation: 'dotBounce 1.4s infinite ease-in-out',
  },
  stopGeneratingBtn: {
    padding: '10px 16px',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: '10px',
    color: '#f87171',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  sidebarContainer: {
    width: '380px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    height: '100%',
    flexShrink: 0,
  },
  screenWrapper: {
    height: '220px',
    background: '#04020a',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  },
  screen: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  consoleCard: {
    flex: 1,
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '14px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  consoleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.4)',
    flexShrink: 0,
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: '#6366f1',
    fontSize: '11px',
    cursor: 'pointer',
  },
  consoleBody: {
    flex: 1,
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '8px',
    padding: '10px',
    overflowY: 'auto',
    fontFamily: 'Courier New, monospace',
    fontSize: '11px',
    color: '#34d399',
    lineHeight: 1.5,
  },
  consoleLine: {
    wordBreak: 'break-all',
    marginBottom: '4px',
  },

  // Connection Banners
  alertBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 16px',
    background: 'rgba(245, 158, 11, 0.12)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: '10px',
    margin: '10px 20px 0',
    fontSize: '13px',
    color: '#fbbf24',
    flexShrink: 0,
  },
  alertBannerError: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 16px',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: '10px',
    margin: '10px 20px 0',
    fontSize: '13px',
    color: '#f87171',
    flexShrink: 0,
  },
  alertBannerWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    background: 'rgba(59, 130, 246, 0.12)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: '10px',
    margin: '10px 20px 0',
    fontSize: '13px',
    color: '#60a5fa',
    flexShrink: 0,
  },
  alertIcon: {
    fontSize: '16px',
    flexShrink: 0,
  },
  alertText: {
    flex: 1,
  },
  reconnectBtn: {
    padding: '4px 10px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)',
    transition: 'all 0.2s',
  },
};

export default OpenClawPage;
