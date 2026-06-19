/**
 * 统一 WebSocket Gateway — 处理所有 WS 连接
 *
 * @midwayjs/ws 原生 ws 模式只支持单个 WSController，
 * 因此所有 WS 路由（OpenClaw、Code Agent）统一在此通过 URL 路径分流。
 */
import { WSController, OnWSConnection, Inject, OnWSMessage, OnWSDisConnection } from '@midwayjs/core';
import * as ws from '@midwayjs/ws';
import WebSocket from 'ws';
import { OpenClawService } from '../../domain/openclaw/service/openclaw.service';
import { CodeAgentService } from '../../domain/code-agent/service/code-agent.service';
import { UserService } from '../../domain/auth/service/user.service';

@WSController('/ws')
export class UnifiedWSGateway {
  @Inject()
  ctx: ws.Context;

  @Inject()
  openClawService: OpenClawService;

  @Inject()
  codeAgentService: CodeAgentService;

  @Inject()
  userService: UserService;

  private static activeConnections = new Map<string, ws.Context>();

  // ─── onConnection 统一入口 ──────────────────────────

  @OnWSConnection()
  async onConnection(socket: ws.Context, request: any) {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;

    // ── 鉴权（所有 WS 通用）──────────────────────
    let token = url.searchParams.get('token');
    const cookieHeader = request.headers?.cookie || '';
    if (!token && cookieHeader) {
      const cookies = cookieHeader.split(';').reduce((acc, c) => {
        const parts = c.split('=');
        if (parts.length === 2) {
          acc[parts[0].trim()] = decodeURIComponent(parts[1].trim());
        }
        return acc;
      }, {} as Record<string, string>);
      token = cookies['token'];
    }

    if (!token) {
      socket.close(4001, 'Unauthorized: Token missing');
      return;
    }
    try {
      this.userService.verifyToken(token);
    } catch (err) {
      socket.close(4001, 'Unauthorized: Invalid token');
      return;
    }

    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      socket.close(4002, 'Bad Request: SessionId missing');
      return;
    }

    // ── 路径分流 ──────────────────────────────────

    if (pathname.startsWith('/ws/openclaw')) {
      await this.handleOpenClawConnection(socket, request, sessionId);
    } else if (pathname.startsWith('/ws/code-agent')) {
      await this.handleCodeAgentConnection(socket, request, sessionId);
    } else {
      socket.close(4004, 'Unknown WS endpoint: ' + pathname);
    }
  }

  // ─── OpenClaw 连接处理 ─────────────────────────────

  private async handleOpenClawConnection(socket: ws.Context, request: any, sessionId: string) {
    const session = await this.openClawService.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!session || (session.status !== 'running' && session.status !== 'starting') || !session.hostPort) {
      socket.close(4003, 'Session not running');
      return;
    }

    // 多端连接防冲突
    const connKey = `openclaw:${sessionId}`;
    const existingSocket = UnifiedWSGateway.activeConnections.get(connKey);
    if (existingSocket && existingSocket !== socket) {
      try {
        if (existingSocket.readyState === 1) {
          existingSocket.send(JSON.stringify({
            type: 'event',
            event: 'SUPERSEDED',
            payload: {
              reason: 'session_taken_over',
              message: '您的账号已在其他窗口/设备中打开，当前连接已断开。',
              timestamp: Date.now()
            }
          }));
          existingSocket.close(4009, 'SUPERSEDED');
        }
      } catch (err) {
        console.error('Failed to send SUPERSEDED to existing socket:', err);
      }
    }
    UnifiedWSGateway.activeConnections.set(connKey, socket);

    // 建立到容器的 WebSocket 连接
    const localNodeIp = (this.openClawService as any).nodeIp || '127.0.0.1';
    const targetIp = (session.nodeIp === localNodeIp) ? '127.0.0.1' : (session.nodeIp || '127.0.0.1');
    const targetUrl = `ws://${targetIp}:${session.hostPort}`;
    const targetSocket = new WebSocket(targetUrl, {
      headers: {
        'Authorization': 'Bearer my_secure_openclaw_gateway_token',
        'Origin': `http://${targetIp}:${session.hostPort}`
      }
    });

    (socket as any).targetSocket = targetSocket;
    (socket as any).sessionId = sessionId;
    (socket as any).wsType = 'openclaw';
    (socket as any).handshakeComplete = false;
    (socket as any).messageQueue = [];

    targetSocket.on('open', () => {
      console.log(`Successfully proxied WS to openclaw container at port ${session.hostPort}`);
      if (session.status === 'starting') {
        session.status = 'running';
        this.openClawService.sessionRepository.save(session).catch(console.error);
      }
    });

    // 容器 -> 客户端
    targetSocket.on('message', (data) => {
      try {
        const msgStr = data.toString();
        const msg = JSON.parse(msgStr);

        // 拦截并自动回复 connect.challenge
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce = msg.payload?.nonce;
          const connectMsg = {
            type: 'req',
            id: 'conn-1',
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 4,
              client: {
                id: 'openclaw-control-ui',
                version: '1.0.0',
                platform: 'linux',
                mode: 'ui'
              },
              role: 'operator',
              scopes: ['operator.read', 'operator.write', 'operator.admin'],
              auth: {
                token: 'my_secure_openclaw_gateway_token'
              },
              device: {
                id: 'wanju-gateway-device',
                publicKey: 'dummy',
                signature: 'dummy',
                signedAt: Date.now(),
                nonce: nonce
              }
            }
          };
          targetSocket.send(JSON.stringify(connectMsg));
          console.log(`Auto-responded to openclaw connect challenge for session ${sessionId}`);
          return;
        }

        // 拦截握手响应
        if (msg.type === 'res' && msg.id === 'conn-1') {
          if (msg.ok) {
            console.log(`Handshake succeeded for openclaw session ${sessionId}`);
            (socket as any).handshakeComplete = true;
            const queue = (socket as any).messageQueue || [];
            if (queue.length > 0) {
              console.log(`Flushing ${queue.length} queued messages for session ${sessionId}`);
              for (const queuedMsg of queue) {
                if (targetSocket.readyState === WebSocket.OPEN) {
                  targetSocket.send(queuedMsg);
                }
              }
              (socket as any).messageQueue = [];
            }
          } else {
            console.error(`Handshake failed for openclaw session ${sessionId}:`, msg.error);
            socket.close(4008, `Handshake failed: ${msg.error?.message || 'unknown error'}`);
          }
          return;
        }
      } catch (err) {
        // 解析出错，直接透传
      }

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    targetSocket.on('close', (code, reason) => {
      console.log(`Target openclaw ws closed: ${code} - ${reason}`);
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(code, reason.toString());
      }
    });

    targetSocket.on('error', (err) => {
      console.error('Target openclaw ws error:', err);
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1011, 'Target connection error');
      }
    });
  }

  // ─── Code Agent 连接处理 ──────────────────────────

  /**
   * 持久后端连接池：sessionId → { ws, clients }
   * 后端到容器的 WS 连接不随客户端断开而关闭，
   * 所有消息自动拦截并存库。
   */
  private static persistentConnections = new Map<string, {
    ws: WebSocket;
    clients: Set<ws.Context>;
    messageQueue?: any[];
  }>();

  private async handleCodeAgentConnection(socket: ws.Context, request: any, sessionId: string) {
    const session = await this.codeAgentService.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session || session.status !== 'running') {
      socket.close(4003, 'Session not running');
      return;
    }
    const localNodeIp = (this.codeAgentService as any).nodeIp || '127.0.0.1';
    const targetIp = (session.nodeIp === localNodeIp) ? '127.0.0.1' : (session.nodeIp || '127.0.0.1');
    const containerWsUrl = `ws://${targetIp}:${session.hostPort}`;

    // 多端防冲突
    const connKey = `code-agent:${sessionId}`;
    const existingSocket = UnifiedWSGateway.activeConnections.get(connKey);
    if (existingSocket && existingSocket !== socket) {
      try {
        if (existingSocket.readyState === 1) {
          existingSocket.send(JSON.stringify({
            type: 'error',
            message: '您的账号已在其他窗口中打开，当前连接已断开',
          }));
          existingSocket.close(4009, 'SUPERSEDED');
        }
      } catch (err) {
        console.error('[CodeAgent WS] Failed to supersede:', err);
      }
    }
    UnifiedWSGateway.activeConnections.set(connKey, socket);

    (socket as any).sessionId = sessionId;
    (socket as any).wsType = 'code-agent';

    // 获取或创建持久后端连接
    let persistent = UnifiedWSGateway.persistentConnections.get(sessionId);

    if (!persistent || persistent.ws.readyState !== WebSocket.OPEN) {
      // 创建新的持久连接
      const targetSocket = new WebSocket(containerWsUrl);
      persistent = { ws: targetSocket, clients: new Set(), messageQueue: [] };
      UnifiedWSGateway.persistentConnections.set(sessionId, persistent);

      targetSocket.on('open', () => {
        console.log(`[CodeAgent WS] Persistent connection to container: ${containerWsUrl}`);
        if (persistent.messageQueue && persistent.messageQueue.length > 0) {
          setTimeout(() => {
            if (persistent.messageQueue && persistent.messageQueue.length > 0) {
              console.log(`[CodeAgent WS] Flushing ${persistent.messageQueue.length} queued messages to container`);
              for (const msg of persistent.messageQueue) {
                if (targetSocket.readyState === WebSocket.OPEN) {
                  targetSocket.send(msg);
                }
              }
              persistent.messageQueue = [];
            }
          }, 300);
        }
      });

      // 容器 → 后端：转发给所有连接的客户端（容器自行持久化消息）
      targetSocket.on('message', (rawData) => {
        const dataStr = rawData.toString();
        const conn = UnifiedWSGateway.persistentConnections.get(sessionId);

        // 转发给所有连接的客户端
        if (conn) {
          for (const client of conn.clients) {
            try {
              if (client.readyState === 1) {
                client.send(dataStr);
              }
            } catch (e) {
              // ignore dead sockets
            }
          }
        }
      });

      targetSocket.on('close', (code, reason) => {
        console.log(`[CodeAgent WS] Persistent connection closed: ${code} - ${reason}`);
        UnifiedWSGateway.persistentConnections.delete(sessionId);
        // 通知所有客户端
        if (persistent) {
          for (const client of persistent.clients) {
            try {
              if (client.readyState === 1) client.close(code, reason.toString());
            } catch (e) { /* ignore */ }
          }
        }
      });

      targetSocket.on('error', (err) => {
        console.error('[CodeAgent WS] Persistent connection error:', err.message);
      });
    }

    // 将客户端加入订阅列表
    persistent.clients.add(socket);
    (socket as any).targetSocket = persistent.ws;

    // WS 连接仅用于实时增量消息转发，历史由前端通过 REST API 获取
    console.log(`[CodeAgent WS] Client subscribed to session ${sessionId}, total clients: ${persistent.clients.size}`);
  }



  // ─── onMessage 统一入口 ────────────────────────────

  @OnWSMessage('message')
  async onMessage(data: any) {
    const socket = this.ctx;
    const targetSocket: WebSocket = (socket as any).targetSocket;
    const sessionId: string = (socket as any).sessionId;
    const wsType: string = (socket as any).wsType;

    try {
      const msgStr = data.toString();
      const msg = JSON.parse(msgStr);

      // Ping 由网关直接响应
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }));
        if (wsType === 'openclaw' && sessionId) {
          this.openClawService.updateActiveTime(sessionId).catch(err => {
            console.error('Failed to update active time:', err);
          });
        }
        return;
      }

      // OpenClaw control 消息特殊处理
      if (wsType === 'openclaw' && msg.type === 'control') {
        const actionStr = `${msg.action}${msg.direction ? ' ' + msg.direction : ''}`;
        const reqMsg = {
          type: 'req',
          id: `req-ctrl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          method: 'system-event',
          params: {
            text: `Control Action: ${actionStr}`,
            mode: 'now'
          }
        };
        const reqStr = JSON.stringify(reqMsg);
        if (!(socket as any).handshakeComplete) {
          (socket as any).messageQueue = (socket as any).messageQueue || [];
          (socket as any).messageQueue.push(reqStr);
        } else if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
          targetSocket.send(reqStr);
        }
        if (sessionId) {
          this.openClawService.updateActiveTime(sessionId).catch(err => {
            console.error('Failed to update active time:', err);
          });
        }
        return;
      }
    } catch (err) {
      // 忽略解析错误，走普通透传
    }

    // OpenClaw: 握手前队列
    if (wsType === 'openclaw' && !(socket as any).handshakeComplete) {
      (socket as any).messageQueue = (socket as any).messageQueue || [];
      (socket as any).messageQueue.push(data);
      return;
    }

    // Code Agent: 容器连接前消息队列，防止连接建立期间丢包
    if (wsType === 'code-agent') {
      const persistent = UnifiedWSGateway.persistentConnections.get(sessionId);
      if (persistent) {
        const msgStr = data.toString();
        if (persistent.ws.readyState === WebSocket.OPEN) {
          persistent.ws.send(msgStr);
        } else {
          console.log(`[CodeAgent WS] Queuing message because container WS state is: ${persistent.ws.readyState}`);
          persistent.messageQueue = persistent.messageQueue || [];
          persistent.messageQueue.push(msgStr);
        }
      }
      return;
    }

    // 透传到容器
    if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
      targetSocket.send(data);
    }

    // 更新 OpenClaw 活跃时间
    if (wsType === 'openclaw' && sessionId) {
      this.openClawService.updateActiveTime(sessionId).catch(err => {
        console.error('Failed to update active time:', err);
      });
    }
  }

  // ─── onClose 统一入口 ─────────────────────────────

  @OnWSDisConnection()
  async onClose() {
    const socket = this.ctx;
    const targetSocket: WebSocket = (socket as any).targetSocket;
    const sessionId: string = (socket as any).sessionId;
    const wsType: string = (socket as any).wsType;

    // 清理连接映射
    if (sessionId) {
      const connKey = `${wsType}:${sessionId}`;
      if (UnifiedWSGateway.activeConnections.get(connKey) === socket) {
        UnifiedWSGateway.activeConnections.delete(connKey);
      }
    }

    if (wsType === 'code-agent' && sessionId) {
      // Code Agent: 仅从订阅列表中移除客户端，不关闭后端持久连接
      const persistent = UnifiedWSGateway.persistentConnections.get(sessionId);
      if (persistent) {
        persistent.clients.delete(socket);
        console.log(`[CodeAgent WS] Client unsubscribed, remaining clients: ${persistent.clients.size}`);
      }
    } else if (targetSocket) {
      // OpenClaw: 正常关闭到容器的连接
      try {
        if (targetSocket.readyState === WebSocket.CONNECTING || targetSocket.readyState === WebSocket.OPEN) {
          targetSocket.close();
        }
      } catch (err) {
        // ignore
      }
    }

    console.log(`[${wsType || 'unknown'} WS] Client disconnected`);
  }
}
