/**
 * CodeAgentPage — Code Agent 调试控制台
 *
 * 功能：
 * - 启动/停止/销毁 Code Agent 容器
 * - WebSocket 实时对话
 * - 工作流推送与进度监控
 * - 决策点交互
 * - 工具调用可视化
 * - 实时日志面板
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCodeAgentStore } from '../store/useCodeAgentStore';
import { startCodeAgent, stopCodeAgent, destroyCodeAgent, getCodeAgentStatus, pushWorkflow, getCodeAgentMessages } from '../api';
import { WorkflowPushModal } from './WorkflowPushModal';
import MarkdownRenderer from './MarkdownRenderer';
import type { CodeAgentMessage, DecisionInfo, ToolCallInfo } from '../types';

/**
 * 将容器 StoredMessage[] 转换为前端 CodeAgentMessage[]
 * - 合并 tool_call/tool_result 到最近的 assistant 消息
 * - 保留 isStreaming 标记用于流式续接
 * - 过滤空内容的非流式 assistant 消息
 */
function convertStoredMessages(stored: any[]): CodeAgentMessage[] {
  const result: CodeAgentMessage[] = [];

  for (const m of stored) {
    // 跳过空内容且无附加数据的 assistant 消息
    if (m.role === 'assistant' && !m.content && !m.isStreaming && !m.workflow) continue;

    // tool_call: 创建独立的工具调用气泡
    if (m.role === 'tool_call' && m.toolCall) {
      const toolMsg: CodeAgentMessage = {
        id: m.id,
        role: 'assistant',
        content: '',
        timestamp: m.timestamp,
        toolCalls: [{
          id: m.id,
          tool: m.toolCall.tool,
          args: m.toolCall.args || {},
          status: 'running' as const,
        }],
      };
      result.push(toolMsg);
      continue;
    }

    // tool_result: 更新对应的 tool_call 消息
    if (m.role === 'tool_result' && m.toolResult) {
      // 找到对应的 tool_call 消息（通过匹配 tool 名和 running 状态）
      for (let i = result.length - 1; i >= 0; i--) {
        const r = result[i];
        if (r.toolCalls && r.toolCalls.length === 1) {
          const tc = r.toolCalls[0];
          if (tc.tool === m.toolResult.tool && tc.status === 'running') {
            tc.result = m.toolResult.result;
            tc.timeMs = m.toolResult.timeMs;
            tc.status = m.toolResult.success ? 'completed' : 'failed';
            break;
          }
        }
      }
      continue;
    }

    // 普通消息
    const msg: CodeAgentMessage = {
      id: m.id || `msg-${m.timestamp}`,
      role: (m.role === 'tool_call' || m.role === 'tool_result') ? 'assistant' : m.role,
      content: m.content || '',
      timestamp: m.timestamp || Date.now(),
    };

    if (m.isStreaming) msg.isStreaming = true;
    if (m.decision) msg.decision = m.decision;

    result.push(msg);
  }

  return result;
}

export const CodeAgentPage: React.FC = () => {
  const store = useCodeAgentStore();
  const {
    status, session, messages, logs, isLoading,
    thinkingElapsed, reconnectCount, workflowProgress,
    setStatus, setSession, addLog, clearLogs,
    clearMessages, setIsLoading, setActiveRunId,
    setThinkingElapsed, incrementThinkingElapsed,
    setReconnectCount, appendMessage,
  } = store;

  const [chatText, setChatText] = useState('');
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const reconnectTimerRef = useRef<any>(null);

  // ─── WebSocket 管理 ─────────────────────────────────

  const cleanupWS = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectWS = useCallback((sessionId: string) => {
    cleanupWS();
    const s = useCodeAgentStore.getState();
    if (s.status !== 'reconnecting') s.setStatus('running');
    s.addLog('正在建立与 Code Agent 的 WebSocket 通信...');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/code-agent?sessionId=${sessionId}`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      const cs = useCodeAgentStore.getState();
      cs.setStatus('running');
      cs.setReconnectCount(0);
      cs.addLog('🚀 Code Agent 通信链路已建立！');
    };

    socket.onmessage = async (event) => {
      let textData: string;
      if (event.data instanceof Blob) {
        textData = await event.data.text();
      } else {
        textData = String(event.data);
      }
      useCodeAgentStore.getState().handleWSMessage(textData);
    };

    socket.onclose = (e) => {
      cleanupWS();
      const cs = useCodeAgentStore.getState();
      cs.setIsLoading(false);
      cs.addLog(`通信链路断开 (Code: ${e.code})`);

      const { reconnectCount: rc, status: curStatus } = cs;
      if (curStatus === 'running' || curStatus === 'reconnecting') {
        if (rc < 5) {
          const delay = Math.pow(2, rc + 1) * 1000;
          cs.setStatus('reconnecting');
          cs.addLog(`⏱️ 第 ${rc + 1}/5 次重连将在 ${delay / 1000}s 后触发...`);
          reconnectTimerRef.current = setTimeout(() => {
            cs.incrementReconnectCount();
            connectWS(sessionId);
          }, delay);
        } else {
          cs.setStatus('failed');
          cs.addLog('❌ 自动重连已达上限');
        }
      }
    };

    socket.onerror = () => {
      useCodeAgentStore.getState().addLog('通信链路异常');
    };
  }, [cleanupWS]);

  // 检查已有会话并恢复消息历史
  useEffect(() => {
    const check = async () => {
      try {
        const res = await getCodeAgentStatus();
        if (res.success && res.data) {
          setSession(res.data);
          setStatus('running');
          addLog(`检测到已有 Code Agent 会话: ${res.data.id}`);

          // 从容器加载消息历史
          try {
            const msgRes = await getCodeAgentMessages(res.data.id);
            if (msgRes.success && msgRes.data && msgRes.data.length > 0) {
              const converted = convertStoredMessages(msgRes.data);
              if (converted.length > 0) {
                store.setMessages(converted);
                addLog(`已恢复 ${converted.length} 条对话历史`);

                // 检查是否有正在流式输出的消息
                const streamingMsg = converted.find(m => m.isStreaming);
                if (streamingMsg) {
                  addLog('⏳ 检测到正在进行的流式输出，等待后续内容...');
                } else {
                  // 恢复任务状态：仅当最后一条是用户发送的普通消息（非工作流推送）时才显示 loading
                  const lastMsg = converted[converted.length - 1];
                  const isUserAwaitingResponse = lastMsg
                    && lastMsg.role === 'user'
                    && !lastMsg.content.startsWith('📋'); // 排除工作流推送消息
                  if (isUserAwaitingResponse) {
                    setIsLoading(true);
                    addLog('⏳ 检测到未完成的任务，等待 Agent 响应...');
                  }
                }
              }
            }
          } catch (e: any) {
            addLog(`对话历史加载失败: ${e.message}`);
          }

          connectWS(res.data.id);
        }
      } catch (e: any) {
        addLog(`状态查询失败: ${e.message}`);
      }
    };
    check();
    return () => cleanupWS();
  }, [connectWS, cleanupWS, setSession, setStatus, addLog]);

  // 自动滚动
  useEffect(() => {
    if (shouldAutoScroll && chatListRef.current) {
      chatListRef.current.scrollTo({ top: chatListRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading, shouldAutoScroll]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 思考计时器
  useEffect(() => {
    let timer: any;
    if (isLoading) {
      setThinkingElapsed(0);
      timer = setInterval(() => incrementThinkingElapsed(), 1000);
    }
    return () => clearInterval(timer);
  }, [isLoading, setThinkingElapsed, incrementThinkingElapsed]);

  const handleScroll = () => {
    if (!chatListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatListRef.current;
    setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 120);
  };

  // ─── 容器管理 ─────────────────────────────────────

  const handleStart = async () => {
    setStatus('starting');
    clearLogs();
    addLog('正在启动 Code Agent 容器...');
    try {
      const res = await startCodeAgent();
      if (res.success && res.data) {
        setTimeout(() => {
          setSession(res.data);
          setStatus('running');
          addLog(`✅ Code Agent 容器就绪！ID: ${res.data.containerId?.slice(0, 12)}`);
          connectWS(res.data.id);
        }, 2000);
      } else {
        setStatus('failed');
        addLog(`❌ 启动失败: ${res.message}`);
      }
    } catch (e: any) {
      setStatus('failed');
      addLog(`❌ 启动异常: ${e.message}`);
    }
  };

  const handleStop = async () => {
    if (!session) return;
    cleanupWS();
    try {
      const res = await stopCodeAgent(session.id);
      if (res.success) {
        addLog('✅ Code Agent 已暂停');
      } else {
        addLog(`暂停: ${res.message || '会话不存在，已清理本地状态'}`);
      }
    } catch (e: any) {
      addLog(`暂停失败: ${e.message}`);
    }
    // 无论后端是否成功，都清理前端状态
    setStatus('unstarted');
    setSession(null);
  };

  const handleDestroy = async () => {
    if (!session) return;
    if (!window.confirm('⚠️ 此操作将删除所有对话、文件和记忆数据，不可恢复！确定继续？')) return;
    cleanupWS();
    try {
      const res = await destroyCodeAgent(session.id);
      if (res.success) {
        addLog('✅ Code Agent 已销毁');
      } else {
        addLog(`销毁: ${res.message || '会话不存在，已清理本地状态'}`);
      }
    } catch (e: any) {
      addLog(`销毁失败: ${e.message}`);
    }
    // 无论后端是否成功，都清理前端状态和消息
    setStatus('unstarted');
    setSession(null);
    clearMessages();
  };

  // ─── 消息发送 ─────────────────────────────────────

  const handleSend = (text: string) => {
    if (!text.trim() || isLoading) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('发送失败: 通信链路未连接');
      return;
    }

    const runId = 'run-' + Date.now();
    appendMessage({
      id: runId + '-user',
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });

    setIsLoading(true);
    setActiveRunId(runId);
    wsRef.current.send(JSON.stringify({ type: 'chat.message', content: text }));
  };

  // ─── 决策响应 ─────────────────────────────────────

  const handleDecisionResponse = (decisionId: string, choice: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'decision.response',
      decisionId,
      choice,
    }));

    // 更新消息中的决策状态，保存用户选择
    useCodeAgentStore.getState().setMessages(
      messages.map((m) => {
        if (m.decision?.decisionId === decisionId) {
          return { ...m, decision: { ...m.decision, responded: true, choice } };
        }
        return m;
      })
    );

    // 显示思考中状态
    setIsLoading(true);
    addLog(`✅ 已响应决策: ${choice}`);
  };

  // ─── 工作流推送 ───────────────────────────────────

  const handlePushWorkflow = async (workflow: any) => {
    if (!session) return;
    try {
      addLog(`📋 推送工作流: ${workflow.name}`);

      const runId = 'workflow-' + Date.now();

      // 显示用户消息气泡
      appendMessage({
        id: runId + '-user',
        role: 'user',
        content: `📋 推送工作流：${workflow.name || '未命名工作流'}`,
        timestamp: Date.now(),
      });

      // 通过 WS 发送工作流
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'chat.message',
          content: `__WORKFLOW__:${JSON.stringify(workflow)}`,
        }));
        setIsLoading(true);
        setActiveRunId(runId);
      }
      setShowWorkflowModal(false);
    } catch (e: any) {
      addLog(`工作流推送失败: ${e.message}`);
    }
  };

  // ─── 渲染 ────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* 头部 */}
      <div style={styles.header}>
        <div style={styles.titleArea}>
          <h2 style={styles.title}>🤖 Code Agent 调试控制台</h2>
          <p style={styles.subtitle}>容器化工作流执行 Agent — 推送工作流、实时对话、决策交互</p>
        </div>
        {(status === 'running' || status === 'reconnecting') && session && (
          <div style={styles.metaArea}>
            <div style={styles.metaBadge}>
              <span style={status === 'running' ? styles.dotActive : styles.dotInactive} />
              {status === 'running' ? '运行中' : '重连中'}
            </div>
            <button style={styles.workflowBtn} onClick={() => setShowWorkflowModal(true)}>
              📋 推送工作流
            </button>
            <button style={styles.pauseBtn} onClick={handleStop}>⏸️ 暂停</button>
            <button style={styles.destroyBtn} onClick={handleDestroy}>🗑️ 销毁</button>
          </div>
        )}
      </div>

      {/* 主面板 */}
      <div style={styles.mainLayout}>
        {/* 未启动 */}
        {status === 'unstarted' && (
          <div style={styles.unstartedPanel}>
            <div style={styles.unstartedIcon}>🤖</div>
            <h3 style={styles.unstartedTitle}>Code Agent 服务就绪</h3>
            <p style={styles.unstartedText}>
              点击启动将为您拉起一个专属的 Code Agent 容器实例。
              支持工作流推送、实时对话、文件操作和人机决策协作。
            </p>
            <button style={styles.startBtn} onClick={handleStart}>🔥 启动 Code Agent</button>
          </div>
        )}

        {/* 启动中 */}
        {status === 'starting' && (
          <div style={styles.unstartedPanel}>
            <div style={styles.loadingSpinner} />
            <h3 style={styles.unstartedTitle}>Code Agent 容器启动中</h3>
            <p style={styles.unstartedText}>正在准备环境，通常需要几秒钟...</p>
            <div style={styles.startingLogs}>
              {logs.map((log, i) => <div key={i} style={styles.startingLogLine}>{log}</div>)}
            </div>
          </div>
        )}

        {/* 失败 */}
        {status === 'failed' && !session && (
          <div style={styles.unstartedPanel}>
            <div style={{ fontSize: '48px' }}>⚠️</div>
            <h3 style={styles.unstartedTitle}>启动失败</h3>
            <button style={styles.startBtn} onClick={handleStart}>🔄 重新启动</button>
            <div style={styles.startingLogs}>
              {logs.map((log, i) => <div key={i} style={{ ...styles.startingLogLine, color: '#f87171' }}>{log}</div>)}
            </div>
          </div>
        )}

        {/* 运行中 — 对话视图 */}
        {(status === 'running' || status === 'reconnecting' || (status === 'failed' && session)) && (
          <div style={styles.cockpitLayout}>
            {/* 左侧：对话面板 */}
            <div style={styles.chatContainer}>
              {/* 工作流进度条 */}
              {workflowProgress && (
                <div style={styles.progressBar}>
                  <div style={styles.progressHeader}>
                    <span>📋 工作流进度</span>
                    <span style={{
                      color: workflowProgress.status === 'completed' ? '#10b981'
                        : workflowProgress.status === 'failed' ? '#ef4444' : '#a78bfa',
                    }}>
                      {workflowProgress.percent >= 0 ? `${workflowProgress.percent}%` : ''}
                      {' '}{workflowProgress.status === 'completed' ? '✅ 完成' :
                        workflowProgress.status === 'failed' ? '❌ 失败' : ''}
                    </span>
                  </div>
                  <div style={styles.progressTrack}>
                    <div style={{ ...styles.progressFill, width: `${Math.max(0, workflowProgress.percent)}%` }} />
                  </div>
                  <div style={styles.progressSteps}>
                    {workflowProgress.steps.map((step, i) => (
                      <div key={step.id} style={{
                        ...styles.progressStep,
                        color: step.status === 'completed' ? '#10b981' :
                          step.status === 'running' ? '#a78bfa' :
                            step.status === 'failed' ? '#ef4444' : 'rgba(255,255,255,0.35)',
                      }}>
                        {step.status === 'completed' ? '✅' :
                          step.status === 'running' ? '⏳' :
                            step.status === 'failed' ? '❌' : '○'}{' '}
                        {step.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 消息列表 */}
              <div ref={chatListRef} style={styles.chatMessagesList} onScroll={handleScroll}>
                {messages.length === 0 ? (
                  <div style={styles.welcomeContainer}>
                    <div style={{ fontSize: '48px' }}>🤖</div>
                    <h3 style={styles.welcomeTitle}>Code Agent 已就绪</h3>
                    <p style={styles.welcomeSubtitle}>发送消息开始对话，或推送工作流开始自动化执行。</p>
                    <div style={styles.suggestionsGrid}>
                      <button style={styles.suggestionCard} onClick={() => handleSend('你好！介绍一下你能做什么？')}>
                        <span style={styles.suggestionIcon}>💬</span>
                        <span style={styles.suggestionText}>了解能力</span>
                      </button>
                      <button style={styles.suggestionCard} onClick={() => handleSend('帮我分析当前工作目录的项目结构')}>
                        <span style={styles.suggestionIcon}>📂</span>
                        <span style={styles.suggestionText}>分析项目</span>
                      </button>
                      <button style={styles.suggestionCard} onClick={() => setShowWorkflowModal(true)}>
                        <span style={styles.suggestionIcon}>📋</span>
                        <span style={styles.suggestionText}>推送工作流</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      onDecisionResponse={handleDecisionResponse}
                    />
                  ))
                )}

                {/* 思考中指示器：仅在没有流式消息时显示 */}
                {isLoading && !messages.some(m => m.isStreaming) && (
                  <div style={styles.thinkingRow}>
                    <div style={{ ...styles.avatar, ...styles.assistantAvatar }}>🤖</div>
                    <div style={styles.thinkingBubble}>
                      <span>思考中 ({thinkingElapsed}s)</span>
                      <div style={styles.thinkingDots}>
                        <div style={{ ...styles.thinkingDot, animationDelay: '0s' }} />
                        <div style={{ ...styles.thinkingDot, animationDelay: '0.2s' }} />
                        <div style={{ ...styles.thinkingDot, animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* 输入框 */}
              <div style={styles.chatInputArea}>
                <form onSubmit={(e) => { e.preventDefault(); handleSend(chatText); setChatText(''); }} style={styles.chatInputForm}>
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder={status === 'reconnecting' ? '重连中...' : '给 Code Agent 发送消息...'}
                    style={styles.chatInput}
                    disabled={isLoading || status === 'reconnecting'}
                  />
                  <button type="submit" style={styles.chatSendBtn} disabled={!chatText.trim() || isLoading}>
                    发送
                  </button>
                </form>
              </div>
            </div>

            {/* 右侧：日志面板 */}
            <div style={styles.sidebarContainer}>
              <div style={styles.consoleCard}>
                <div style={styles.consoleHeader}>
                  <span>💾 实时通信日志</span>
                  <button style={styles.clearBtn} onClick={clearLogs}>清空</button>
                </div>
                <div style={styles.consoleBody}>
                  {logs.map((log, i) => <div key={i} style={styles.consoleLine}>{log}</div>)}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 工作流推送弹窗 */}
      {showWorkflowModal && (
        <WorkflowPushModal
          onClose={() => setShowWorkflowModal(false)}
          onPush={handlePushWorkflow}
        />
      )}

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
};

// ─── 消息气泡组件 ─────────────────────────────────

const MessageBubble: React.FC<{
  message: CodeAgentMessage;
  onDecisionResponse: (decisionId: string, choice: string) => void;
}> = ({ message: m, onDecisionResponse }) => {
  const [decisionInput, setDecisionInput] = useState('');

  // 决策消息
  if (m.decision) {
    return (
      <div style={styles.decisionRow}>
        <div style={styles.decisionCard}>
          <div style={styles.decisionHeader}>⚠️ 需要您的决策</div>
          <div style={styles.decisionQuestion}>{m.decision.question}</div>
          {m.decision.context && (
            <div style={styles.decisionContext}>{m.decision.context}</div>
          )}
          {!m.decision.responded ? (
            <div style={styles.decisionActions}>
              {m.decision.options ? (
                m.decision.options.map((opt) => (
                  <button
                    key={opt}
                    style={styles.decisionOptionBtn}
                    onClick={() => onDecisionResponse(m.decision!.decisionId, opt)}
                  >
                    {opt}
                  </button>
                ))
              ) : (
                <div style={styles.decisionFreeInput}>
                  <input
                    type="text"
                    value={decisionInput}
                    onChange={(e) => setDecisionInput(e.target.value)}
                    placeholder="输入您的回答..."
                    style={styles.decisionInputField}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && decisionInput.trim()) {
                        onDecisionResponse(m.decision!.decisionId, decisionInput);
                        setDecisionInput('');
                      }
                    }}
                  />
                  <button
                    style={styles.decisionSubmitBtn}
                    onClick={() => {
                      if (decisionInput.trim()) {
                        onDecisionResponse(m.decision!.decisionId, decisionInput);
                        setDecisionInput('');
                      }
                    }}
                  >
                    提交
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={styles.decisionResponded}>
              ✅ 已选择: {m.decision.choice || '已响应'}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 普通消息
  return (
    <div style={{
      ...styles.messageRow,
      ...(m.role === 'user' ? styles.userRow : styles.assistantRow),
    }}>
      {m.role !== 'user' && <div style={{ ...styles.avatar, ...styles.assistantAvatar }}>🤖</div>}
      <div style={{
        ...styles.messageBubble,
        ...(m.role === 'user' ? styles.userBubble : styles.assistantBubble),
      }}>
      <div style={{ wordBreak: 'break-word' }}>
          {m.content && (
            m.role === 'assistant'
              ? <MarkdownRenderer content={m.content} />
              : <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
          )}
          {m.isStreaming && <span style={styles.streamingCursor}>▌</span>}
        </div>

        {/* 工具调用 */}
        {m.toolCalls && m.toolCalls.length > 0 && (
          <div style={styles.toolCallsContainer}>
            {m.toolCalls.map((tc) => (
              <div key={tc.id} style={styles.toolCallItem}>
                <div style={styles.toolCallHeader}>
                  <span>{tc.status === 'running' ? '⏳' : tc.status === 'completed' ? '✅' : '❌'}</span>
                  <span style={styles.toolCallName}>{tc.tool}</span>
                  {tc.timeMs && <span style={styles.toolCallTime}>{tc.timeMs}ms</span>}
                </div>
                {tc.result && (
                  <div style={styles.toolCallResult}>
                    {tc.result.output?.substring(0, 200)}
                    {(tc.result.output?.length || 0) > 200 ? '...' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <span style={styles.messageTime}>
          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {m.role === 'user' && <div style={{ ...styles.avatar, ...styles.userAvatar }}>👤</div>}
    </div>
  );
};

// ─── 样式 ──────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', boxSizing: 'border-box', padding: '24px', fontFamily: "'Inter', 'PingFang SC', sans-serif", color: '#fff', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px', flexShrink: 0 },
  titleArea: { display: 'flex', flexDirection: 'column', gap: '4px' },
  title: { margin: 0, fontSize: '22px', fontWeight: 700, background: 'linear-gradient(135deg, #10b981, #06b6d4, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.45)' },
  metaArea: { display: 'flex', alignItems: 'center', gap: '10px' },
  metaBadge: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.8)' },
  dotActive: { width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' },
  dotInactive: { width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' },
  workflowBtn: { padding: '6px 14px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', color: '#10b981', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },
  pauseBtn: { padding: '6px 14px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', color: '#f59e0b', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  destroyBtn: { padding: '6px 14px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  mainLayout: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  unstartedPanel: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', maxWidth: '500px' },
  unstartedIcon: { fontSize: '48px' },
  unstartedTitle: { margin: 0, fontSize: '18px', fontWeight: 600, color: '#fff' },
  unstartedText: { margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6 },
  startBtn: { padding: '12px 28px', background: 'linear-gradient(135deg, #10b981, #06b6d4)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' },
  loadingSpinner: { width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #10b981', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  startingLogs: { width: '100%', maxHeight: '120px', overflow: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px' },
  startingLogLine: { fontSize: '11px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace" },
  cockpitLayout: { display: 'flex', width: '100%', height: '100%', gap: '16px', overflow: 'hidden' },
  chatContainer: { flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden' },
  chatMessagesList: { flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  chatInputArea: { padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  chatInputForm: { display: 'flex', gap: '8px' },
  chatInput: { flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', fontSize: '14px', fontFamily: "'Inter', 'PingFang SC', sans-serif", outline: 'none' },
  chatSendBtn: { padding: '10px 20px', background: 'linear-gradient(135deg, #10b981, #06b6d4)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  sidebarContainer: { width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column' },
  consoleCard: { flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden' },
  consoleHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' },
  clearBtn: { padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', cursor: 'pointer' },
  consoleBody: { flex: 1, overflow: 'auto', padding: '10px 14px' },
  consoleLine: { fontSize: '11px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace" },
  // 消息
  messageRow: { display: 'flex', alignItems: 'flex-start', gap: '10px' },
  userRow: { flexDirection: 'row-reverse' },
  assistantRow: { flexDirection: 'row' },
  avatar: { width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 },
  assistantAvatar: { background: 'rgba(16,185,129,0.15)' },
  userAvatar: { background: 'rgba(99,102,241,0.15)' },
  messageBubble: { maxWidth: '70%', padding: '10px 14px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.6, position: 'relative' },
  userBubble: { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)' },
  assistantBubble: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' },
  messageTime: { display: 'block', textAlign: 'right', fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '6px' },
  // 工具调用
  toolCallsContainer: { marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' },
  toolCallItem: { background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '8px 10px', border: '1px solid rgba(255,255,255,0.04)' },
  toolCallHeader: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' },
  toolCallName: { fontFamily: "'JetBrains Mono', monospace" },
  toolCallTime: { marginLeft: 'auto', fontSize: '11px', color: 'rgba(255,255,255,0.35)' },
  toolCallResult: { marginTop: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, maxHeight: '80px', overflow: 'auto' },
  // 思考中
  thinkingRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  thinkingBubble: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.5)' },
  thinkingDots: { display: 'flex', gap: '3px' },
  thinkingDot: { width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', animation: 'dotBounce 1.4s infinite ease-in-out' },
  // 决策
  decisionRow: { display: 'flex', justifyContent: 'center' },
  decisionCard: { maxWidth: '500px', width: '100%', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '16px' },
  decisionHeader: { fontSize: '14px', fontWeight: 700, color: '#f59e0b', marginBottom: '10px' },
  decisionQuestion: { fontSize: '14px', color: '#fff', lineHeight: 1.6, marginBottom: '8px' },
  decisionContext: { fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, marginBottom: '12px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' },
  decisionActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  decisionOptionBtn: { padding: '8px 16px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', color: '#f59e0b', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },
  decisionFreeInput: { display: 'flex', gap: '8px', width: '100%' },
  decisionInputField: { flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '13px', outline: 'none' },
  decisionSubmitBtn: { padding: '8px 16px', background: 'linear-gradient(135deg, #f59e0b, #f97316)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  decisionResponded: { fontSize: '13px', color: '#10b981', fontWeight: 600 },
  // 欢迎
  welcomeContainer: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  welcomeTitle: { margin: 0, fontSize: '18px', fontWeight: 600, color: '#fff' },
  welcomeSubtitle: { margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  suggestionsGrid: { display: 'flex', gap: '10px', marginTop: '12px' },
  suggestionCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '14px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', color: '#fff', fontFamily: "'Inter', 'PingFang SC', sans-serif" },
  suggestionIcon: { fontSize: '24px' },
  suggestionText: { fontSize: '13px', fontWeight: 600 },
  // 进度条
  progressBar: { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(16,185,129,0.05)' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '8px' },
  progressTrack: { height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #10b981, #06b6d4)', borderRadius: '2px', transition: 'width 0.5s ease' },
  progressSteps: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' },
  progressStep: { fontSize: '11px', padding: '2px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' },
  // 流式光标
  streamingCursor: { display: 'inline-block', color: '#10b981', animation: 'blink 1s infinite', fontWeight: 700 },
};

export default CodeAgentPage;
