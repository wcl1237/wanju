import { Controller, Get, Post, Del, Inject, Param, Body, Query } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ChatAppService } from '../../application/chat.app-service';
import { ChatRequest } from '../../domain/ai/model/ai.model';

@Controller('/api/chat')
export class ChatController {
  @Inject()
  ctx: Context;

  @Inject()
  chatAppService: ChatAppService;

  @Post('/conversations')
  async createConversation() {
    const conversation = await this.chatAppService.createConversation();
    return { success: true, data: conversation };
  }

  @Get('/conversations')
  async getConversations() {
    const conversations = await this.chatAppService.getConversations();
    return { success: true, data: conversations };
  }

  @Get('/conversations/:id/messages')
  async getMessages(@Param('id') id: string) {
    const messages = await this.chatAppService.getMessages(id);
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
    const result = await this.chatAppService.getHistory(
      id, parseInt(page || '1'), parseInt(pageSize || '20')
    );
    return { success: true, data: result };
  }

  /**
   * 发送消息（SSE 流式响应）— 使用 ChatAppService 编排
   */
  @Post('/conversations/:id/messages')
  async sendMessage(@Param('id') id: string, @Body() body: ChatRequest) {
    const { message } = body;
    const userId = this.ctx.state?.user?.userId;

    // 1. 编排对话流程
    const { traceSteps, stream } = await this.chatAppService.sendMessage(id, message, userId);

    // 2. 设置 SSE 响应
    this.ctx.set('Content-Type', 'text/event-stream');
    this.ctx.set('Cache-Control', 'no-cache');
    this.ctx.set('Connection', 'keep-alive');
    this.ctx.set('X-Accel-Buffering', 'no');

    const { PassThrough } = require('stream');
    const sseStream = new PassThrough();
    this.ctx.body = sseStream;

    // 发送预处理阶段的轨迹事件
    for (const step of traceSteps) {
      sseStream.write(`data: ${JSON.stringify(step)}\n\n`);
    }

    // 3. 异步生成 AI 回复
    (async () => {
      let fullContent = '';
      try {
        for await (const chunk of stream) {
          sseStream.write(chunk);
          this.collectTraceStep(chunk, traceSteps);
          const content = this.extractContent(chunk);
          if (content) fullContent += content;
        }

        await this.chatAppService.saveAssistantMessage(id, fullContent);
        await this.chatAppService.saveTraceSteps(id, traceSteps);
        await this.chatAppService.postProcess(id, userId);
      } catch (error) {
        sseStream.write(`data: ${JSON.stringify({ type: 'error', content: '抱歉，AI 服务暂时不可用，请稍后重试。' })}\n\n`);
        sseStream.write('data: [DONE]\n\n');
      } finally {
        sseStream.end();
      }
    })();
  }

  @Del('/conversations/:id')
  async deleteConversation(@Param('id') id: string) {
    await this.chatAppService.deleteConversation(id);
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
