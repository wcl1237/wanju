# Code Agent Image

> WanJu 智能客服系统 — 容器化工作流执行 Agent

## 概述

Code Agent 是一个运行在 Docker 容器中的智能编码助手，接收主应用推送的工作流并自主执行。具备：

- 🤖 **Agent 对话**：内置 LLM 推理引擎，支持 ReAct 推理循环
- 🔧 **工具系统**：Bash、文件读写编辑、代码搜索、进度汇报、决策请求
- 🔄 **工作流引擎**：按步骤执行结构化工作流，支持分支、并行
- 🧠 **记忆系统**：跨工作流的持久化记忆（YAML 前置元数据 Markdown 格式）
- 👥 **人机协作**：遇到需要判断时暂停，等待用户决策后继续
- 📡 **实时通信**：WebSocket 双向通信，实时推送进度和工具调用

## 快速开始

### 本地开发

```bash
cd code_agent_image

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 AI_API_KEY 等

# 开发模式启动
npm run dev
```

### Docker 启动

```bash
# 构建镜像
docker build -t code-agent .

# 运行
docker run -p 8765:8765 \
  -v $(pwd)/workspace:/workspace \
  -e AI_API_KEY=your_key \
  -e AI_API_BASE=your_base \
  -e AI_MODEL=qwen-plus \
  code-agent
```

### Docker Compose

```bash
# 配置 .env
cp .env.example .env

# 启动
docker-compose up -d
```

## API

### REST

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/workflow/push` | 推送并启动工作流 |
| `GET` | `/api/workflow/:id/status` | 查询工作流状态 |
| `POST` | `/api/workflow/:id/cancel` | 取消工作流 |
| `GET` | `/api/health` | 健康检查 |

### WebSocket

连接: `ws://host:8765`

#### 客户端 → Agent

```json
{ "type": "chat.message", "content": "你好" }
{ "type": "decision.response", "decisionId": "xxx", "choice": "方案A" }
{ "type": "workflow.cancel", "workflowId": "xxx" }
```

#### Agent → 客户端

```json
{ "type": "chat.chunk", "chunk": "你" }
{ "type": "workflow.started", "workflowId": "xxx", "steps": [...] }
{ "type": "decision.required", "decisionId": "xxx", "question": "请选择..." }
{ "type": "workflow.completed", "workflowId": "xxx", "summary": "..." }
```

## 架构

```
API Server (Midway Koa + WebSocket)
  ↓
Agent Core (QueryEngine + ConversationManager + DecisionGate)
  ↓
Tool System (Bash / FileOps / Grep / Glob / Memory / Decision)
  ↓
Workflow Engine (WorkflowRunner + WorkflowState)
  ↓
Persistence (MemoryStore + HistoryStore → /workspace/.code-agent/)
```

## 内置工具

| 工具 | 说明 |
|------|------|
| `bash` | Shell 命令执行（危险操作需确认） |
| `file_read` | 读取文件（支持行范围） |
| `file_write` | 创建/覆盖文件 |
| `file_edit` | 精确搜索替换编辑 |
| `grep` | 正则搜索（优先 ripgrep） |
| `glob` | 文件模式查找 |
| `report_progress` | 向用户汇报进度 |
| `request_decision` | 请求用户决策 |
| `save_memory` | 保存到记忆系统 |
| `recall_memory` | 检索记忆 |
