import { create } from 'zustand';
import { normalizeWSEvent } from '../utils/stream-normalizer';
import type { ToolCallState } from '../utils/stream-normalizer';

export interface OpenClawSession {
  id: string;
  containerId: string;
  containerName: string;
  hostPort: number;
  status: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCalls?: ToolCallState[];
  sealed?: boolean;
}

interface OpenClawState {
  status: 'unstarted' | 'starting' | 'running' | 'failed' | 'superseded' | 'reconnecting';
  session: OpenClawSession | null;
  messages: Message[];
  logs: string[];
  latency: number | null;
  reconnectCount: number;
  activeRunId: string | null;
  thinkingElapsed: number;
  isLoading: boolean;

  // Actions
  setStatus: (status: OpenClawState['status']) => void;
  setSession: (session: OpenClawSession | null) => void;
  addLog: (msg: string) => void;
  clearLogs: () => void;
  setLatency: (latency: number | null) => void;
  setMessages: (messages: Message[]) => void;
  appendMessage: (message: Message) => void;
  clearMessages: () => void;
  setIsLoading: (isLoading: boolean) => void;
  setActiveRunId: (runId: string | null) => void;
  setThinkingElapsed: (elapsed: number) => void;
  incrementThinkingElapsed: () => void;
  setReconnectCount: (count: number) => void;
  incrementReconnectCount: () => void;

  // Message WS Handler
  handleWSMessage: (eventData: string) => void;
}

export const useOpenClawStore = create<OpenClawState>((set, get) => ({
  status: 'unstarted',
  session: null,
  messages: [],
  logs: [],
  latency: null,
  reconnectCount: 0,
  activeRunId: null,
  thinkingElapsed: 0,
  isLoading: false,

  setStatus: (status) => set({ status }),
  setSession: (session) => set({ session }),
  
  addLog: (msg) => {
    const time = new Date().toLocaleTimeString();
    set((state) => ({
      logs: [...state.logs.slice(-199), `[${time}] ${msg}`],
    }));
  },
  
  clearLogs: () => set({ logs: [] }),
  setLatency: (latency) => set({ latency }),
  setMessages: (messages) => set({ messages }),
  
  appendMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  
  clearMessages: () => set({ messages: [] }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setActiveRunId: (activeRunId) => set({ activeRunId }),
  setThinkingElapsed: (thinkingElapsed) => set({ thinkingElapsed }),
  incrementThinkingElapsed: () => set((state) => ({ thinkingElapsed: state.thinkingElapsed + 1 })),
  setReconnectCount: (reconnectCount) => set({ reconnectCount }),
  incrementReconnectCount: () => set((state) => ({ reconnectCount: state.reconnectCount + 1 })),

  handleWSMessage: (eventData) => {
    let parsed: any;
    try {
      parsed = JSON.parse(eventData);
    } catch (err) {
      get().addLog(`收到数据 (JSON解析失败): ${eventData}`);
      return;
    }

    // Handle Ping/Pong RTT
    if (parsed.type === 'pong' || parsed.action === 'pong') {
      const timestamp = parsed.timestamp || 0;
      if (timestamp > 0) {
        const rtt = Date.now() - timestamp;
        get().setLatency(rtt);
      }
      return;
    }

    // Handle SUPERSEDED event
    if (parsed.type === 'event' && parsed.event === 'SUPERSEDED') {
      const payload = parsed.payload || {};
      get().setStatus('superseded');
      get().addLog(`⚠️ 连接已被强占: ${payload.message || '账号已在其他窗口打开'}`);
      get().setIsLoading(false);
      get().setActiveRunId(null);
      return;
    }

    // Handle Chat History Response
    if (parsed.type === 'res' && parsed.id?.startsWith('chat-history-')) {
      if (parsed.ok && parsed.payload?.messages) {
        const fetchedMessages = parsed.payload.messages || [];
        const formatted: Message[] = [];

        for (const m of fetchedMessages) {
          const role = m.role || 'assistant';

          if (role === 'user' || role === 'system') {
            let contentStr = '';
            if (typeof m.content === 'string') {
              contentStr = m.content;
            } else if (Array.isArray(m.content)) {
              contentStr = m.content.map((c: any) => c.text || '').join('');
            }
            formatted.push({
              id: m.id || m.idempotencyKey || `hist-user-${Date.now()}-${Math.random()}`,
              role,
              content: contentStr,
              timestamp: m.timestamp || Date.now(),
              sealed: true,
              isStreaming: false
            });
          } else if (role === 'assistant') {
            let contentStr = '';
            const toolCalls: ToolCallState[] = [];

            if (typeof m.content === 'string') {
              contentStr = m.content;
            } else if (Array.isArray(m.content)) {
              for (const block of m.content) {
                if (block.type === 'text') {
                  contentStr += block.text || '';
                } else if (block.type === 'toolCall') {
                  toolCalls.push({
                    id: block.id,
                    name: block.name,
                    arguments: block.arguments,
                    phase: 'result', // 历史记录默认已运行结束
                  });
                }
              }
            }

            formatted.push({
              id: m.id || m.idempotencyKey || `hist-assistant-${Date.now()}-${Math.random()}`,
              role: 'assistant',
              content: contentStr,
              timestamp: m.timestamp || Date.now(),
              sealed: true,
              isStreaming: false,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined
            });
          } else if (role === 'toolResult') {
            let resultStr = '';
            if (typeof m.content === 'string') {
              resultStr = m.content;
            } else if (Array.isArray(m.content)) {
              resultStr = m.content.map((c: any) => c.text || '').join('');
            }

            const toolCallId = m.toolCallId;
            if (toolCallId) {
              let found = false;
              for (let i = formatted.length - 1; i >= 0; i--) {
                const prevMsg = formatted[i];
                if (prevMsg.role === 'assistant' && prevMsg.toolCalls) {
                  const tc = prevMsg.toolCalls.find(t => t.id === toolCallId);
                  if (tc) {
                    tc.result = resultStr;
                    tc.isError = m.isError || false;
                    found = true;
                    break;
                  }
                }
              }
              if (!found) {
                console.warn(`Could not find matching tool call for result ID: ${toolCallId}`);
              }
            }
          }
        }
        get().setMessages(formatted);
      }
      return;
    }

    // Fallback log for non-stream events or generic logs
    get().addLog(`收到容器事件: ${eventData.length > 300 ? eventData.slice(0, 300) + '...' : eventData}`);

    // Standardize via normalizer
    const normalized = normalizeWSEvent(parsed);
    if (!normalized) return;

    const { runId, type, timestamp } = normalized;
    const assistantMsgId = `${runId}-assistant`;

    set((state) => {
      const currentMessages = [...state.messages];
      let msgIdx = currentMessages.findIndex((m) => m.id === assistantMsgId);

      // Helper to ensure assistant message exists
      const ensureAssistantMessage = () => {
        if (msgIdx === -1) {
          const newMsg: Message = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: timestamp || Date.now(),
            isStreaming: true,
            toolCalls: []
          };
          currentMessages.push(newMsg);
          msgIdx = currentMessages.length - 1;
        }
      };

      if (type === 'lifecycle') {
        if (normalized.phase === 'start') {
          ensureAssistantMessage();
          return { messages: currentMessages, isLoading: true, activeRunId: runId };
        } else if (normalized.phase === 'end') {
          ensureAssistantMessage();
          const target = currentMessages[msgIdx];
          currentMessages[msgIdx] = {
            ...target,
            isStreaming: false,
            sealed: true
          };
          return { messages: currentMessages, isLoading: false, activeRunId: null };
        }
      }

      if (type === 'text') {
        ensureAssistantMessage();
        const target = currentMessages[msgIdx];
        
        let newContent = target.content;
        if (normalized.text && normalized.text.length > target.content.length) {
          newContent = normalized.text;
        } else if (normalized.delta) {
          newContent = target.content + normalized.delta;
        }

        currentMessages[msgIdx] = {
          ...target,
          content: newContent,
          isStreaming: true
        };
        return { messages: currentMessages, isLoading: true, activeRunId: runId };
      }

      if (type === 'tool') {
        ensureAssistantMessage();
        const target = currentMessages[msgIdx];
        const toolCalls = target.toolCalls ? [...target.toolCalls] : [];
        const incomingTool = normalized.toolCall;

        if (incomingTool) {
          const tcIdx = toolCalls.findIndex((tc) => tc.id === incomingTool.id);
          if (tcIdx > -1) {
            toolCalls[tcIdx] = {
              ...toolCalls[tcIdx],
              phase: incomingTool.phase,
              arguments: incomingTool.arguments !== undefined ? incomingTool.arguments : toolCalls[tcIdx].arguments,
              result: incomingTool.result !== undefined ? incomingTool.result : toolCalls[tcIdx].result,
              isError: incomingTool.isError !== undefined ? incomingTool.isError : toolCalls[tcIdx].isError
            };
          } else {
            toolCalls.push(incomingTool);
          }
        }

        currentMessages[msgIdx] = {
          ...target,
          toolCalls,
          isStreaming: true
        };
        return { messages: currentMessages, isLoading: true, activeRunId: runId };
      }

      if (type === 'error') {
        ensureAssistantMessage();
        const target = currentMessages[msgIdx];
        currentMessages[msgIdx] = {
          ...target,
          content: target.content + `\n\n❌ **运行异常错误**: ${normalized.error || '未知的 Agent 错误'}`,
          isStreaming: false,
          sealed: true
        };
        return { messages: currentMessages, isLoading: false, activeRunId: null };
      }

      return {};
    });
  }
}));
