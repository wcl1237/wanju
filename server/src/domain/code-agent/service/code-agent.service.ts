/**
 * Code Agent Service — 容器生命周期管理（持久化版）
 *
 * Session 和消息均落库（TypeORM），后端重启后自动恢复。
 */
import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { CodeAgentSessionEntity } from '../entity/code-agent-session.entity';
import { CodeAgentMessageEntity } from '../entity/code-agent-message.entity';
import Docker from 'dockerode';
import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import { join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';

@Provide()
@Scope(ScopeEnum.Singleton)
export class CodeAgentService {
  @InjectEntityModel(CodeAgentSessionEntity)
  sessionRepository: Repository<CodeAgentSessionEntity>;

  @InjectEntityModel(CodeAgentMessageEntity)
  messageRepository: Repository<CodeAgentMessageEntity>;

  private docker: Docker;
  private imageName = process.env.CODE_AGENT_IMAGE || 'code-agent:latest';
  private containerInnerPort = 8765;
  private sharedDataDir = process.env.CODE_AGENT_DATA_DIR || resolve(__dirname, '../../../../../data/code-agent');
  private nodeIp: string;

  constructor() {
    const socketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
    this.docker = new Docker({ socketPath });
    this.nodeIp = process.env.NODE_IP || this.getLocalIp();
  }

  // ─── 会话管理 ─────────────────────────────────────

  /**
   * 启动 Code Agent 容器
   */
  async startSession(userId: string): Promise<CodeAgentSessionEntity> {
    // 检查是否已有运行中的会话
    const existing = await this.sessionRepository.findOne({
      where: { userId, status: 'running' },
    });
    if (existing) {
      const alive = await this.checkContainerAlive(existing.containerId);
      if (alive) {
        existing.lastActiveAt = Date.now();
        await this.sessionRepository.save(existing);
        return existing;
      }
      existing.status = 'stopped';
      await this.sessionRepository.save(existing);
    }

    const session = new CodeAgentSessionEntity();
    session.id = uuidv4();
    session.userId = userId;
    session.containerId = '';
    session.containerName = '';
    session.hostPort = 0;
    session.nodeIp = this.nodeIp;
    session.status = 'starting';
    session.createdAt = Date.now();
    session.lastActiveAt = Date.now();

    await this.sessionRepository.save(session);

    try {
      const hostPort = await this.findFreePort();
      session.hostPort = hostPort;

      // 准备工作空间目录
      const workspaceDir = join(this.sharedDataDir, `user_${userId}`, 'workspace');
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }

      const containerName = `code-agent-${userId}-${Date.now()}`;

      // 确保镜像存在
      await this.ensureImageExists(this.imageName);

      const container = await this.docker.createContainer({
        Image: this.imageName,
        name: containerName,
        ExposedPorts: {
          [`${this.containerInnerPort}/tcp`]: {},
        },
        HostConfig: {
          Binds: [
            `${workspaceDir}:/workspace`,
          ],
          PortBindings: {
            [`${this.containerInnerPort}/tcp`]: [{ HostPort: String(hostPort) }],
          },
          AutoRemove: true,
        },
        Env: [
          `USER_ID=${userId}`,
          `SESSION_ID=${session.id}`,
          `PORT=${this.containerInnerPort}`,
          `WORKSPACE_DIR=/workspace`,
          `AI_API_KEY=${process.env.AI_API_KEY || ''}`,
          `AI_API_BASE=${process.env.AI_API_BASE || ''}`,
          `AI_MODEL=${process.env.AI_MODEL || 'qwen-plus'}`,
          `NODE_TLS_REJECT_UNAUTHORIZED=0`,
        ],
      });

      session.containerId = container.id;
      session.containerName = containerName;

      await container.start();
      session.status = 'running';
      session.lastActiveAt = Date.now();
      await this.sessionRepository.save(session);

      console.log(`[CodeAgent] 容器启动成功: ${containerName} on ${this.nodeIp}:${hostPort}`);
      return session;
    } catch (error) {
      console.error(`[CodeAgent] 启动失败:`, error);
      session.status = 'failed';
      await this.sessionRepository.save(session);
      throw new Error(`Code Agent 容器启动失败: ${error.message}`);
    }
  }

  /**
   * 停止容器
   */
  async stopSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (session) {
      if (session.containerId) {
        try {
          const container = this.docker.getContainer(session.containerId);
          await container.stop();
        } catch (err) {
          console.warn(`[CodeAgent] 停止容器失败:`, err.message);
        }
      }
      session.status = 'stopped';
      session.lastActiveAt = Date.now();
      await this.sessionRepository.save(session);
      return;
    }

    // 会话不在数据库中，尝试按名称模式查找容器
    await this.cleanupOrphanContainers();
  }

  /**
   * 销毁容器及数据
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (session) {
      // 停止容器
      if (session.containerId && session.status !== 'stopped') {
        try {
          const container = this.docker.getContainer(session.containerId);
          await container.stop();
        } catch (err) {
          console.warn(`[CodeAgent] 停止容器失败:`, err.message);
        }
      }

      // 清理工作空间数据
      const workspaceDir = join(this.sharedDataDir, `user_${session.userId}`);
      if (fs.existsSync(workspaceDir)) {
        try {
          fs.rmSync(workspaceDir, { recursive: true, force: true });
        } catch (err) {
          console.error(`[CodeAgent] 清理数据失败:`, err);
        }
      }

      // 删除会话关联的消息
      await this.messageRepository.delete({ sessionId });

      // 删除会话记录
      await this.sessionRepository.delete({ id: sessionId });
      return;
    }

    // 会话不在数据库中，尝试清理孤立容器
    await this.cleanupOrphanContainers();
  }

  /**
   * 获取用户的活跃会话
   */
  async getActiveSession(userId: string): Promise<CodeAgentSessionEntity | null> {
    const session = await this.sessionRepository.findOne({
      where: { userId, status: 'running' },
    });
    if (!session) return null;

    const alive = await this.checkContainerAlive(session.containerId);
    if (!alive) {
      session.status = 'stopped';
      await this.sessionRepository.save(session);
      return null;
    }

    return session;
  }

  /**
   * 推送工作流到容器
   */
  async pushWorkflow(sessionId: string, workflow: Record<string, unknown>): Promise<{ workflowId: string }> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session || session.status !== 'running') {
      throw new Error('会话不存在或未运行');
    }

    const url = `http://${this.nodeIp}:${session.hostPort}/api/workflow/push`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow }),
    });

    const result = await response.json() as { success: boolean; message?: string; data?: { workflowId: string } };
    if (!result.success) {
      throw new Error(result.message || '工作流推送失败');
    }

    return result.data!;
  }

  /**
   * 获取容器的 WebSocket URL（用于前端直连或网关代理）
   */
  async getContainerWsUrl(sessionId: string): Promise<string | null> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session || session.status !== 'running') return null;
    return `ws://${this.nodeIp}:${session.hostPort}`;
  }

  // ─── 消息持久化 ──────────────────────────────────

  /**
   * 保存消息
   */
  async saveMessage(msg: {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    toolCalls?: unknown[];
    decision?: unknown;
  }): Promise<void> {
    const entity = new CodeAgentMessageEntity();
    entity.id = msg.id;
    entity.sessionId = msg.sessionId;
    entity.role = msg.role;
    entity.content = msg.content;
    entity.toolCalls = msg.toolCalls ? JSON.stringify(msg.toolCalls) : null;
    entity.decision = msg.decision ? JSON.stringify(msg.decision) : null;
    entity.createdAt = Date.now();
    await this.messageRepository.save(entity);
  }

  /**
   * 更新消息内容（流式追加后批量更新）
   */
  async updateMessageContent(id: string, content: string, toolCalls?: unknown[]): Promise<void> {
    const update: Partial<CodeAgentMessageEntity> = { content };
    if (toolCalls) {
      update.toolCalls = JSON.stringify(toolCalls);
    }
    await this.messageRepository.update(id, update);
  }

  /**
   * 获取会话的消息历史
   */
  async getMessages(sessionId: string): Promise<CodeAgentMessageEntity[]> {
    return this.messageRepository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 删除会话的所有消息
   */
  async clearMessages(sessionId: string): Promise<void> {
    await this.messageRepository.delete({ sessionId });
  }

  /**
   * 更新会话活跃时间
   */
  async updateActiveTime(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, { lastActiveAt: Date.now() });
  }

  // ─── 私有方法 ─────────────────────────────────────

  /**
   * 清理名称匹配 code-agent-* 的孤立容器
   */
  private async cleanupOrphanContainers(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({
        filters: { name: ['code-agent-'] },
      });
      for (const info of containers) {
        try {
          const container = this.docker.getContainer(info.Id);
          await container.stop();
          console.log(`[CodeAgent] 清理孤立容器: ${info.Names?.[0]}`);
        } catch (err) {
          console.warn(`[CodeAgent] 清理孤立容器失败: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[CodeAgent] 查找孤立容器失败:`, err);
    }
  }

  private async checkContainerAlive(containerId: string): Promise<boolean> {
    if (!containerId) return false;
    try {
      const container = this.docker.getContainer(containerId);
      const data = await container.inspect();
      return data.State.Running;
    } catch {
      return false;
    }
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
    });
  }

  private getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      if (iface) {
        for (const alias of iface) {
          if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
            return alias.address;
          }
        }
      }
    }
    return '127.0.0.1';
  }

  private async ensureImageExists(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
      console.log(`[CodeAgent] 镜像已存在: ${imageName}`);
    } catch {
      const buildContext = resolve(__dirname, '../../../../../code_agent_image');
      if (fs.existsSync(join(buildContext, 'Dockerfile'))) {
        console.log(`[CodeAgent] 镜像 ${imageName} 不存在，从 ${buildContext} 构建...`);
        try {
          execSync(`docker build -t ${imageName} ${buildContext}`, {
            stdio: 'inherit',
            timeout: 300000,
          });
          console.log(`[CodeAgent] 镜像构建完成: ${imageName}`);
        } catch (buildErr) {
          throw new Error(`镜像构建失败: ${buildErr.message}`);
        }
      } else {
        console.log(`[CodeAgent] 拉取镜像 ${imageName}...`);
        try {
          execSync(`docker pull ${imageName}`, { stdio: 'inherit', timeout: 300000 });
        } catch (pullErr) {
          throw new Error(`镜像 ${imageName} 不存在且无法拉取: ${pullErr.message}`);
        }
      }
    }
  }
}
