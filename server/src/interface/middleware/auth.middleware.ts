import { Middleware, IMiddleware, Inject } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { UserService } from '../../domain/auth/service/user.service';

/**
 * JWT 鉴权中间件
 * 优先从 cookie 读取 token，其次从 Authorization header 读取
 */
@Middleware()
export class AuthMiddleware implements IMiddleware<Context, NextFunction> {
  @Inject()
  userService: UserService;

  private whitelist = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/logout',
  ];

  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      const path = ctx.path;

      if (!path.startsWith('/api/')) {
        return next();
      }

      if (this.whitelist.some(p => path === p)) {
        return next();
      }

      let token = ctx.cookies.get('token');

      if (!token) {
        const authHeader = ctx.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.slice(7);
        }
      }

      if (!token) {
        ctx.status = 401;
        ctx.body = { success: false, message: '未登录，请先登录' };
        return;
      }

      try {
        const payload = this.userService.verifyToken(token);
        ctx.state.user = payload;
      } catch {
        ctx.status = 401;
        ctx.body = { success: false, message: 'Token 无效或已过期，请重新登录' };
        return;
      }

      return next();
    };
  }

  static getName(): string {
    return 'auth';
  }
}
