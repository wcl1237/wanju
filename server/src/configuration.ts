import { Configuration, App } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import * as validate from '@midwayjs/validate';
import * as info from '@midwayjs/info';
import * as staticFile from '@midwayjs/static-file';
import * as swagger from '@midwayjs/swagger';
import * as orm from '@midwayjs/typeorm';
import * as redis from '@midwayjs/redis';
import * as ws from '@midwayjs/ws';
import { join } from 'path';
import * as dotenv from 'dotenv';
import { AuthMiddleware } from './interface/middleware/auth.middleware';
import { OpenClawService } from './domain/openclaw/service/openclaw.service';

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env') });

@Configuration({
  imports: [
    koa,
    validate,
    info,
    staticFile,
    swagger,
    orm,
    redis,
    ws,
  ],
  importConfigs: [join(__dirname, './config')],
})
export class MainConfiguration {
  @App('koa')
  app: koa.Application;

  async onReady() {
    // CORS
    this.app.useMiddleware([
      async (ctx, next) => {
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
        ctx.set('Access-Control-Allow-Credentials', 'true');

        if (ctx.method === 'OPTIONS') {
          ctx.status = 204;
          return;
        }
        await next();
      },
    ]);

    // JWT 鉴权中间件
    this.app.useMiddleware([AuthMiddleware]);

    // 启动云龙虾容器清理定时器
    const containerContext = this.app.getApplicationContext();
    const openClawService = await containerContext.getAsync(OpenClawService);
    openClawService.startCleanupTask();
  }

  async onStop() {
    try {
      const containerContext = this.app.getApplicationContext();
      const openClawService = await containerContext.getAsync(OpenClawService);
      openClawService.stopCleanupTask();
    } catch (err) {
      // ignore
    }
  }
}
