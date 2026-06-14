import { Controller, Get, Post, Del, Inject, Param, Body, Query } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ChatService } from '../service/chat.service';
import { AIService } from '../service/ai.service';
import { MemoryManagerService } from '../service/memory-manager.service';
import { ChatRequest, AIMessage } from '../interface';

@Controller('/api/chat')
export class ChatController {
  @Inject()
  ctx: Context;

  @Inject()
  chatService: ChatService;

  @Inject()
  aiService: AIService;

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
      id,
      parseInt(page || '1'),
      parseInt(pageSize || '20')
    );
    return { success: true, data: result };
  }

  /**
   * 发送消息（SSE 流式响应）— 使用 MemoryManager 管理上下文
   */
  @Post('/conversations/:id/messages')
  async sendMessage(@Param('id') id: string, @Body() body: ChatRequest) {
    const { message } = body;
    const userId = this.ctx.state?.user?.userId;
    const traceSteps: any[] = []; // 收集轨迹事件

    // 1. 初始化对话 (确保 Redis 有缓存)
    const initStart = Date.now();
    await this.memoryManager.initConversation(id);
    const initMs = Date.now() - initStart;
    console.log(`[Trace] 📦 初始化对话 (${initMs}ms)`);
    traceSteps.push({ type: 'memory_init', timeMs: initMs, ts: Date.now() });

    // 2. 通过 MemoryManager 添加用户消息 (DB + Redis 双写)
    const addStart = Date.now();
    await this.memoryManager.addMessage(id, 'user', message);
    const addMs = Date.now() - addStart;
    console.log(`[Trace] 💬 保存用户会话 (${addMs}ms)`);
    traceSteps.push({ type: 'message_save', timeMs: addMs, ts: Date.now() });

    // 3. 获取 AI 上下文 (摘要 + 短期记忆 + 长期记忆)
    const ctxStart = Date.now();
    const { messages: aiContext, meta: memoryMeta } = await this.memoryManager.getAIContext(id, userId);
    const ctxMs = Date.now() - ctxStart;
    console.log(`[Trace] 🧠 记忆加载 (${ctxMs}ms) summary=${memoryMeta.hasSummary} short=${memoryMeta.shortTermCount} long=${memoryMeta.longTermCount} profile=${memoryMeta.profileCount}`);
    traceSteps.push({
      type: 'memory_load',
      timeMs: ctxMs,
      meta: memoryMeta,
      ts: Date.now(),
    });

    // 4. 设置 SSE 响应头
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

    // 5. 异步生成 AI 回复
    (async () => {
      let fullContent = '';
      try {
        for await (const chunk of this.aiService.chatStream(aiContext, id, userId)) {
          stream.write(chunk);
          try {
            const dataMatch = chunk.match(/^data: (.+)$/m);
            if (dataMatch) {
              const data = JSON.parse(dataMatch[1]);
              if (data.type === 'content') {
                fullContent += data.content;
              } else if (data.type === 'skill_match') {
                traceSteps.push({
                  type: 'skill_match',
                  skills: data.skills,
                  ts: Date.now(),
                });
              } else if (data.type === 'thinking_end') {
                traceSteps.push({
                  type: 'thinking_end',
                  round: data.round,
                  content: data.content,
                  timeMs: data.timeMs,
                  ts: Date.now(),
                });
              } else if (data.type === 'tool_start') {
                traceSteps.push({
                  type: 'tool_start',
                  tool: data.tool,
                  args: data.args,
                  ts: Date.now(),
                });
              } else if (data.type === 'tool_result') {
                traceSteps.push({
                  type: 'tool_result',
                  tool: data.tool,
                  result: data.result,
                  timeMs: data.timeMs,
                  ts: Date.now(),
                });
              } else if (data.type === 'workflow_match') {
                traceSteps.push({
                  type: 'workflow_match',
                  workflowId: data.workflowId,
                  workflowName: data.workflowName,
                  workflowIcon: data.workflowIcon,
                  workflowMode: data.workflowMode,
                  timeMs: data.timeMs,
                  ts: Date.now(),
                });
              } else if (data.type === 'workflow_start') {
                traceSteps.push({
                  type: 'workflow_start',
                  workflowName: data.workflowName,
                  stepCount: data.stepCount,
                  ts: Date.now(),
                });
              } else if (data.type === 'workflow_step') {
                traceSteps.push({
                  type: 'workflow_step',
                  stepIndex: data.stepIndex,
                  nodeId: data.nodeId,
                  stepType: data.stepType,
                  stepName: data.stepName,
                  input: data.input,
                  params: data.params,
                  result: data.result,
                  output: data.output,
                  conditionResult: data.conditionResult,
                  error: data.error,
                  timeMs: data.timeMs,
                  ts: Date.now(),
                });
              } else if (data.type === 'workflow_llm') {
                traceSteps.push({
                  type: 'workflow_llm',
                  stage: data.stage,
                  nodeId: data.nodeId,
                  purpose: data.purpose,
                  input: data.input,
                  timeMs: data.timeMs,
                  ts: Date.now(),
                });
              } else if (data.type === 'workflow_output') {
                traceSteps.push({
                  type: 'workflow_output',
                  content: data.content,
                  mode: data.mode,
                  ts: Date.now(),
                });
              } else if (data.type === 'workflow_end') {
                traceSteps.push({
                  type: 'workflow_end',
                  workflowName: data.workflowName,
                  totalSteps: data.totalSteps,
                  totalTimeMs: data.totalTimeMs,
                  ts: Date.now(),
                });
              }
            }
          } catch { }
        }

        // 6. 保存 AI 回复 (DB + Redis 双写)
        if (fullContent) {
          await this.memoryManager.addMessage(id, 'assistant', fullContent);
        }

        // 6.5 保存轨迹数据
        if (traceSteps.length > 0) {
          await this.chatService.saveTraceSteps(id, 'assistant', traceSteps);
        }

        // 7. 检查是否需要摘要压缩
        await this.memoryManager.checkAndSummarize(id);

        // 8. 异步提取长期记忆 (不阻塞响应)
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
}
