/**
 * Code Agent Controller — 容器生命周期管理 + 消息代理
 *
 * 消息查询通过 HTTP 代理到容器获取（容器是对话数据的唯一数据源）。
 */
import { Controller, Get, Post, Inject, Body, Query } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { CodeAgentService } from '../../domain/code-agent/service/code-agent.service';

@Controller('/api/code-agent')
export class CodeAgentController {
  @Inject()
  ctx: Context;

  @Inject()
  codeAgentService: CodeAgentService;

  /** 启动 Code Agent 容器 */
  @Post('/start')
  async start() {
    const userId = this.ctx.state?.user?.userId || 'anonymous';
    try {
      const session = await this.codeAgentService.startSession(userId);
      return { success: true, data: session };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /** 停止 Code Agent 容器 */
  @Post('/stop')
  async stop(@Body() body: { sessionId: string }) {
    try {
      await this.codeAgentService.stopSession(body.sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /** 销毁 Code Agent 容器及数据 */
  @Post('/destroy')
  async destroy(@Body() body: { sessionId: string }) {
    try {
      await this.codeAgentService.destroySession(body.sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /** 查询用户 Code Agent 状态 */
  @Get('/status')
  async status() {
    const userId = this.ctx.state?.user?.userId || 'anonymous';
    try {
      const session = await this.codeAgentService.getActiveSession(userId);
      return { success: true, data: session };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /** 推送工作流 */
  @Post('/workflow/push')
  async pushWorkflow(@Body() body: { sessionId: string; workflow: Record<string, unknown> }) {
    try {
      const result = await this.codeAgentService.pushWorkflow(body.sessionId, body.workflow);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ─── 消息查询（代理到容器） ───────────────────────

  /**
   * 获取会话消息历史
   * 从容器内 MessageStore 获取（容器是对话数据的唯一数据源）
   */
  @Get('/messages')
  async getMessages(@Query('sessionId') sessionId: string) {
    try {
      const session = await this.codeAgentService.sessionRepository.findOne({
        where: { id: sessionId },
      });
      if (!session || session.status !== 'running') {
        return { success: false, message: '会话不存在或未运行' };
      }

      // HTTP 代理到容器 REST API
      const localNodeIp = (this.codeAgentService as any).nodeIp || '127.0.0.1';
      const targetIp = (session.nodeIp === localNodeIp) ? '127.0.0.1' : (session.nodeIp || '127.0.0.1');
      const url = `http://${targetIp}:${session.hostPort}/api/messages`;

      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return await res.json();
    } catch (error) {
      return { success: false, message: `容器通信失败: ${error.message}` };
    }
  }
}

