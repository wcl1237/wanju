import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message, Conversation, ToolStatus } from '../types';
import {
  getConversations,
  createConversation,
  deleteConversation as apiDeleteConversation,
  getHistory,
  sendMessage,
  getWorkflowStatus,
} from '../api';

/**
 * @param conversationId 当前 URL 中的对话 ID（来自路由参数）
 * @param onNavigate 导航回调 — 创建/删除对话后切换 URL
 */
export function useChat(
  conversationId: string | undefined,
  onNavigate: (id: string | null) => void,
  blueprintId?: string,
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [historyPage, setHistoryPage] = useState(2);
  const abortRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    try {
      const data = await getConversations(blueprintId);
      setConversations(data);
      return data;
    } catch (err) {
      console.error('加载对话列表失败:', err);
      return [];
    }
  }, [blueprintId]);

  // 当 URL 中的 conversationId 变化时，加载对应消息
  useEffect(() => {
    if (conversationId) {
      setHistoryPage(2);
      getHistory(conversationId, 1, 40).then(data => {
        setMessages(data.messages);
        setHasMore(data.hasMore);
      }).catch(err => {
        console.error('加载消息失败:', err);
        setMessages([]);
      });

      // 检查是否有正在执行的工作流
      checkWorkflowStatus(conversationId);
    } else {
      setMessages([]);
      setHasMore(false);
    }

    return () => {
      // 切换对话时清除轮询
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [conversationId]);

  // 检查工作流执行状态（页面回来时恢复）
  const checkWorkflowStatus = useCallback(async (convId: string) => {
    try {
      const status = await getWorkflowStatus(convId);
      if (status.running) {
        setIsLoading(true);
        // 处理已缓存的事件
        processBufferedEvents(status.events, convId);
        // 开始轮询
        startPolling(convId);
      }
    } catch { /* ignore */ }
  }, []);

  // 处理 Redis 缓存的事件
  const processBufferedEvents = useCallback((events: any[], convId: string) => {
    for (const raw of events) {
      let event: any;
      try { event = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }

      if (event.type === 'content' && event.content) {
        // 每个 content 创建独立气泡 — 但因为是从DB恢复的，刷新历史即可
      } else if (event.type === 'workflow_complete') {
        setIsLoading(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }
    // 刷新消息列表获取最新数据
    getHistory(convId, 1, 40).then(data => {
      setMessages(data.messages);
      setHasMore(data.hasMore);
    }).catch(() => {});
  }, []);

  // 轮询工作流状态
  const startPolling = useCallback((convId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const status = await getWorkflowStatus(convId);
        // 有新事件时刷新消息列表
        if (status.events.length > 0) {
          getHistory(convId, 1, 40).then(data => {
            setMessages(data.messages);
            setHasMore(data.hasMore);
          }).catch(() => {});
        }
        if (!status.running) {
          setIsLoading(false);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch {
        // 轮询失败不阻塞
      }
    }, 2000);
  }, []);

  // 初始化加载对话列表 + 自动选中最近对话
  useEffect(() => {
    loadConversations().then(data => {
      // 如果当前没有选中对话且列表不为空，自动跳转到最近的对话
      if (!conversationId && data.length > 0) {
        onNavigate(data[0].id);
      }
    });
  }, [loadConversations]);

  // 新建对话
  const newConversation = useCallback(async () => {
    try {
      const conv = await createConversation(blueprintId);
      setConversations(prev => [conv, ...prev]);
      setMessages([]);
      onNavigate(conv.id);
      return conv;
    } catch (err) {
      console.error('创建对话失败:', err);
      return null;
    }
  }, [onNavigate, blueprintId]);

  // 删除对话
  const deleteConversation = useCallback(async (id: string) => {
    try {
      await apiDeleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (conversationId === id) {
        onNavigate(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('删除对话失败:', err);
    }
  }, [conversationId, onNavigate]);

  // 发送消息
  const send = useCallback(async (text: string) => {
    let convId = conversationId;

    // 如果没有活跃对话，先创建一个
    if (!convId) {
      const conv = await newConversation();
      if (!conv) return;
      convId = conv.id;
    }

    // 添加用户消息到本地
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId: convId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setToolStatuses([]);

    // 跟踪当前 content 对应的气泡 ID
    let currentBubbleId = '';
    const traceSteps: ToolStatus[] = [];

    const abort = sendMessage(
      convId,
      text,
      (event) => {
        if (event.type === 'memory_init' || event.type === 'message_save' || event.type === 'memory_load') {
          traceSteps.push({
            type: event.type,
            timeMs: (event as any).timeMs,
            meta: (event as any).meta,
          });
          setToolStatuses([...traceSteps]);
        } else if (event.type === 'skill_match') {
          traceSteps.push({ type: 'skill_match', skills: (event as any).skills || [] });
          setToolStatuses([...traceSteps]);
        } else if (event.type === 'content') {
          // 每个 content 事件创建一个新的独立气泡
          currentBubbleId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          setMessages(prev => [
            ...prev,
            {
              id: currentBubbleId,
              conversationId: convId!,
              role: 'assistant' as const,
              content: event.content || '',
              createdAt: new Date().toISOString(),
              traceSteps: [...traceSteps],
            },
          ]);
        } else if (event.type === 'content_saved') {
          // 后端已存 DB，更新气泡 ID 为真实 DB ID
          const realId = (event as any).messageId;
          if (realId && currentBubbleId) {
            setMessages(prev =>
              prev.map(m =>
                m.id === currentBubbleId ? { ...m, id: realId } : m
              )
            );
            currentBubbleId = realId;
          }
        } else if (event.type === 'thinking_end') {
          traceSteps.push({
            type: 'thinking_end',
            round: (event as any).round,
            content: event.content || '',
            timeMs: (event as any).timeMs,
          });
          setToolStatuses([...traceSteps]);
        } else if (event.type === 'tool_start') {
          traceSteps.push({ type: 'tool_start', tool: event.tool!, args: event.args });
          setToolStatuses([...traceSteps]);
          // 更新最后一个 assistant 消息的 traceSteps
          setMessages(prev => {
            const lastAi = [...prev].reverse().find(m => m.role === 'assistant');
            if (lastAi) {
              return prev.map(m =>
                m.id === lastAi.id ? { ...m, traceSteps: [...traceSteps] } : m
              );
            }
            return prev;
          });
        } else if (event.type === 'tool_result') {
          traceSteps.push({
            type: 'tool_result',
            tool: event.tool!,
            result: event.result,
            timeMs: (event as any).timeMs,
          });
          setToolStatuses([...traceSteps]);
          setMessages(prev => {
            const lastAi = [...prev].reverse().find(m => m.role === 'assistant');
            if (lastAi) {
              return prev.map(m =>
                m.id === lastAi.id ? { ...m, traceSteps: [...traceSteps] } : m
              );
            }
            return prev;
          });
        } else if (event.type === 'workflow_match') {
          traceSteps.push({
            type: 'workflow_match',
            workflowId: (event as any).workflowId,
            workflowName: (event as any).workflowName,
            workflowIcon: (event as any).workflowIcon,
            workflowMode: (event as any).workflowMode,
            timeMs: (event as any).timeMs,
          });
          setToolStatuses([...traceSteps]);
        } else if (event.type === 'workflow_start') {
          traceSteps.push({
            type: 'workflow_start',
            workflowName: (event as any).workflowName,
            stepCount: (event as any).stepCount,
          });
          setToolStatuses([...traceSteps]);
        } else if (event.type === 'workflow_step') {
          traceSteps.push({
            type: 'workflow_step',
            stepIndex: (event as any).stepIndex,
            nodeId: (event as any).nodeId,
            stepType: (event as any).stepType,
            stepName: (event as any).stepName,
            params: (event as any).params,
            result: (event as any).result,
            output: (event as any).output,
            conditionResult: (event as any).conditionResult,
            input: (event as any).input,
            error: (event as any).error,
            timeMs: (event as any).timeMs,
          });
          setToolStatuses([...traceSteps]);
          setMessages(prev => {
            const lastAi = [...prev].reverse().find(m => m.role === 'assistant');
            if (lastAi) {
              return prev.map(m =>
                m.id === lastAi.id ? { ...m, traceSteps: [...traceSteps] } : m
              );
            }
            return prev;
          });
        } else if (event.type === 'workflow_llm') {
          traceSteps.push({
            type: 'workflow_llm',
            stage: (event as any).stage,
            nodeId: (event as any).nodeId,
            purpose: (event as any).purpose,
            input: (event as any).input,
            timeMs: (event as any).timeMs,
          });
          setToolStatuses([...traceSteps]);
          setMessages(prev => {
            const lastAi = [...prev].reverse().find(m => m.role === 'assistant');
            if (lastAi) {
              return prev.map(m =>
                m.id === lastAi.id ? { ...m, traceSteps: [...traceSteps] } : m
              );
            }
            return prev;
          });
        } else if (event.type === 'workflow_output') {
          traceSteps.push({
            type: 'workflow_output',
            content: (event as any).content,
            mode: (event as any).mode,
          });
          setToolStatuses([...traceSteps]);
          setMessages(prev => {
            const lastAi = [...prev].reverse().find(m => m.role === 'assistant');
            if (lastAi) {
              return prev.map(m =>
                m.id === lastAi.id ? { ...m, traceSteps: [...traceSteps] } : m
              );
            }
            return prev;
          });
        } else if (event.type === 'workflow_end') {
          traceSteps.push({
            type: 'workflow_end',
            workflowName: (event as any).workflowName,
            totalSteps: (event as any).totalSteps,
            totalTimeMs: (event as any).totalTimeMs,
          });
          setToolStatuses([...traceSteps]);
        } else if (event.type === 'error') {
          const errorId = `err-${Date.now()}`;
          setMessages(prev => [
            ...prev,
            {
              id: errorId,
              conversationId: convId!,
              role: 'assistant' as const,
              content: event.content || '抱歉，发生了错误。',
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      },
      () => {
        // 完成
        setIsLoading(false);
        loadConversations();
      },
      () => {
        // 出错 — 开始轮询看后台是否还在执行
        if (convId) startPolling(convId);
      }
    );

    abortRef.current = abort;
  }, [conversationId, newConversation, loadConversations, startPolling]);

  // 加载更多历史消息
  const loadMore = useCallback(async () => {
    if (!conversationId || !hasMore) return;
    try {
      const result = await getHistory(conversationId, historyPage, 20);
      setMessages(prev => [...result.messages, ...prev]);
      setHasMore(result.hasMore);
      setHistoryPage(prev => prev + 1);
    } catch (err) {
      console.error('加载更多消息失败:', err);
    }
  }, [conversationId, hasMore, historyPage]);

  return {
    conversations,
    activeConversationId: conversationId || null,
    messages,
    isLoading,
    toolStatuses,
    hasMore,
    newConversation,
    deleteConversation,
    send,
    loadMore,
  };
}
