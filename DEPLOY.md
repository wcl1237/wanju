# 🛠️ WanJu (智能客服系统) & 云龙虾 (OpenClaw) 本地部署手册

本手册详细介绍了如何将智能客服系统及云龙虾（OpenClaw）容器沙箱环境在本地进行部署、配置和排错。

---

## 📋 1. 前置依赖环境

在开始部署前，请确保您的本地开发机已安装并运行了以下基础依赖：

| 依赖组件 | 推荐版本 | 说明 |
| :--- | :--- | :--- |
| **Node.js** | `≥ 20.x` | 后端 Midway.js 与前端 Vite 的运行时环境。 |
| **npm** | `≥ 10.x` | 依赖包管理器。 |
| **Docker Desktop** | `最新版` | 用于按需运行、隔离云龙虾 Agent 执行实例。**必须运行 Docker Daemon**。 |
| **Redis** | `≥ 6.x` | 默认监听 `127.0.0.1:6379`。用于短期对话缓存与路由。 |
| **Ollama** | `最新版` | （可选）若使用本地向量检索，需要安装并在本地跑 Embedding 模型（如 `nomic-embed-text`）。 |

---

## 🐳 2. 获取云龙虾镜像

系统会自动检测并拉取云龙虾（OpenClaw）镜像。为了加速拉起速度，建议在部署前手动在终端执行：

```bash
docker pull ghcr.io/openclaw/openclaw:latest
```

> 💡 **国内镜像加速提示**：如果拉取 `ghcr.io` 镜像缓慢，可为 Docker 配置国内 Registry 镜像加速器（如阿里云、腾讯云等镜象加速）。

---

## ⚙️ 3. 配置环境变量

后端服务依赖于根目录下 `server/.env` 配置文件（如不存在，可从 `.env.example` 复制一份）。

请确保添加并配置了以下环境变量：

```ini
# server/.env

# 1. 基础大模型配置 (以阿里通义千问为例)
AI_API_KEY=your_dashscope_api_key
AI_API_BASE=https://coding.dashscope.aliyuncs.com/v1
AI_MODEL=qwen3.7-plus

# 2. 本地 Embedding (Ollama) 配置
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_API_BASE=http://localhost:11434/v1

# 3. Redis 配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# 4. 云龙虾 (OpenClaw) 容器专有配置 (重点)
# 指定运行云龙虾容器所使用的 Docker 镜像
OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:latest

# 容器数据在宿主机的持久化挂载根路径 (请务必使用绝对路径)
# 该目录下会为每个用户创建子目录（如 user_acba852e-xxx），用于持久化保存 openclaw.json 配置、对话历史及工作区代码文件
OPENCLAW_SHARED_DATA_DIR=/Users/your_username/Desktop/code/wanju/data/openclaw
```

> ⚠️ **macOS 用户重要提示**：请确保指定的 `OPENCLAW_SHARED_DATA_DIR` 所在的物理路径，已经在 **Docker Desktop -> Settings -> Resources -> File sharing** 的共享目录列表中（macOS 默认允许挂载 Desktop、Documents 等个人目录，如果是自定义系统目录，需手动在 Docker 中添加授权，否则容器拉起时会因挂载权限不足报错）。

---

## 🚀 4. 一键环境自检与启动

项目提供了封装好的自动化环境自检与启动脚本 `start.sh`。它会自动对系统运行所需的所有第三方依赖、端口、网络镜像以及 node 包版本进行全面诊断：

```bash
# 1. 赋予启动脚本执行权限
chmod +x start.sh

# 2. 运行自检并启动服务
./start.sh
```

> 💡 **无人值守/自动确认模式**：如果希望脚本在检测到 node_modules 缺失时自动进行 `npm install`，或是自动复制配置模板，可运行：
> ```bash
> ./start.sh -y
> ```

### 🔍 脚本执行的 6 大校验步骤：
1. **基础工具**：校验 Node.js 版本（是否 $\ge 20$）与 npm 命令行工具是否存在。
2. **Docker 服务**：校验 Docker CLI 以及 Docker Daemon 守护进程是否已正常运行。
3. **参数配置**：校验 `server/.env` 是否存在，大模型 API KEY 是否已填写，共享挂载路径 `OPENCLAW_SHARED_DATA_DIR` 是否合法并自动创建缺失目录。
4. **三方连通性**：通过 `nc` 连通性探测本地 Redis（`6379`）与本地 Ollama（`11434`）服务。
5. **容器镜像**：检测本地是否已就绪指定的 OpenClaw Docker 镜像，缺失时可引导自动拉取。
6. **项目包依赖**：检测前后端依赖 `node_modules` 存在性，并在缺失时引导自动一键安装。

自检完全通过后，脚本将自动在后台并发启动前端 (Vite) 与后端 (Midway.js) 开发服务器。实时日志输出会附加彩色前缀区分。使用 **`Ctrl+C`** 终止脚本运行时，它会捕获信号并优雅关闭全部子进程，确保不会残留端口占用。

---

## 🛑 5. 暂停 (Pause) 与销毁 (Destroy) 机制

系统针对云龙虾（OpenClaw）容器会话提供两个生命周期控制操作：

1. **暂停实例 (Pause)**：
   - 行为：调用 `/api/openclaw/stop` 接口，停止并注销 Docker 容器。
   - 数据影响：**保留**挂载目录下的全部数据（包括 `sessions.json` 历史及工作区代码）。下一次点击“启动”时，新容器会挂载相同目录并秒级**恢复历史对话**。
2. **销毁实例 (Destroy)**：
   - 行为：调用 `/api/openclaw/destroy` 接口，停止容器并**强力物理清空**宿主机上该用户的持久化数据文件夹。
   - 数据影响：**删除**所有聊天历史、配置和代码文件。新开启的会话将是一个完全干净的初始沙箱环境。

---

## 🔍 6. 常见问题排错 (Troubleshooting)

### Q1：点击“一键启动云龙虾”后控制台显示“容器引导异常”？
- **检查 1**：确保宿主机的 Docker Daemon 已经启动。可以在终端运行 `docker ps` 来确认。
- **检查 2**：检查 `server/.env` 中的 `OPENCLAW_SHARED_DATA_DIR` 是否为合法且存在的绝对路径。
- **检查 3**：如果是 macOS/Linux，检查是否有向该持久化目录写入的权限。

### Q2：提示“DataSource undefined not found...”报错？
- 该错误是由于 TypeORM 初始化失败导致。请确认本地的 Redis 服务已经启动（执行 `redis-cli ping` 应当返回 `PONG`），且 `server/data/customer-service.db` SQLite 数据库路径具有读写权限。

### Q3：为什么刷新页面后，有时候对话气泡会卡一下？
- 这是正常现象。因为刷新页面后 Zustand 内存状态重置，前端 WebSocket 重新与后端建立通道。
- 后端网关（`OpenClawGateway`）会对消息进行排队，等待容器鉴权挑战（`connect.challenge`）握手成功后自动 Flush 暂存的 `chat.history` 指令，从而在 50ms~150ms 内瞬间重构并展现历史。

### Q4：多标签页打开同一个用户的云龙虾控制台，连接断开？
- 为了保证同一个 Agent 运行时状态的唯一性，网关层实现了 **Owner Takeover (抢占接管)** 逻辑。
- 在新标签页打开时，旧标签页的连接会收到 `SUPERSEDED` 事件，连接自动切断并变为警告横幅。可随时在新标签页上控制，或在旧标签页点击“夺回连接”切回控制。
