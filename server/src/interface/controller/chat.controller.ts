import { Controller, Get, Post, Del, Inject, Param, Body, Query } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { RedisService } from '@midwayjs/redis';
import { ChatAppService } from '../../application/chat.app-service';
import { ChatRequest } from '../../domain/ai/model/ai.model';

/** 工作流执行状态缓存 key */
const WF_STATUS_KEY = (id: string) => `wf:status:${id}`;
const WF_EVENTS_KEY = (id: string) => `wf:events:${id}`;

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
   * 查询工作流执行状态
   */
  @Get('/conversations/:id/wf-status')
  async getWorkflowStatus(@Param('id') id: string) {
    const status = await this.redisService.get(WF_STATUS_KEY(id));
    if (!status) {
      return { success: true, data: { running: false, events: [] } };
    }
    // 获取自上次查询以来新增的事件
    const events = await this.redisService.lrange(WF_EVENTS_KEY(id), 0, -1);
    // 消费后清空事件队列
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

    // 3. 标记工作流执行中
    await this.redisService.set(WF_STATUS_KEY(id), 'running', 'EX', 600);
    await this.redisService.del(WF_EVENTS_KEY(id));

    // 追踪 SSE 连接是否存活
    let sseAlive = true;
    sseStream.on('close', () => { sseAlive = false; });
    sseStream.on('error', () => { sseAlive = false; });

    // 安全写入 SSE — 如果连接断开就缓存到 Redis
    const safeSend = (data: string) => {
      if (sseAlive) {
        try { sseStream.write(data); } catch { sseAlive = false; }
      }
      // 同时缓存到 Redis（供断线重连查询）
      this.redisService.rpush(WF_EVENTS_KEY(id), data.replace(/^data: /, '').replace(/\n\n$/, '')).catch(() => {});
      this.redisService.expire(WF_EVENTS_KEY(id), 600).catch(() => {});
    };

    // 4. 后台执行 — 即使 SSE 断开也继续
    (async () => {
      try {
        for await (const chunk of stream) {
          // 解析事件
          const dataMatch = chunk.match(/^data: (.+)$/m);
          if (!dataMatch) {
            safeSend(chunk);
            continue;
          }

          let data: any;
          try { data = JSON.parse(dataMatch[1]); } catch { safeSend(chunk); continue; }

          // content 事件 → 实时存储为独立 assistant 消息
          if (data.type === 'content' && data.content) {
            const msgId = await this.chatAppService.saveAssistantMessage(id, data.content);
            // 先发原始 content 事件
            safeSend(chunk);
            // 再发 content_saved 事件告知前端真实消息 ID
            if (msgId) {
              safeSend(`data: ${JSON.stringify({ type: 'content_saved', messageId: msgId, content: data.content })}\n\n`);
            }
          } else {
            safeSend(chunk);
          }

          // 收集 trace
          this.collectTraceStep(chunk, traceSteps);
        }

        // 保存 trace（不再保存 fullContent，已逐条存储）
        await this.chatAppService.saveTraceSteps(id, traceSteps);
        await this.chatAppService.postProcess(id, userId);
      } catch (error) {
        const errEvent = `data: ${JSON.stringify({ type: 'error', content: '抱歉，AI 服务暂时不可用，请稍后重试。' })}\n\n`;
        safeSend(errEvent);
      } finally {
        // 标记执行完成
        await this.redisService.set(WF_STATUS_KEY(id), 'done', 'EX', 60);
        // 发送完成事件
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

  // ==================== 工具方法 ====================

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
