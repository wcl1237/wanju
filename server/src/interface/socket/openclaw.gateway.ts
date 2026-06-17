import { WSController, OnWSConnection, Inject, OnWSMessage, OnWSDisConnection } from '@midwayjs/core';
import * as ws from '@midwayjs/ws';
import WebSocket from 'ws';
import { OpenClawService } from '../../domain/openclaw/service/openclaw.service';
import { UserService } from '../../domain/auth/service/user.service';

@WSController('/ws/openclaw')
export class OpenClawGateway {
  @Inject()
  ctx: ws.Context; // 当前的 socket 连接

  @Inject()
  openClawService: OpenClawService;

  @Inject()
  userService: UserService;

  private static activeConnections = new Map<string, ws.Context>();

  @OnWSConnection()
  async onConnection(socket: ws.Context, request: any) {
    const url = new URL(request.url, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');
    
    // 从 cookie 或 query 获取 token
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

    // 1. 鉴权
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

    // 2. 根据 sessionId 查询会话和端口
    if (!sessionId) {
      socket.close(4002, 'Bad Request: SessionId missing');
      return;
    }

    const session = await this.openClawService.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!session || (session.status !== 'running' && session.status !== 'starting') || !session.hostPort) {
      socket.close(4003, 'Session not running');
      return;
    }

    // 2.5 多端连接防冲突 (Owner Takeover)
    const existingSocket = OpenClawGateway.activeConnections.get(sessionId);
    if (existingSocket && existingSocket !== socket) {
      try {
        if (existingSocket.readyState === 1 /* OPEN */) {
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
    OpenClawGateway.activeConnections.set(sessionId, socket);

    // 3. 建立到容器的 WebSocket 连接（分布式路由：跨服务器连接）
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
    (socket as any).handshakeComplete = false;
    (socket as any).messageQueue = [];

    targetSocket.on('open', () => {
      console.log(`Successfully proxied WS to openclaw container at port ${session.hostPort}`);
      // 连接成功后，更新一次状态为 running (以防之前是 starting)
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

        // 1. 拦截并自动回复 connect.challenge
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
          return; // 不下发挑战报文给前端
        }

        // 2. 拦截握手响应，验证是否成功
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
          return; // 不下发握手响应给前端
        }
      } catch (err) {
        // 如果解析出错，直接走透明透传
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

  @OnWSMessage('message')
  async onMessage(data: any) {
    const socket = this.ctx;
    const targetSocket: WebSocket = (socket as any).targetSocket;
    const sessionId: string = (socket as any).sessionId;

    try {
      const msgStr = data.toString();
      const msg = JSON.parse(msgStr);

      // 1. 拦截 ping 消息直接由网关响应，并刷新会话活跃时间
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }));
        if (sessionId) {
          this.openClawService.updateActiveTime(sessionId).catch(err => {
            console.error('Failed to update active time:', err);
          });
        }
        return;
      }

      // 2. 拦截 control 消息并包装为 system-event RPC 消息传给容器
      if (msg.type === 'control') {
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
          console.log(`Queued control message because handshake is not complete yet for session ${sessionId}`);
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

    if (!(socket as any).handshakeComplete) {
      (socket as any).messageQueue = (socket as any).messageQueue || [];
      (socket as any).messageQueue.push(data);
      console.log(`Queued client message because handshake is not complete yet for session ${sessionId}`);
    } else {
      if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
        targetSocket.send(data);
      }
    }

    // 异步更新活跃时间，确保不被闲置清理
    if (sessionId) {
      this.openClawService.updateActiveTime(sessionId).catch(err => {
        console.error('Failed to update active time:', err);
      });
    }
  }

  @OnWSDisConnection()
  async onClose() {
    const socket = this.ctx;
    const targetSocket: WebSocket = (socket as any).targetSocket;
    const sessionId: string = (socket as any).sessionId;

    // 清理多端连接映射
    if (sessionId && OpenClawGateway.activeConnections.get(sessionId) === socket) {
      OpenClawGateway.activeConnections.delete(sessionId);
    }

    if (targetSocket) {
      try {
        if (targetSocket.readyState === WebSocket.CONNECTING || targetSocket.readyState === WebSocket.OPEN) {
          targetSocket.close();
        }
      } catch (err) {
        // ignore
      }
    }
    console.log('Client WS connection closed');
  }
}
