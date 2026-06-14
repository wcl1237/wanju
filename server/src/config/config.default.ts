import { MidwayConfig } from '@midwayjs/core';
import { join } from 'path';

export default {
  keys: 'smart-customer-service-2024',
  koa: {
    port: 7001,
    globalPrefix: '',
  },
  staticFile: {
    dirs: {
      default: {
        prefix: '/',
        dir: join(__dirname, '../../public'),
      },
    },
  },
  // AI 模型配置
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    apiBase: process.env.AI_API_BASE || 'https://coding.dashscope.aliyuncs.com/v1',
    model: process.env.AI_MODEL || 'qwen3.7-plus',
    // Embedding 使用本地 Ollama
    embeddingApiBase: process.env.EMBEDDING_API_BASE || 'http://localhost:11434/v1',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    systemPrompt: `你是一个专业的智能客服助手，配备了先进的 RAG（检索增强生成）知识库系统。你的职责包括：
1. 友好、专业地回答用户的问题
2. 当需要查询相关信息时，使用知识库搜索工具（系统会自动进行关键词提取、关键词召回和语义精排）
3. 当用户需要反馈问题或提出需求时，帮助创建工单
4. 使用简洁明了的中文回答

请注意：
- 回答要准确、有帮助，优先基于知识库检索到的内容回答
- 引用知识库信息时，说明信息来源
- 如果知识库中没有找到相关信息，请诚实告知并建议创建工单
- 创建工单时，请从用户描述中提取关键信息
- 不要在回复中使用<think>标签或展示思考过程`,
  },
  // TypeORM 数据源配置
  typeorm: {
    dataSource: {
      default: {
        type: 'better-sqlite3',
        database: join(__dirname, '../../data/customer-service.db'),
        synchronize: true,
        logging: false,
        entities: ['**/entity/*.entity{.ts,.js}'],
      },
    },
  },
  // Redis 配置
  redis: {
    client: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
    },
  },
  // 知识库配置
  knowledge: {
    docsDir: join(__dirname, '../../knowledge'),
    chunkSize: 500,
    chunkOverlap: 80,
    topK: 5,
  },
  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'smart-cs-jwt-secret-2024',
    expiresIn: '7d',
  },
  // Swagger 配置
  swagger: {
    title: '智能客服系统 API',
    description: 'Smart Customer Service API — 对话、知识库、工单、用户认证',
    version: '1.0.0',
    tagSortable: true,
  },
} as MidwayConfig;
