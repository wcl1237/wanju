const WebSocket = require('ws');

// 提取会话ID和Token
const sessionId = 'c6670fb8-945c-4e6b-a722-a00b2f862aca';
const tokenCookie = 'locale=zh-cn; token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhY2JhODUyZS0zZGVkLTRkMTctYmUwYy1iMWExNjJjODk5MDgiLCJ1c2VybmFtZSI6ImFkbWluIiwiaWF0IjoxNzgxNDQzNDcyLCJleHAiOjE3ODIwNDgyNzJ9.P9yAHL6hWtapIZLX-U222_oOIMbFciTYPF04S-2fdIk; token.sig=7L4Ppy4-xmhyTyXfqSvN2f4EM_yNdNSi1NBcInOY62o';

const wsUrl = `ws://localhost:5173/ws/openclaw?sessionId=${sessionId}`;

console.log(`Connecting to WS Proxy: ${wsUrl}...`);

const ws = new WebSocket(wsUrl, {
  headers: {
    'Cookie': tokenCookie,
    'Origin': 'http://localhost:5173'
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket Connection Handshake Success!');

  // 1. 发送心跳/测速包
  const pingPayload = JSON.stringify({
    type: 'ping',
    timestamp: Date.now()
  });
  console.log(`📤 Sending ping: ${pingPayload}`);
  ws.send(pingPayload);

  // 2. 发送测试对话消息
  setTimeout(() => {
    const chatPayload = JSON.stringify({
      type: 'req',
      id: 'chat-req-1',
      method: 'chat.send',
      params: {
        sessionKey: 'agent:main:main',
        message: '你好！你是谁？',
        idempotencyKey: 'idempotency-key-' + Date.now()
      }
    });
    console.log(`📤 Sending chat message: ${chatPayload}`);
    ws.send(chatPayload);
  }, 1000);

  // 3. 15秒后自动关闭连接（留时间给AI生成响应）
  setTimeout(() => {
    console.log('Closing test socket...');
    ws.close();
    process.exit(0);
  }, 15000);
});

ws.on('message', (data) => {
  console.log(`📥 Received message from proxy: ${data.toString()}`);
});

ws.on('close', (code, reason) => {
  console.log(`❌ Connection closed. Code: ${code}, Reason: ${reason}`);
});

ws.on('error', (err) => {
  console.error('💥 Socket error:', err.message);
});
