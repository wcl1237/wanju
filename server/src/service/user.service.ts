import { Provide, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UserEntity } from '../entity/user.entity';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

export interface UserInfo {
  id: string;
  username: string;
  createdAt: string;
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class UserService {
  @InjectEntityModel(UserEntity)
  userRepo: Repository<UserEntity>;

  @Config('jwt')
  jwtConfig: { secret: string; expiresIn: string };

  async register(username: string, password: string): Promise<UserInfo> {
    const existing = await this.userRepo.findOneBy({ username });
    if (existing) {
      throw new Error('用户名已存在');
    }

    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    await this.userRepo.save({ id, username, password: hashedPassword, createdAt });
    return { id, username, createdAt };
  }

  async login(username: string, password: string): Promise<{ token: string; user: UserInfo }> {
    const user = await this.userRepo.findOneBy({ username });
    if (!user) throw new Error('用户名或密码错误');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new Error('用户名或密码错误');

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      this.jwtConfig.secret,
      { expiresIn: this.jwtConfig.expiresIn as any }
    );

    return {
      token,
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
    };
  }

  verifyToken(token: string): { userId: string; username: string } {
    try {
      return jwt.verify(token, this.jwtConfig.secret) as any;
    } catch {
      throw new Error('Token 无效或已过期');
    }
  }
}
