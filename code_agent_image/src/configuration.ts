import { Configuration, App } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import * as validate from '@midwayjs/validate';
import * as info from '@midwayjs/info';
import * as ws from '@midwayjs/ws';
import { join } from 'path';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env') });

@Configuration({
  imports: [
    koa,
    validate,
    info,
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
        ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
        ctx.set('Access-Control-Allow-Credentials', 'true');

        if (ctx.method === 'OPTIONS') {
          ctx.status = 204;
          return;
        }
        await next();
      },
    ]);

    console.log('[CodeAgent] Server is ready.');
  }
}
