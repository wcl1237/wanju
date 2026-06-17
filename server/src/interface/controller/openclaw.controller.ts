import { Controller, Post, Get, Inject, Body } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { OpenClawService } from '../../domain/openclaw/service/openclaw.service';

@Controller('/api/openclaw')
export class OpenClawController {
  @Inject()
  ctx: Context;

  @Inject()
  openClawService: OpenClawService;

  @Post('/start')
  async start() {
    const userId = this.ctx.state.user?.userId;
    if (!userId) {
      return { success: false, message: '用户未登录' };
    }

    try {
      const session = await this.openClawService.startSession(userId);
      return { success: true, data: session };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Post('/stop')
  async stop(@Body() body: { sessionId: string }) {
    if (!body.sessionId) {
      return { success: false, message: '缺少 sessionId' };
    }

    try {
      await this.openClawService.stopSession(body.sessionId);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Post('/destroy')
  async destroy(@Body() body: { sessionId: string }) {
    if (!body.sessionId) {
      return { success: false, message: '缺少 sessionId' };
    }

    try {
      await this.openClawService.destroySession(body.sessionId);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('/status')
  async getStatus() {
    const userId = this.ctx.state.user?.userId;
    if (!userId) {
      return { success: false, message: '用户未登录' };
    }

    try {
      const session = await this.openClawService.sessionRepository.findOne({
        where: [
          { userId, status: 'running' },
          { userId, status: 'starting' },
        ],
        order: { createdAt: 'DESC' }
      });
      return { success: true, data: session || null };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}
