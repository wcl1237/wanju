import { Controller, Get, Post, Del, Inject, Param, Body, Query } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { RedisService } from '@midwayjs/redis';
import { ChatAppService } from '../../application/chat.app-service';
import { ChatRequest } from '../../domain/ai/model/ai.model';

/** 工作流执行状态缓存 key */
const WF_STATUS_KEY = (id: string) => `wf:status:${id}`;
const WF_EVENTS_KEY = (id: string) => `wf:events:${id}`;
const WF_ABORT_KEY = (id: string) => `wf:abort:${id}`;

@Controller('/api/chat')
export class ChatController {
  @Inject()
  ctx: Context;

  @Inject()
  chatAppService: ChatAppService;

  @Inject()
  redisService: RedisService;

  @Post('/conversations')
  async createConversation(@Body() body?: { blueprintId?: string }) {
    const conversation = await this.chatAppService.createConversation(body?.blueprintId);
    return { success: true, data: conversation };
  }

  @Get('/conversations')
  async getConversations(@Query('blueprintId') blueprintId?: string) {
    const conversations = await this.chatAppService.getConversations(blueprintId);
    return { success: true, data: conversations };
  }

  @Get('/conversations/:id/messages')
  async getMessages(@Param('id') id: string) {
    const messages = await this.chatAppService.getMessages(id);
    return { success: true, data: messages };
  }

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

  @Get('/conversations/:id/wf-status')
  async getWorkflowStatus(@Param('id') id: string) {
    const status = await this.redisService.get(WF_STATUS_KEY(id));
    if (!status) {
      return { success: true, data: { running: false, events: [] } };
    }
    const events = await this.redisService.lrange(WF_EVENTS_KEY(id), 0, -1);
    await this.redisService.del(WF_EVENTS_KEY(id));
    return {
      success: true,
      data: {
        running: status === 'running',
        events: events.map(e => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean),
      },
    };
  }

  /**
   * 停止对话/工作流执行
   */
  @Post('/conversations/:id/stop')
  async stopGeneration(@Param('id') id: string) {
    await this.redisService.set(WF_ABORT_KEY(id), '1', 'EX', 600);
    await this.redisService.set(WF_STATUS_KEY(id), 'done', 'EX', 60);
    return { success: true };
  }

  /**
   * 发送消息（SSE 流式响应）
   */
  @Post('/conversations/:id/messages')
  async sendMessage(@Param('id') id: string, @Body() body: ChatRequest) {
    const { message } = body;
    const userId = this.ctx.state?.user?.userId;

    const { traceSteps, stream } = await this.chatAppService.sendMessage(id, message, userId);

    this.ctx.set('Content-Type', 'text/event-stream');
    this.ctx.set('Cache-Control', 'no-cache');
    this.ctx.set('Connection', 'keep-alive');
    this.ctx.set('X-Accel-Buffering', 'no');

    const { PassThrough } = require('stream');
    const sseStream = new PassThrough();
    this.ctx.body = sseStream;

    for (const step of traceSteps) {
      sseStream.write(`data: ${JSON.stringify(step)}\n\n`);
    }

    // 标记执行中 + 清除旧 abort 信号
    await this.redisService.set(WF_STATUS_KEY(id), 'running', 'EX', 600);
    await this.redisService.del(WF_EVENTS_KEY(id));
    await this.redisService.del(WF_ABORT_KEY(id));

    // SSE 连接状态
    let sseAlive = true;
    sseStream.on('close', () => { sseAlive = false; });
    sseStream.on('error', () => { sseAlive = false; });

    const safeSend = (data: string) => {
      if (sseAlive) {
        try { sseStream.write(data); } catch { sseAlive = false; }
      }
      this.redisService.rpush(WF_EVENTS_KEY(id), data.replace(/^data: /, '').replace(/\n\n$/, '')).catch(() => {});
      this.redisService.expire(WF_EVENTS_KEY(id), 600).catch(() => {});
    };

    // 后台执行
    (async () => {
      // 流式 content_chunk 累积器
      let chunkBuffer = '';
      let chunkBubbleStarted = false;

      try {
        for await (const chunk of stream) {
          // 检查 abort 信号
          const aborted = await this.redisService.get(WF_ABORT_KEY(id));
          if (aborted) {
            console.log(`[Chat] ⛔ 用户终止执行: ${id}`);
            // 保存已累积的流式内容
            if (chunkBuffer) {
              await this.chatAppService.saveAssistantMessage(id, chunkBuffer);
            }
            break;
          }

          const dataMatch = chunk.match(/^data: (.+)$/m);
          if (!dataMatch) { safeSend(chunk); continue; }

          let data: any;
          try { data = JSON.parse(dataMatch[1]); } catch { safeSend(chunk); continue; }

          if (data.type === 'content' && data.content) {
            // 完整 content — 实时存 DB 为独立消息
            // 如果之前有流式累积，先保存
            if (chunkBuffer) {
              await this.chatAppService.saveAssistantMessage(id, chunkBuffer);
              chunkBuffer = '';
              chunkBubbleStarted = false;
            }
            const msgId = await this.chatAppService.saveAssistantMessage(id, data.content);
            safeSend(chunk);
            if (msgId) {
              safeSend(`data: ${JSON.stringify({ type: 'content_saved', messageId: msgId, content: data.content })}\n\n`);
            }
          } else if (data.type === 'content_chunk' && data.chunk) {
            // 流式 chunk — 前端追加到当前气泡
            chunkBuffer += data.chunk;

            if (!chunkBubbleStarted) {
              // 第一个 chunk：发一个 content_stream_start 信号
              safeSend(`data: ${JSON.stringify({ type: 'content_stream_start' })}\n\n`);
              chunkBubbleStarted = true;
            }
            // 发送 chunk 给前端
            safeSend(`data: ${JSON.stringify({ type: 'content_chunk', chunk: data.chunk })}\n\n`);
          } else {
            safeSend(chunk);

            // 如果遇到非 chunk 事件且有累积内容，保存并结束流式气泡
            if (chunkBuffer && data.type !== 'content_chunk') {
              const msgId = await this.chatAppService.saveAssistantMessage(id, chunkBuffer);
              if (msgId) {
                safeSend(`data: ${JSON.stringify({ type: 'content_stream_end', messageId: msgId, content: chunkBuffer })}\n\n`);
              }
              chunkBuffer = '';
              chunkBubbleStarted = false;
            }
          }

          this.collectTraceStep(chunk, traceSteps);
        }

        // 流结束后如果还有未保存的 chunk 内容
        if (chunkBuffer) {
          const msgId = await this.chatAppService.saveAssistantMessage(id, chunkBuffer);
          if (msgId) {
            safeSend(`data: ${JSON.stringify({ type: 'content_stream_end', messageId: msgId, content: chunkBuffer })}\n\n`);
          }
        }

        await this.chatAppService.saveTraceSteps(id, traceSteps);
        await this.chatAppService.postProcess(id, userId);
      } catch (error) {
        // 保存累积内容
        if (chunkBuffer) {
          await this.chatAppService.saveAssistantMessage(id, chunkBuffer).catch(() => {});
        }
        safeSend(`data: ${JSON.stringify({ type: 'error', content: '抱歉，AI 服务暂时不可用，请稍后重试。' })}\n\n`);
      } finally {
        await this.redisService.set(WF_STATUS_KEY(id), 'done', 'EX', 60);
        await this.redisService.del(WF_ABORT_KEY(id));
        safeSend(`data: ${JSON.stringify({ type: 'workflow_complete' })}\n\n`);
        if (sseAlive) {
          try { sseStream.end(); } catch { /* ignore */ }
        }
      }
    })();
  }

  @Del('/conversations/:id')
  async deleteConversation(@Param('id') id: string) {
    await this.chatAppService.deleteConversation(id);
    return { success: true };
  }

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
