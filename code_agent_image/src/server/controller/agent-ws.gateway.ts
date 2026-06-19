/**
 * WebSocket Gateway — 实时对话与工作流交互
 *
 * 处理客户端 WebSocket 连接，路由消息到 Agent Core 和 Workflow Engine。
 * 所有消息（含 tool 调用）持久化到 MessageStore，重连时发送完整历史。
 */
import {
  WSController,
  OnWSConnection,
  OnWSMessage,
  OnWSDisConnection,
  Inject,
  App,
} from '@midwayjs/core';
import * as WebSocket from 'ws';
import { Context } from '@midwayjs/ws';
import { QueryEngine } from '../../agent/query-engine';
import { DecisionGate } from '../../agent/decision-gate';
import { ConversationManager } from '../../agent/conversation-manager';
import { WorkflowRunner } from '../../workflow/workflow-runner';
import { ToolRegistry } from '../../tools/tool-registry';
import { MemoryStore } from '../../persistence/memory-store';
import { HistoryStore } from '../../persistence/history-store';
import { MessageStore, StoredMessage } from '../../persistence/message-store';
import { registerBuiltinTools } from '../../tools/index';
import { buildBaseSystemPrompt, buildMemoryContext } from '../../agent/system-prompt';
import { ClientMessage, AgentMessage } from '../../agent/types';
import { WorkflowDefinition } from '../../workflow/types';
import { WorkflowController } from './workflow.controller';

@WSController()
export class AgentWSGateway {
  @Inject()
  ctx: Context;

  @Inject()
  queryEngine: QueryEngine;

  @Inject()
  decisionGate: DecisionGate;

  @Inject()
  conversationManager: ConversationManager;

  @Inject()
  workflowRunner: WorkflowRunner;

  @Inject()
  toolRegistry: ToolRegistry;

  @Inject()
  memoryStore: MemoryStore;

  @Inject()
  historyStore: HistoryStore;

  @Inject()
  messageStore: MessageStore;

  private conversationId: string;
  private toolsRegistered = false;

  @OnWSConnection()
  async onConnection() {
    console.log('[WS] Client connected');

    // 只在首次连接时注册工具
    if (!this.toolsRegistered) {
      registerBuiltinTools(this.toolRegistry, this.memoryStore);
      this.toolsRegistered = true;
    }

    // 复用已有对话
    if (!this.conversationId) {
      const conv = this.conversationManager.createConversation();
      this.conversationId = conv.id;
    }

    // 更新消息发送器，绑定到当前活跃连接
    const currentCtx = this.ctx;
    const sender = (msg: AgentMessage) => {
      try {
        if (currentCtx.readyState === WebSocket.OPEN) {
          currentCtx.send(JSON.stringify(msg));
        }
      } catch (e) {
        console.error('[WS] Failed to send:', e.message);
      }

      // 拦截并持久化所有 agent 输出消息
      this.persistAgentMessage(msg).catch(err => {
        console.warn('[WS] Persist agent message error:', err.message);
      });
    };

    this.queryEngine.setSender(sender);
    this.workflowRunner.setSender(sender);

    // 发送历史消息及状态给客户端
    await this.sendHistoryAndStatus();
  }

  /** 发送全部历史消息及工作流状态给客户端 */
  private async sendHistoryAndStatus() {
    const messages = await this.messageStore.getAll();
    if (messages.length > 0) {
      this.send({ type: 'chat.history', messages } as AgentMessage);
      console.log(`[WS] Sent ${messages.length} history messages to client`);
    }

    // 如果有正在运行的工作流，通知客户端恢复状态
    const runnerState = this.workflowRunner.getState?.();
    if (runnerState && (runnerState.status === 'running' || runnerState.status === 'paused')) {
      this.send({
        type: 'workflow.resumed',
        workflowId: runnerState.workflowId,
        status: runnerState.status,
        message: runnerState.status === 'paused' ? '工作流等待您的决策...' : '工作流正在执行中...',
        steps: runnerState.steps || [],
        currentStepIndex: runnerState.currentStepIndex || 0,
        percent: runnerState.percent || 0,
      } as AgentMessage);
    }
  }

  @OnWSMessage('message')
  async onMessage(rawData: WebSocket.Data) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(rawData));
    } catch {
      this.send({ type: 'error', message: '无效的 JSON 消息' });
      return;
    }

    try {
      switch (msg.type) {
        case 'ping':
          this.send({ type: 'pong' });
          break;

        case 'chat.history.request':
          await this.sendHistoryAndStatus();
          break;

        case 'chat.message':
          await this.handleChatMessage(msg.content, msg.workflowId);
          break;

        case 'decision.response':
          this.handleDecisionResponse(msg.decisionId, msg.choice, msg.data);
          break;

        case 'workflow.cancel':
          this.handleWorkflowCancel(msg.workflowId);
          break;

        default:
          this.send({ type: 'error', message: `未知消息类型: ${(msg as any).type}` });
      }
    } catch (error) {
      console.error('[WS] Message handling error:', error);
      this.send({ type: 'error', message: error.message });
    }
  }

  @OnWSDisConnection()
  async onDisconnection() {
    console.log('[WS] Client disconnected');
    // 不取消决策 — 允许客户端重连后继续响应
  }

  // ─── 消息处理 ─────────────────────────────────────────

  /** 处理聊天消息 */
  private async handleChatMessage(content: string, workflowId?: string) {
    // 追加用户消息
    this.conversationManager.addMessage(this.conversationId, {
      role: 'user',
      content,
    });

    // 检查是否有内嵌的工作流定义
    if (content.startsWith('__WORKFLOW__:')) {
      try {
        const workflow: WorkflowDefinition = JSON.parse(content.substring('__WORKFLOW__:'.length));
        // 持久化工作流推送消息
        await this.messageStore.append({
          id: `workflow-user-${Date.now()}`,
          role: 'user',
          content: `📋 推送工作流：${workflow.name || '未命名工作流'}`,
          timestamp: Date.now(),
          workflow: { workflowId: workflow.id, type: 'push' },
        });
        await this.executeWorkflow(workflow);
        return;
      } catch (e) {
        this.send({ type: 'error', message: '工作流解析失败: ' + e.message });
        return;
      }
    }

    // 持久化用户消息
    await this.messageStore.append({
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    });

    await this.historyStore.append({
      timestamp: Date.now(),
      type: 'chat',
      content,
    });

    // 加载相关记忆
    const memories = await this.memoryStore.search(content);
    const memoryContext = buildMemoryContext(
      memories.slice(0, 5).map(m => ({ name: m.name, content: m.content }))
    );

    // 构建系统提示
    const workspaceDir = process.env.WORKSPACE_DIR || '/workspace';
    const systemPrompt = buildBaseSystemPrompt(workspaceDir) + memoryContext;

    // 获取对话上下文
    const contextMessages = this.conversationManager.getContextMessages(this.conversationId);

    // 执行推理
    const result = await this.queryEngine.query({
      messages: contextMessages,
      tools: this.toolRegistry.getToolDefinitions(),
      systemPrompt,
    });

    // 追加 assistant 回复
    this.conversationManager.addMessage(this.conversationId, {
      role: 'assistant',
      content: result.finalAnswer,
    });

    // 发送完整文本（流式已在 QueryEngine 中通过 chat.chunk 发送）
    this.send({ type: 'chat.text', content: result.finalAnswer });
  }

  /** 执行工作流 */
  private async executeWorkflow(workflow: WorkflowDefinition) {
    const conv = this.conversationManager.getConversation(this.conversationId);
    if (conv) conv.workflowId = workflow.id;

    WorkflowController.updateStatus(workflow.id, 'running', this.workflowRunner);

    try {
      const state = await this.workflowRunner.execute(workflow);
      await this.historyStore.saveWorkflowRecord(workflow.id, state.toJSON());
      WorkflowController.updateStatus(workflow.id, state.status);
    } catch (error) {
      WorkflowController.updateStatus(workflow.id, 'failed');
      this.send({ type: 'workflow.failed', workflowId: workflow.id, error: error.message });
    }
  }

  /** 处理用户决策响应 */
  private handleDecisionResponse(decisionId: string, choice: string, data?: unknown) {
    const found = this.decisionGate.submitDecision(decisionId, choice, data);
    if (!found) {
      this.send({ type: 'error', message: `决策 ${decisionId} 不存在或已过期` });
    }
  }

  /** 取消工作流 */
  private handleWorkflowCancel(workflowId: string) {
    this.workflowRunner.cancel();
    WorkflowController.updateStatus(workflowId, 'cancelled');
  }

  // ─── 消息持久化 ────────────────────────────────────────

  /** 拦截 Agent 输出消息并持久化 */
  private async persistAgentMessage(msg: AgentMessage): Promise<void> {
    switch (msg.type) {
      // ─── 流式输出 ───────────────────────────────
      case 'chat.stream_start': {
        await this.messageStore.startStream(`assistant-stream-${Date.now()}`);
        break;
      }

      case 'chat.chunk': {
        const m = msg as { type: 'chat.chunk'; chunk: string };
        this.messageStore.appendChunk(m.chunk);
        break;
      }

      case 'chat.stream_end': {
        await this.messageStore.endStream();
        break;
      }

      // ─── 完整文本（流式已覆盖，跳过持久化，仅 flush）───
      case 'chat.text': {
        // 流式输出已经持久化了内容，chat.text 是重复的，跳过
        break;
      }

      // ─── 工具调用 ───────────────────────────────
      case 'tool.start': {
        const m = msg as { type: 'tool.start'; tool: string; args: Record<string, unknown> };
        await this.messageStore.append({
          id: `tool-start-${Date.now()}`,
          role: 'tool_call',
          content: '',
          timestamp: Date.now(),
          toolCall: { tool: m.tool, args: m.args },
        });
        break;
      }

      case 'tool.result': {
        const m = msg as { type: 'tool.result'; tool: string; result: any; timeMs: number };
        await this.messageStore.append({
          id: `tool-result-${Date.now()}`,
          role: 'tool_result',
          content: '',
          timestamp: Date.now(),
          toolResult: {
            tool: m.tool,
            result: m.result,
            timeMs: m.timeMs,
            success: m.result?.success ?? true,
          },
        });
        break;
      }

      // ─── 决策 ───────────────────────────────────
      case 'decision.required': {
        const m = msg as any;
        await this.messageStore.append({
          id: `decision-${m.decisionId}`,
          role: 'system',
          content: '',
          timestamp: Date.now(),
          decision: {
            decisionId: m.decisionId,
            question: m.question,
            options: m.options,
            context: m.context,
            responded: false,
          },
        });
        break;
      }

      // ─── 工作流事件 ─────────────────────────────
      case 'workflow.completed': {
        const m = msg as { type: 'workflow.completed'; workflowId: string; summary: string };
        await this.messageStore.append({
          id: `workflow-complete-${Date.now()}`,
          role: 'assistant',
          content: m.summary,
          timestamp: Date.now(),
          workflow: { workflowId: m.workflowId, type: 'completed' },
        });
        break;
      }

      case 'workflow.failed': {
        const m = msg as { type: 'workflow.failed'; workflowId: string; error: string };
        await this.messageStore.append({
          id: `workflow-failed-${Date.now()}`,
          role: 'assistant',
          content: `工作流执行失败: ${m.error}`,
          timestamp: Date.now(),
          workflow: { workflowId: m.workflowId, type: 'failed' },
        });
        break;
      }

      // ─── 工作流过程事件 ─────────────────────────
      case 'workflow.started': {
        const m = msg as { type: 'workflow.started'; workflowId: string; steps: Array<{ id: string; name: string; type: string }> };
        await this.messageStore.append({
          id: `workflow-started-${Date.now()}`,
          role: 'system',
          content: `🚀 工作流开始执行`,
          timestamp: Date.now(),
          workflow: {
            workflowId: m.workflowId,
            type: 'started',
            data: { steps: m.steps },
          },
        });
        break;
      }

      case 'workflow.step_start': {
        const m = msg as { type: 'workflow.step_start'; stepIndex: number; stepType: string; stepName: string };
        await this.messageStore.append({
          id: `workflow-step-start-${Date.now()}`,
          role: 'system',
          content: `📌 步骤 ${m.stepIndex + 1}: ${m.stepName}`,
          timestamp: Date.now(),
          workflow: {
            workflowId: '',
            type: 'step_start',
            data: { stepIndex: m.stepIndex, stepType: m.stepType, stepName: m.stepName },
          },
        });
        break;
      }

      case 'workflow.step_end': {
        const m = msg as { type: 'workflow.step_end'; stepIndex: number; result: any };
        await this.messageStore.append({
          id: `workflow-step-end-${Date.now()}`,
          role: 'system',
          content: `✅ 步骤 ${m.stepIndex + 1} 完成`,
          timestamp: Date.now(),
          workflow: {
            workflowId: '',
            type: 'step_end',
            data: { stepIndex: m.stepIndex, result: m.result },
          },
        });
        break;
      }

      case 'workflow.progress': {
        // 进度事件不持久化（高频，且步骤开始/结束已覆盖关键节点）
        break;
      }

      // ─── 文件事件 ───────────────────────────────
      case 'file.created': {
        const m = msg as { type: 'file.created'; path: string; size: number };
        await this.messageStore.append({
          id: `file-created-${Date.now()}`,
          role: 'system',
          content: `📄 新建文件: ${m.path}`,
          timestamp: Date.now(),
        });
        break;
      }

      case 'file.modified': {
        const m = msg as { type: 'file.modified'; path: string };
        await this.messageStore.append({
          id: `file-modified-${Date.now()}`,
          role: 'system',
          content: `✏️ 修改文件: ${m.path}`,
          timestamp: Date.now(),
        });
        break;
      }

      // 其他事件（pong 等）不存储
      default:
        break;
    }
  }

  // ─── 工具方法 ─────────────────────────────────────────

  private send(msg: AgentMessage): void {
    try {
      if (this.ctx.readyState === WebSocket.OPEN) {
        this.ctx.send(JSON.stringify(msg));
      }
    } catch (e) {
      console.error('[WS] Send failed:', e.message);
    }

    // 拦截并持久化所有 agent 输出消息
    this.persistAgentMessage(msg).catch(err => {
      console.warn('[WS] Persist agent message error:', err.message);
    });
  }
}
