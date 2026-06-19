/**
 * Code Agent — Zustand Store
 *
 * 管理 Code Agent 的全局状态：连接状态、消息列表、工作流进度、日志。
 * 对话历史由容器内 MessageStore 持久化，前端仅保存运行时 UI 状态。
 */
import { create } from 'zustand';
import type {
  CodeAgentStatus,
  CodeAgentSession,
  CodeAgentMessage,
  ToolCallInfo,
  WorkflowProgress,
  WorkflowStepInfo,
} from '../types';

interface CodeAgentState {
  status: CodeAgentStatus;
  session: CodeAgentSession | null;
  messages: CodeAgentMessage[];
  logs: string[];
  isLoading: boolean;
  activeRunId: string | null;
  thinkingElapsed: number;
  reconnectCount: number;
  workflowProgress: WorkflowProgress | null;

  // Actions
  setStatus: (status: CodeAgentStatus) => void;
  setSession: (session: CodeAgentSession | null) => void;
  addLog: (log: string) => void;
  clearLogs: () => void;
  setMessages: (messages: CodeAgentMessage[]) => void;
  appendMessage: (message: CodeAgentMessage) => void;
  clearMessages: () => void;
  setIsLoading: (loading: boolean) => void;
  setActiveRunId: (id: string | null) => void;
  setThinkingElapsed: (elapsed: number) => void;
  incrementThinkingElapsed: () => void;
  setReconnectCount: (count: number) => void;
  incrementReconnectCount: () => void;
  setWorkflowProgress: (progress: WorkflowProgress | null) => void;
  handleWSMessage: (raw: string) => void;
}


export const useCodeAgentStore = create<CodeAgentState>((set, get) => ({
  status: 'unstarted',
  session: null,
  messages: [],
  logs: [],
  isLoading: false,
  activeRunId: null,
  thinkingElapsed: 0,
  reconnectCount: 0,
  workflowProgress: null,

  setStatus: (status) => set({ status }),
  setSession: (session) => set({ session }),
  addLog: (log) => set((s) => ({
    logs: [...s.logs, `[${new Date().toLocaleTimeString()}] ${log}`],
  })),
  clearLogs: () => set({ logs: [] }),
  setMessages: (messages) => set({ messages }),
  appendMessage: (message) => {
    // 纯 UI 操作，消息持久化由容器内 MessageStore 处理
    set((s) => ({ messages: [...s.messages, message] }));
  },
  clearMessages: () => set({ messages: [] }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setActiveRunId: (activeRunId) => set({ activeRunId }),
  setThinkingElapsed: (thinkingElapsed) => set({ thinkingElapsed }),
  incrementThinkingElapsed: () => set((s) => ({ thinkingElapsed: s.thinkingElapsed + 1 })),
  setReconnectCount: (reconnectCount) => set({ reconnectCount }),
  incrementReconnectCount: () => set((s) => ({ reconnectCount: s.reconnectCount + 1 })),
  setWorkflowProgress: (workflowProgress) => set({ workflowProgress }),

  handleWSMessage: (raw: string) => {
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const state = get();
    const sessionId = state.session?.id;

    switch (data.type) {
      case 'pong':
        break;

      // ─── 历史恢复（容器重连时发送） ──────────────
      case 'chat.history': {
        const historyMsgs: CodeAgentMessage[] = (data.messages || [])
          .filter((m: any) => m.role === 'user' || m.role === 'assistant' || m.role === 'system' || m.role === 'tool_call' || m.role === 'tool_result')
          .map((m: any) => {
            const msg: CodeAgentMessage = {
              id: m.id || `hist-${m.timestamp}`,
              role: m.role === 'tool_call' || m.role === 'tool_result' ? 'assistant' : m.role,
              content: m.content || '',
              timestamp: m.timestamp || Date.now(),
            };
            if (m.decision) msg.decision = m.decision;
            if (m.toolCall) {
              msg.toolCalls = [{
                id: m.id,
                tool: m.toolCall.tool,
                args: m.toolCall.args,
                status: 'completed' as const,
              }];
            }
            if (m.toolResult) {
              msg.toolCalls = [{
                id: m.id,
                tool: m.toolResult.tool,
                args: {},
                status: m.toolResult.success ? 'completed' as const : 'failed' as const,
                result: m.toolResult.result,
                timeMs: m.toolResult.timeMs,
              }];
            }
            return msg;
          });

        if (historyMsgs.length > 0) {
          // 合并连续的 tool_call 和 tool_result 到最近的 assistant 消息
          const merged: CodeAgentMessage[] = [];
          for (const msg of historyMsgs) {
            if (msg.toolCalls && msg.toolCalls.length > 0 && merged.length > 0) {
              const lastAssistant = [...merged].reverse().find(m => m.role === 'assistant');
              if (lastAssistant) {
                lastAssistant.toolCalls = [...(lastAssistant.toolCalls || []), ...msg.toolCalls];
                continue;
              }
            }
            merged.push(msg);
          }
          set({ messages: merged, isLoading: false });
          state.addLog(`📜 从容器恢复 ${merged.length} 条对话历史`);
        }
        break;
      }

      // ─── 聊天消息 ─────────────────────────────

      case 'chat.stream_start': {
        // 检查是否已有从 REST API 恢复的 isStreaming 消息（页面加载续接场景）
        const existingStreaming = get().messages.find(m => m.isStreaming);
        if (existingStreaming) {
          set({ isLoading: false });
          break;
        }

        // 每轮 ReAct 推理创建独立的 assistant 气泡
        // 工具调用会附加到当前气泡，下一轮思考创建新气泡
        const turnId = 'turn-' + Date.now();
        const assistantMsg: CodeAgentMessage = {
          id: turnId + '-assistant',
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolCalls: [],
          isStreaming: true,
        };
        set((s) => ({
          messages: [...s.messages, assistantMsg],
          activeRunId: turnId,
          isLoading: false,
        }));
        break;
      }

      case 'chat.chunk': {
        // 查找当前流式消息：优先找 isStreaming 标记的消息（兼容 REST API 恢复场景）
        set((s) => {
          const streamingMsg = s.messages.find(m => m.isStreaming);
          if (streamingMsg) {
            return {
              messages: s.messages.map(m =>
                m.id === streamingMsg.id ? { ...m, content: m.content + data.chunk } : m
              ),
            };
          }
          // 回退：按 activeRunId 查找
          const runId = get().activeRunId;
          if (!runId) return s;
          const msgId = runId + '-assistant';
          return {
            messages: s.messages.map(m =>
              m.id === msgId ? { ...m, content: m.content + data.chunk } : m
            ),
          };
        });
        break;
      }

      case 'chat.stream_end': {
        // 查找流式消息：优先按 isStreaming 标记（兼容页面加载续接）
        const currentMessages = get().messages;
        const streamMsg = currentMessages.find(m => m.isStreaming);
        
        if (streamMsg) {
          // 去重：检查是否与其他 assistant 消息内容相同
          if (streamMsg.content) {
            const isDuplicate = currentMessages.some(
              (m) => m.id !== streamMsg.id && m.role === 'assistant' && m.content && m.content.trim() === streamMsg.content.trim()
            );
            if (isDuplicate) {
              set((s) => ({
                messages: s.messages.filter(m => m.id !== streamMsg.id),
              }));
              break;
            }
          }
          set((s) => ({
            messages: s.messages.map(m =>
              m.id === streamMsg.id ? { ...m, isStreaming: false } : m
            ),
          }));
        }
        break;
      }

      case 'chat.text': {
        // 流式输出已经把内容放到了 assistant 消息中，chat.text 是重复的
        // 检查最后一条 assistant 消息是否已包含此内容
        set((s) => {
          const newState: Partial<CodeAgentState> = { isLoading: false, activeRunId: null };
          if (data.content) {
            const lastAssistant = [...s.messages].reverse().find(
              (m) => m.role === 'assistant' && m.content
            );
            // 如果最后的 assistant 消息包含 chat.text 的内容，跳过
            if (lastAssistant && lastAssistant.content.includes(data.content.trim())) {
              return newState;
            }
            // 如果 chat.text 内容包含最后 assistant 消息的内容（反向包含），也跳过
            if (lastAssistant && data.content.trim().includes(lastAssistant.content.trim())) {
              return newState;
            }
            const msg: CodeAgentMessage = {
              id: 'text-' + Date.now(),
              role: 'assistant',
              content: data.content,
              timestamp: Date.now(),
            };
            return { ...newState, messages: [...s.messages, msg] };
          }
          return newState;
        });
        break;
      }

      // ─── 工具调用 ─────────────────────────────

      case 'tool.start': {
        // 使用服务端 toolCallId（如有），否则生成客户端 ID
        const toolId = data.toolCallId || `tool-${Date.now()}`;
        // 创建独立的工具调用气泡
        const toolMsg: CodeAgentMessage = {
          id: toolId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolCalls: [{
            id: toolId,
            tool: data.tool,
            args: data.args || {},
            status: 'running' as const,
          }],
        };
        set((s) => ({
          messages: [...s.messages, toolMsg],
        }));
        state.addLog(`🔧 工具调用: ${data.tool}`);
        break;
      }

      case 'tool.result': {
        const resultToolId = data.toolCallId;
        set((s) => ({
          messages: s.messages.map((m) => {
            // 通过 toolCallId 精确匹配
            if (resultToolId && m.id === resultToolId && m.toolCalls) {
              return {
                ...m,
                toolCalls: m.toolCalls.map((tc) => ({
                  ...tc,
                  result: data.result,
                  timeMs: data.timeMs,
                  status: data.result?.success ? 'completed' as const : 'failed' as const,
                })),
              };
            }
            // 回退：按 tool 名 + running 状态匹配最后一个
            if (!resultToolId && m.toolCalls && m.toolCalls.length === 1) {
              const tc = m.toolCalls[0];
              if (tc.tool === data.tool && tc.status === 'running') {
                return {
                  ...m,
                  toolCalls: [{
                    ...tc,
                    result: data.result,
                    timeMs: data.timeMs,
                    status: data.result?.success ? 'completed' as const : 'failed' as const,
                  }],
                };
              }
            }
            return m;
          }),
        }));
        state.addLog(`✅ ${data.tool} 完成 (${data.timeMs}ms)`);
        break;
      }

      // ─── 决策请求 ─────────────────────────────

      case 'decision.required': {
        const decisionMsg: CodeAgentMessage = {
          id: 'decision-' + data.decisionId,
          role: 'system',
          content: '',
          timestamp: Date.now(),
          decision: {
            decisionId: data.decisionId,
            question: data.question,
            options: data.options,
            context: data.context,
            timeout: data.timeout,
            responded: false,
          },
        };
        set((s) => ({ messages: [...s.messages, decisionMsg] }));
        // 后端已自动持久化 decision 消息
        state.addLog(`⚠️ 需要决策: ${data.question}`);
        break;
      }

      // ─── 工作流事件 ───────────────────────────

      case 'workflow.started': {
        const steps: WorkflowStepInfo[] = (data.steps || []).map((s: any) => ({
          ...s,
          status: 'pending',
        }));
        set({
          workflowProgress: {
            workflowId: data.workflowId,
            steps,
            currentStepIndex: 0,
            percent: 0,
            message: '工作流已启动',
            status: 'running',
          },
          isLoading: true,
        });
        state.addLog(`🚀 工作流启动: ${data.workflowId}`);
        break;
      }

      case 'workflow.resumed': {
        // WS 重连后收到的工作流恢复状态
        const steps: WorkflowStepInfo[] = (data.steps || []).map((s: any, i: number) => ({
          ...s,
          status: i < (data.currentStepIndex || 0) ? 'completed' : (i === (data.currentStepIndex || 0) ? 'running' : 'pending'),
        }));
        set({
          workflowProgress: {
            workflowId: data.workflowId,
            steps,
            currentStepIndex: data.currentStepIndex || 0,
            percent: data.percent || 0,
            message: data.message || '工作流执行中...',
            status: 'running',
          },
          isLoading: true,
        });
        state.addLog(`🔄 工作流恢复: ${data.message}`);
        break;
      }

      case 'workflow.step_start': {
        set((s) => {
          if (!s.workflowProgress) return s;
          const steps = s.workflowProgress.steps.map((st, i) =>
            i === data.stepIndex ? { ...st, status: 'running' as const } : st
          );
          return {
            workflowProgress: {
              ...s.workflowProgress,
              steps,
              currentStepIndex: data.stepIndex,
              message: `执行步骤: ${data.stepName}`,
            },
          };
        });
        break;
      }

      case 'workflow.step_end': {
        set((s) => {
          if (!s.workflowProgress) return s;
          const steps = s.workflowProgress.steps.map((st, i) =>
            i === data.stepIndex ? { ...st, status: 'completed' as const } : st
          );
          return { workflowProgress: { ...s.workflowProgress, steps } };
        });
        break;
      }

      case 'workflow.progress': {
        set((s) => {
          if (!s.workflowProgress) return s;
          return {
            workflowProgress: {
              ...s.workflowProgress,
              percent: data.percent,
              message: data.message,
            },
          };
        });
        break;
      }

      case 'workflow.completed': {
        set((s) => ({
          isLoading: false,
          activeRunId: null,
          workflowProgress: s.workflowProgress
            ? { ...s.workflowProgress, status: 'completed', percent: 100, message: data.summary }
            : null,
        }));
        state.addLog(`✅ 工作流完成: ${data.summary?.substring(0, 100)}`);
        break;
      }

      case 'workflow.failed': {
        set((s) => ({
          isLoading: false,
          activeRunId: null,
          workflowProgress: s.workflowProgress
            ? { ...s.workflowProgress, status: 'failed', message: data.error }
            : null,
        }));
        state.addLog(`❌ 工作流失败: ${data.error}`);
        break;
      }

      // ─── 文件事件 ─────────────────────────────

      case 'file.created':
        state.addLog(`📄 文件创建: ${data.path}`);
        break;

      case 'file.modified':
        state.addLog(`📝 文件修改: ${data.path}`);
        break;

      case 'memory.saved':
        state.addLog(`🧠 记忆保存: ${data.key}`);
        break;

      // ─── 错误 ────────────────────────────────

      case 'error':
        state.addLog(`❌ 错误: ${data.message}`);
        break;

      default:
        state.addLog(`[WS] 未知消息: ${data.type}`);
    }
  },
}));
