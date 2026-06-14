import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message } from '../services/api';
import type { Conversation } from '../components/Sidebar';
import {
  getConversations,
  createConversation,
  deleteConversation as apiDeleteConversation,
  getHistory,
  sendMessage,
} from '../services/api';

export interface ToolStatus {
  tool: string;         // tool name or '__thinking__'
  status: 'running' | 'done';
  args?: any;
  result?: any;
  thinking?: string;    // AI reasoning content
  round?: number;       // ReAct round number
  timeMs?: number;      // execution time in ms
}

/**
 * @param conversationId 当前 URL 中的对话 ID（来自路由参数）
 * @param onNavigate 导航回调 — 创建/删除对话后切换 URL
 */
export function useChat(
  conversationId: string | undefined,
  onNavigate: (id: string | null) => void,
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [historyPage, setHistoryPage] = useState(2);
  const abortRef = useRef<(() => void) | null>(null);

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      setConversations(data);
      return data;
    } catch (err) {
      console.error('加载对话列表失败:', err);
      return [];
    }
  }, []);

  // 当 URL 中的 conversationId 变化时，加载对应消息
  useEffect(() => {
    if (conversationId) {
      setHistoryPage(2);
      getHistory(conversationId, 1, 20).then(data => {
        setMessages(data.messages);
        setHasMore(data.hasMore);
      }).catch(err => {
        console.error('加载消息失败:', err);
        setMessages([]);
      });
    } else {
      setMessages([]);
      setHasMore(false);
    }
  }, [conversationId]);

  // 初始化加载对话列表
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 新建对话
  const newConversation = useCallback(async () => {
    try {
      const conv = await createConversation();
      setConversations(prev => [conv, ...prev]);
      setMessages([]);
      onNavigate(conv.id);
      return conv;
    } catch (err) {
      console.error('创建对话失败:', err);
      return null;
    }
  }, [onNavigate]);

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

    // 准备 AI 回复占位
    let aiContent = '';
    const aiMsgId = `ai-${Date.now()}`;
    const traceSteps: ToolStatus[] = []; // 本轮所有轨迹

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
          aiContent += event.content || '';
          setMessages(prev => {
            const existing = prev.find(m => m.id === aiMsgId);
            if (existing) {
              return prev.map(m =>
                m.id === aiMsgId ? { ...m, content: aiContent, traceSteps: [...traceSteps] } : m
              );
            } else {
              return [
                ...prev,
                {
                  id: aiMsgId,
                  conversationId: convId!,
                  role: 'assistant' as const,
                  content: aiContent,
                  createdAt: new Date().toISOString(),
                  traceSteps: [...traceSteps],
                },
              ];
            }
          });
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
          setMessages(prev => {
            const existing = prev.find(m => m.id === aiMsgId);
            if (existing) {
              return prev.map(m =>
                m.id === aiMsgId ? { ...m, traceSteps: [...traceSteps] } : m
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
          setMessages(prev =>
            prev.map(m =>
              m.id === aiMsgId ? { ...m, traceSteps: [...traceSteps] } : m
            )
          );
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
          setMessages(prev =>
            prev.map(m =>
              m.id === aiMsgId ? { ...m, traceSteps: [...traceSteps] } : m
            )
          );
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
          setMessages(prev =>
            prev.map(m =>
              m.id === aiMsgId ? { ...m, traceSteps: [...traceSteps] } : m
            )
          );
        } else if (event.type === 'workflow_output') {
          traceSteps.push({
            type: 'workflow_output',
            content: (event as any).content,
            mode: (event as any).mode,
          });
          setToolStatuses([...traceSteps]);
          setMessages(prev =>
            prev.map(m =>
              m.id === aiMsgId ? { ...m, traceSteps: [...traceSteps] } : m
            )
          );
        } else if (event.type === 'workflow_end') {
          traceSteps.push({
            type: 'workflow_end',
            workflowName: (event as any).workflowName,
            totalSteps: (event as any).totalSteps,
            totalTimeMs: (event as any).totalTimeMs,
          });
          setToolStatuses([...traceSteps]);
        } else if (event.type === 'error') {
          aiContent = event.content || '抱歉，发生了错误。';
          setMessages(prev => [
            ...prev.filter(m => m.id !== aiMsgId),
            {
              id: aiMsgId,
              conversationId: convId!,
              role: 'assistant' as const,
              content: aiContent,
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
        // 出错
        setIsLoading(false);
      }
    );

    abortRef.current = abort;
  }, [conversationId, newConversation, loadConversations]);

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
