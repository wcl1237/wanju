import { MidwayConfig } from '@midwayjs/core';

export default {
  keys: 'code-agent-secret-key',
  koa: {
    port: parseInt(process.env.PORT || '8765', 10),
  },
  webSocket: {},
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    apiBase: process.env.AI_API_BASE || '',
    model: process.env.AI_MODEL || 'qwen-plus',
  },
  agent: {
    workspaceDir: process.env.WORKSPACE_DIR || '/workspace',
    authToken: process.env.AGENT_AUTH_TOKEN || '',
    maxReactRounds: 15,
    defaultDecisionTimeoutMs: 0,  // 0 = 无限等待
  },
} as MidwayConfig;
