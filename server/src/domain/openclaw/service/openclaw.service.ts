import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { OpenClawSessionEntity } from '../entity/openclaw-session.entity';
import Docker from 'dockerode';
import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

@Provide()
@Scope(ScopeEnum.Singleton) // 使用单例模式以保证内部定时清理任务状态正确
export class OpenClawService {
  @InjectEntityModel(OpenClawSessionEntity)
  sessionRepository: Repository<OpenClawSessionEntity>;

  private docker: Docker;
  private imageName = process.env.OPENCLAW_IMAGE || 'openclaw:latest';
  private containerInnerPort = 18789; // OpenClaw 默认服务监听 18789 端口
  private cleanupInterval: NodeJS.Timeout | null = null;
  private nodeIp: string;
  private sharedDataDir = process.env.OPENCLAW_SHARED_DATA_DIR || '/mnt/openclaw/data';

  constructor() {
    const socketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
    this.docker = new Docker({ socketPath });
    this.nodeIp = process.env.NODE_IP || this.getLocalIp();
  }

  // 启动清理定时器
  public startCleanupTask() {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanIdleContainers();
      } catch (err) {
        console.error('Error during openclaw idle container cleanup:', err);
      }
    }, 60000); // 每分钟执行一次清理
  }

  // 停止清理定时器
  public stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 启动云龙虾容器会话
   */
  async startSession(userId: string): Promise<OpenClawSessionEntity> {
    // 1. 查找该用户是否已有运行中或启动中的容器，如果有则复用
    const existingSession = await this.sessionRepository.findOne({
      where: [
        { userId, status: 'running' },
        { userId, status: 'starting' },
      ],
    });

    if (existingSession) {
      // 确认容器确实在运行
      const containerIsAlive = await this.checkContainerAlive(existingSession.containerId);
      if (containerIsAlive) {
        // 更新最后活跃时间和节点IP（以防节点发生漂移）
        existingSession.lastActiveAt = Date.now();
        existingSession.nodeIp = this.nodeIp;
        await this.sessionRepository.save(existingSession);
        return existingSession;
      } else {
        // 容器已不在，将其状态设为 stopped
        existingSession.status = 'stopped';
        await this.sessionRepository.save(existingSession);
      }
    }

    // 2. 创建新会话
    const sessionId = uuidv4();
    const session = new OpenClawSessionEntity();
    session.id = sessionId;
    session.userId = userId;
    session.status = 'starting';
    session.nodeIp = this.nodeIp;
    session.createdAt = Date.now();
    session.lastActiveAt = Date.now();

    await this.sessionRepository.save(session);

    let hostPort: number;
    let container: Docker.Container;

    try {
      // 3. 获取宿主机空闲端口
      hostPort = await this.findFreePort();
      session.hostPort = hostPort;
      await this.sessionRepository.save(session);

      // 4. 调用 Docker API 创建容器
      const containerName = `openclaw-user-${userId}-${Date.now()}`;
      
      // 确保镜像存在（本地若无则自动拉取）
      await this.ensureImageExists(this.imageName);

      // 自动为用户创建 openclaw.json 配置文件，避免 onboarding 交互阻碍启动
      const userDir = join(this.sharedDataDir, `user_${userId}`);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
      const configPath = join(userDir, 'openclaw.json');
      if (!fs.existsSync(configPath)) {
        const modelName = process.env.AI_MODEL || 'qwen3.7-plus';
        const apiKey = process.env.AI_API_KEY || '';
        const apiBase = process.env.AI_API_BASE || '';
        const defaultConfig = {
          gateway: {
            mode: 'local',
            controlUi: {
              dangerouslyDisableDeviceAuth: true,
              allowInsecureAuth: true,
              dangerouslyAllowHostHeaderOriginFallback: true,
              allowedOrigins: [
                'http://localhost:5173',
                'http://127.0.0.1:5173',
                'http://localhost:7001',
                'http://127.0.0.1:7001'
              ]
            },
          },
          models: {
            providers: {
              openai: {
                baseUrl: apiBase,
                apiKey: apiKey,
                request: {
                  allowPrivateNetwork: true
                },
                models: [
                  {
                    id: modelName,
                    name: modelName
                  }
                ]
              }
            }
          },
          agents: {
            defaults: {
              model: {
                primary: `openai/${modelName}`
              },
              models: {
                [`openai/${modelName}`]: {}
              }
            }
          }
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
        console.log(`Auto-generated default openclaw.json config for user ${userId} at ${configPath}`);
      }

      console.log(`Launching openclaw container on host ${this.nodeIp}:${hostPort} using image: ${this.imageName}`);

      container = await this.docker.createContainer({
        Image: this.imageName,
        name: containerName,
        ExposedPorts: {
          [`${this.containerInnerPort}/tcp`]: {},
        },
        HostConfig: {
          Binds: [
            `${userDir}:/home/node/.openclaw`, // 将配置目录挂载到容器中
          ],
          PortBindings: {
            [`${this.containerInnerPort}/tcp`]: [{ HostPort: String(hostPort) }],
          },
          AutoRemove: true, // 停止时由 Docker 自动删除容器，无需手动 rm
        },
        Env: [
          `USER_ID=${userId}`,
          `SESSION_ID=${sessionId}`,
          `OPENCLAW_GATEWAY_TOKEN=my_secure_openclaw_gateway_token`, // 绕过安全阻碍，使容器自动启动
          `OPENAI_API_KEY=${process.env.AI_API_KEY || ''}`,
          `OPENAI_API_BASE=${process.env.AI_API_BASE || ''}`,
          `NODE_TLS_REJECT_UNAUTHORIZED=0`
        ],
      });

      session.containerId = container.id;
      session.containerName = containerName;
      await this.sessionRepository.save(session);

      // 5. 启动容器
      await container.start();

      // 6. 更新状态为 running
      session.status = 'running';
      session.lastActiveAt = Date.now();
      await this.sessionRepository.save(session);

      return session;
    } catch (error) {
      console.error(`Failed to start openclaw container for user ${userId}:`, error);
      session.status = 'failed';
      await this.sessionRepository.save(session);
      
      // 尝试清理可能已创建的容器
      if (container) {
        try {
          await container.stop();
        } catch (e) {
          // ignore
        }
      }
      throw new Error(`启动云龙虾容器失败: ${error.message}`);
    }
  }

  /**
   * 停止并清理云龙虾容器会话
   */
  async stopSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) return;

    if (session.containerId) {
      try {
        const container = this.docker.getContainer(session.containerId);
        await container.stop();
      } catch (err) {
        console.warn(`Stop container ${session.containerId} failed or already cleaned:`, err.message);
      }
    }

    session.status = 'stopped';
    await this.sessionRepository.save(session);
  }

  /**
   * 彻底销毁会话与用户持久化数据
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) return;

    // 1. 停止容器
    if (session.containerId) {
      try {
        const container = this.docker.getContainer(session.containerId);
        await container.stop();
      } catch (err) {
        console.warn(`Stop container ${session.containerId} failed or already cleaned:`, err.message);
      }
    }

    // 2. 清理用户持久化数据文件夹
    const userDir = join(this.sharedDataDir, `user_${session.userId}`);
    if (fs.existsSync(userDir)) {
      try {
        fs.rmSync(userDir, { recursive: true, force: true });
        console.log(`Successfully deleted user openclaw data directory: ${userDir}`);
      } catch (err) {
        console.error(`Failed to delete user openclaw data directory ${userDir}:`, err);
      }
    }

    session.status = 'stopped';
    await this.sessionRepository.save(session);
  }

  /**
   * 更新会话的活跃时间
   */
  async updateActiveTime(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      lastActiveAt: Date.now(),
    });
  }

  /**
   * 检查容器是否存活
   */
  private async checkContainerAlive(containerId: string | null): Promise<boolean> {
    if (!containerId) return false;
    try {
      const container = this.docker.getContainer(containerId);
      const data = await container.inspect();
      return data.State.Running;
    } catch (err) {
      return false;
    }
  }

  /**
   * 清理闲置容器（默认超过 10 分钟无数据交换则清理）
   */
  private async cleanIdleContainers() {
    const idleTimeoutMs = 10 * 60 * 1000; // 10分钟
    const now = Date.now();

    const activeSessions = await this.sessionRepository.find({
      where: [
        { status: 'running' },
        { status: 'starting' },
      ],
    });

    for (const session of activeSessions) {
      const lastActiveTime = session.lastActiveAt;
      if (now - lastActiveTime > idleTimeoutMs) {
        console.log(`OpenClaw Session ${session.id} for user ${session.userId} has been idle. Clean it up.`);
        await this.stopSession(session.id);
      }
    }
  }

  /**
   * 寻找可用宿主机端口
   */
  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => {
          resolve(port);
        });
      });
    });
  }

  /**
   * 动态获取本地局域网 IP
   */
  private getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      if (iface) {
        for (let i = 0; i < iface.length; i++) {
          const alias = iface[i];
          if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
            return alias.address;
          }
        }
      }
    }
    return '127.0.0.1';
  }

  /**
   * 确保本地镜像存在，若不存在则拉取
   */
  private async ensureImageExists(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
    } catch (err) {
      console.log(`本地未找到镜像 ${imageName}，正在从远端 Registry 拉取，请稍候...`);
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(imageName, {}, (pullErr, stream) => {
          if (pullErr) return reject(pullErr);
          this.docker.modem.followProgress(stream, (finishErr) => {
            if (finishErr) return reject(finishErr);
            resolve();
          });
        });
      });
      console.log(`镜像 ${imageName} 拉取成功。`);
    }
  }
}
