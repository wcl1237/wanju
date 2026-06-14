import { Controller, Post, Body, Inject } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { UserService } from '../../domain/auth/service/user.service';

@Controller('/api/auth')
export class AuthController {
  @Inject()
  ctx: Context;

  @Inject()
  userService: UserService;

  @Post('/register')
  async register(@Body() body: { username: string; password: string }) {
    if (!body.username?.trim() || !body.password?.trim()) {
      return { success: false, message: '用户名和密码不能为空' };
    }
    if (body.password.length < 6) {
      return { success: false, message: '密码长度至少6位' };
    }
    try {
      const user = await this.userService.register(body.username.trim(), body.password);
      return { success: true, data: user };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  @Post('/login')
  async login(@Body() body: { username: string; password: string }) {
    if (!body.username?.trim() || !body.password?.trim()) {
      return { success: false, message: '用户名和密码不能为空' };
    }
    try {
      const result = await this.userService.login(body.username.trim(), body.password);
      this.ctx.cookies.set('token', result.token, {
        httpOnly: true, sameSite: 'lax',
        maxAge: 7 * 24 * 3600 * 1000, path: '/',
      });
      return { success: true, data: result };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  @Post('/logout')
  async logout() {
    this.ctx.cookies.set('token', '', { httpOnly: true, maxAge: 0, path: '/' });
    return { success: true };
  }
}
