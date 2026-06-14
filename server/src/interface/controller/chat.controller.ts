import { Controller, Get, Post, Del, Inject, Param, Body, Query } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ChatService } from '../../domain/chat/service/chat.service';
import { ReactAgentService } from '../../domain/ai/service/react-agent.service';
import { MemoryManagerService } from '../../domain/chat/service/memory-manager.service';
import { ChatRequest, AIMessage } from '../../domain/ai/model/ai.model';

@Controller('/api/chat')
export class ChatController {
  @Inject()
  ctx: Context;

  @Inject()
  chatService: ChatService;

  @Inject()
  aiService: ReactAgentService;

  @Inject()
  memoryManager: MemoryManagerService;

  @Post('/conversations')
  async createConversation() {
    const conversation = await this.chatService.createConversation();
    return { success: true, data: conversation };
  }

  @Get('/conversations')
  async getConversations() {
    const conversations = await this.chatService.getConversations();
    return { success: true, data: conversations };
  }

  @Get('/conversations/:id/messages')
  async getMessages(@Param('id') id: string) {
    const messages = await this.chatService.getMessages(id);
    return { success: true, data: messages };
  }

  /**
   * 分页获取历史消息 (加载更多)
   */
  @Get('/conversations/:id/history')
  async getHistory(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    const result = await this.memoryManager.getHistory(
      id, parseInt(page || '1'), parseInt(pageSize || '20')
    );
    return { success: true, data: result };
  }

  /**
   * 发送消息（SSE 流式响应）— 使用 MemoryManager 管理上下文
   *
   * 重构: 从 ~180 行精简为 ~80 行，trace 收集和 SSE 管理更清晰
   */
  @Post('/conversations/:id/messages')
  async sendMessage(@Param('id') id: string, @Body() body: ChatRequest) {
    const { message } = body;
    const userId = this.ctx.state?.user?.userId;
    const traceSteps: any[] = [];

    // 1. 初始化对话 + 保存用户消息
    const initStart = Date.now();
    await this.memoryManager.initConversation(id);
    traceSteps.push({ type: 'memory_init', timeMs: Date.now() - initStart, ts: Date.now() });

    const addStart = Date.now();
    await this.memoryManager.addMessage(id, 'user', message);
    traceSteps.push({ type: 'message_save', timeMs: Date.now() - addStart, ts: Date.now() });

    // 2. 获取 AI 上下文
    const ctxStart = Date.now();
    const { messages: aiContext, meta: memoryMeta } = await this.memoryManager.getAIContext(id, userId);
    traceSteps.push({ type: 'memory_load', timeMs: Date.now() - ctxStart, meta: memoryMeta, ts: Date.now() });

    // 3. 设置 SSE 响应
    this.ctx.set('Content-Type', 'text/event-stream');
    this.ctx.set('Cache-Control', 'no-cache');
    this.ctx.set('Connection', 'keep-alive');
    this.ctx.set('X-Accel-Buffering', 'no');

    const { PassThrough } = require('stream');
    const stream = new PassThrough();
    this.ctx.body = stream;

    // 发送预处理阶段的轨迹事件
    for (const step of traceSteps) {
      stream.write(`data: ${JSON.stringify(step)}\n\n`);
    }

    // 4. 异步生成 AI 回复
    (async () => {
      let fullContent = '';
      try {
        for await (const chunk of this.aiService.chatStream(aiContext, id, userId)) {
          stream.write(chunk);
          this.collectTraceStep(chunk, traceSteps);
          const content = this.extractContent(chunk);
          if (content) fullContent += content;
        }

        if (fullContent) {
          await this.memoryManager.addMessage(id, 'assistant', fullContent);
        }

        if (traceSteps.length > 0) {
          await this.chatService.saveTraceSteps(id, 'assistant', traceSteps);
        }

        await this.memoryManager.checkAndSummarize(id);

        if (userId) {
          this.memoryManager.extractLongTermMemory(userId, id).catch(e => {
            console.error('[ChatController] 长期记忆提取失败:', e.message);
          });
        }
      } catch (error) {
        stream.write(`data: ${JSON.stringify({ type: 'error', content: '抱歉，AI 服务暂时不可用，请稍后重试。' })}\n\n`);
        stream.write('data: [DONE]\n\n');
      } finally {
        stream.end();
      }
    })();
  }

  @Del('/conversations/:id')
  async deleteConversation(@Param('id') id: string) {
    await this.chatService.deleteConversation(id);
    return { success: true };
  }

  // ==================== 工具方法 ====================

  /** 从 SSE 事件中提取 content */
  private extractContent(chunk: string): string | null {
    try {
      const dataMatch = chunk.match(/^data: (.+)$/m);
      if (dataMatch) {
        const data = JSON.parse(dataMatch[1]);
        if (data.type === 'content') return data.content;
      }
    } catch { /* ignore */ }
    return null;
  }

  /** 收集 trace 事件 */
  private collectTraceStep(chunk: string, traceSteps: any[]): void {
    try {
      const dataMatch = chunk.match(/^data: (.+)$/m);
      if (!dataMatch) return;
      const data = JSON.parse(dataMatch[1]);

      const traceTypes = [
        'skill_match', 'thinking_end', 'tool_start', 'tool_result',
        'workflow_match', 'workflow_start', 'workflow_step',
        'workflow_llm', 'workflow_output', 'workflow_end',
      ];

      if (traceTypes.includes(data.type)) {
        traceSteps.push({ ...data, ts: Date.now() });
      }
    } catch { /* ignore */ }
  }
}
