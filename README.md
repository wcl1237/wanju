# 🤖 WanJu — 智能客服系统

> AI-Powered Smart Customer Service Platform

基于 **ReAct Agent + RAG 知识库 + 可视化工作流** 的全栈智能客服系统。

## ✨ 核心特性

### 🧠 AI 对话引擎
- **ReAct Agent** — Thought → Action → Observation 循环推理，支持 Function Calling
- **多模型支持** — 通义千问（Qwen）、Ollama 本地模型、OpenAI 兼容接口
- **三层记忆系统** — 短期记忆（Redis）+ 长期记忆（mem0 向量化）+ 持久化（SQLite）
- **SSE 流式响应** — 实时推送思考过程、工具调用、工作流执行状态

### ⚙️ 可视化工作流
- **拖拽式流程编辑器** — 基于 React Flow，支持 12 种节点类型
- **多种触发方式** — 关键词匹配、AI 意图识别、正则表达式、始终触发
- **节点类型** — 触发器、参数提取、条件分支、消息回复、AI 生成、知识检索、工单创建、HTTP 请求、单 Agent、Agent Teams、Master-Sub Agent、结束
- **两种执行模式** — 独立模式（工作流独立回复） / 替代输入模式（工作流输出替代用户消息继续对话）

### 🧑‍💼 Agent 池
- **Agent 管理** — 创建、编辑、启用/禁用 AI Agent
- **AI Prompt 生成** — 根据 Agent 名称和描述自动生成 System Prompt
- **工作流集成** — Agent 可在工作流中被调用，支持单 Agent、Agent Teams（并行协作 + 共享黑板）、Master-Sub Agent（编排调度）三种模式

### 📚 RAG 知识库
- **文档管理** — 上传 / 在线编辑知识文档
- **智能检索** — 关键词召回 + 语义精排，向量化存储（Ollama Embedding + Qdrant/内存向量库）
- **自动引用** — 对话中自动搜索知识库并引用来源

### 🎫 工单系统
- **自动创建** — AI 对话中自动识别需求并创建工单
- **手动创建** — 支持手动提交工单
- **状态跟踪** — 工单全生命周期管理

### 🎯 技能中心
- **技能管理** — 创建和管理 AI 技能（prompt 模板 + 关键词触发）
- **自动匹配** — 对话中根据用户消息自动激活相关技能

### 👤 客户管理
- **自动信息收集** — 对话中自然地收集用户信息
- **用户画像** — 长期记忆驱动的个性化服务
- **跨对话记忆** — 自动提取和关联用户长期记忆

---

## 🏗 技术架构

### 后端 — Midway.js（Node.js）

```
server/src/
├── application/              # 应用服务层 — 编排跨域用例
│   ├── workflow.app-service  # 工作流 CRUD + 验证
│   └── chat.app-service      # 对话流程编排
├── domain/                   # 领域层 — 纯业务逻辑
│   ├── agent/                # Agent 池（entity/model/port/service）
│   ├── ai/                   # AI 智能域（action/model/port/service）
│   │   ├── action/           # ReAct Action（create_ticket/search_knowledge/save_customer_info）
│   │   ├── port/             # LLM 端口接口（ILLMClient）
│   │   └── service/          # ReactAgentService（ReAct 循环核心）
│   ├── auth/                 # 认证域
│   ├── chat/                 # 对话域（entity/model/port/service）
│   ├── customer/             # 客户域
│   ├── knowledge/            # 知识库域
│   ├── skill/                # 技能域
│   ├── ticket/               # 工单域
│   └── workflow/             # 工作流域
│       ├── executor/         # 节点执行器（Strategy 插件模式，12 种节点）
│       ├── model/            # 领域模型 + SSE 事件协议
│       ├── port/             # 仓储接口
│       └── service/          # GraphEngineService 图遍历引擎
├── infrastructure/           # 基础设施层
│   ├── embedding/            # Embedding 适配器
│   ├── llm/                  # LLM 客户端实现
│   ├── repository/           # TypeORM 仓储实现
│   └── vector/               # 向量数据库适配器
├── interface/                # 接口层
│   ├── controller/           # REST API 控制器
│   └── middleware/           # JWT 认证等中间件
└── shared/                   # 共享层
    ├── types.ts              # 统一 API 响应格式
    └── domain-event.ts       # 领域事件总线
```

### 前端 — React + Vite

```
web/src/
├── features/                 # Feature-Sliced 架构
│   ├── agent/                # Agent 池管理
│   ├── auth/                 # 登录认证
│   ├── chat/                 # AI 对话（SSE 流式 + 工具状态追踪）
│   ├── customer/             # 客户信息卡片
│   ├── knowledge/            # 知识库管理
│   ├── skill/                # 技能中心
│   ├── ticket/               # 工单管理
│   ├── trace/                # 对话轨迹可视化
│   └── workflow/             # 工作流编辑器
│       ├── components/       # 拆分组件（CustomNode/PropertyPanel/TopBar/NodePalette）
│       ├── constants/        # 节点类型元数据
│       ├── store/            # Zustand 状态管理
│       ├── styles/           # 分离样式
│       └── utils/            # 工具函数
├── shared/                   # 共享组件和工具
│   ├── components/           # NavSidebar 等
│   └── http-client.ts        # Cookie 鉴权 fetch 封装
└── App.tsx                   # 路由 + 布局
```

### 技术栈

| 层级 | 技术 |
|------|------|
| **后端框架** | Midway.js 3 (Koa) |
| **数据库** | SQLite (better-sqlite3) + TypeORM |
| **缓存** | Redis (ioredis) |
| **AI 模型** | 通义千问 Qwen / Ollama / OpenAI 兼容 |
| **Embedding** | Ollama (nomic-embed-text) |
| **向量检索** | 内存向量库 / Qdrant |
| **长期记忆** | mem0ai |
| **前端框架** | React 19 + Vite |
| **状态管理** | Zustand |
| **工作流编辑** | @xyflow/react (React Flow) |
| **路由** | React Router v7 |
| **认证** | JWT + httpOnly Cookie |
| **API 文档** | Swagger (Midway Swagger) |

---

## 🚀 快速开始

### 环境要求

- Node.js ≥ 20
- Redis（本地或远程）
- Ollama（本地，用于 Embedding）

### 安装依赖

```bash
# 后端
cd server && npm install

# 前端
cd web && npm install
```

### 环境配置

```bash
# server/.env
AI_API_KEY=your-api-key
AI_API_BASE=https://coding.dashscope.aliyuncs.com/v1
AI_MODEL=qwen3.7-plus
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_API_BASE=http://localhost:11434/v1
```

### 启动开发

```bash
# 终端 1 — 后端（端口 7001）
cd server && npm run dev

# 终端 2 — 前端（端口 5173）
cd web && npm run dev
```

### 生产构建

```bash
# 构建前端并输出到 server/public
cd server && npm run build:web

# 构建后端
cd server && npm run build

# 启动生产服务
cd server && npm start
```

---

## 📡 API 概览

| 模块 | 端点 | 说明 |
|------|------|------|
| **认证** | `POST /api/auth/login` | 登录 |
| **对话** | `POST /api/chat/conversations/:id/messages` | 发送消息（SSE） |
| **对话** | `GET /api/chat/conversations` | 获取对话列表 |
| **工作流** | `GET/POST/PUT/DELETE /api/workflows` | 工作流 CRUD |
| **Agent** | `GET/POST/PUT/DELETE /api/agents` | Agent 池 CRUD |
| **Agent** | `POST /api/agents/generate-prompt` | AI 生成 Prompt |
| **知识库** | `GET/POST/DELETE /api/knowledge` | 知识文档管理 |
| **工单** | `GET/POST/PUT /api/tickets` | 工单管理 |
| **技能** | `GET/POST/PUT/DELETE /api/skills` | 技能 CRUD |
| **客户** | `GET /api/customers` | 客户信息 |

完整 API 文档：启动后端后访问 `http://localhost:7001/swagger-ui/index.html`

---

## 📄 许可

MIT
