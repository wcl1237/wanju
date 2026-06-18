---
name: start-app
description: 启动并检测 Wanju (智能客服系统) 与 OpenClaw 的前后端项目。当用户提出"启动项目"、"运行服务"、"一键启动"、"启动前后端"、"环境自检"、"start app"、"run project"时使用此技能。
---

# WanJu 智能客服系统一键启动技能

本技能主要用于引导和管理 WanJu 系统的本地开发环境检测与前后端并发拉起。

## 🎯 触发场景
- 当用户要求运行、启动或调试前后端项目时。
- 当用户遇到本地 Docker、Redis 或 Ollama 相关的环境连接报错，需要对系统依赖进行体检时。

## 🛠️ 使用方法
在工作空间根目录下，使用终端运行封装好的一键启动脚本：

```bash
./start.sh
```

对于无人值守的自动化运行，可以附加参数自动跳过交互确认（默认全选 yes）：
```bash
./start.sh -y
# 或
./start.sh --yes
```

## 🔍 检测项目与解决指南

如果在运行 `./start.sh` 阶段遇到 `✘` 检测不通过，请按以下指导解决：

### 1. 基础环境错误
* **Node.js 版本不符**：
  - 错误提示：`Node.js 版本不符: 当前 vXX.x，系统需要 ≥ 20.x`
  - 解决办法：建议使用 `nvm` 切换或重新下载最新 LTS 版本的 Node.js。
* **Docker 未运行**：
  - 错误提示：`Docker CLI 已安装，但 Docker Daemon 未启动`
  - 解决办法：双击打开本地的 **Docker Desktop**，等待系统托盘的 Docker 图标变绿。

### 2. 配置文件与密钥
* **未找到 server/.env 文件**：
  - 错误提示：`未找到后端配置文件 server/.env`
  - 解决办法：脚本会自动引导复制模板。若手动创建，请在 `server/` 目录下复制 `.env.example` 并重命名为 `.env`。
* **AI_API_KEY 未配置**：
  - 错误提示：`AI_API_KEY 未配置或使用了默认占位符`
  - 解决办法：打开 `server/.env`，将 `AI_API_KEY` 的值替换为您真实的通义千问（DashScope）API 密钥。

### 3. 三方依赖服务
* **Redis 连不通**：
  - 错误提示：`Redis 服务不可达 (127.0.0.1:6379)`
  - 解决办法：确保本地安装了 Redis 并已启动。可以使用命令 `brew services start redis` (macOS) 或 `docker run -d -p 6379:6379 redis:alpine` 拉起一个临时的 Redis 实例。

### 4. 容器沙箱镜像
* **未检测到 OpenClaw 镜像**：
  - 提示：`本地未检测到 OpenClaw 镜像: ghcr.io/openclaw/openclaw:latest`
  - 解决办法：接受脚本的自动下载，或者手动执行：
    ```bash
    docker pull ghcr.io/openclaw/openclaw:latest
    ```

## 🚀 启动表现
当检测完全通过且 `node_modules` 安装完毕后，脚本会并行启动后端与前端：
- **后端服务** (Midway.js): 以紫色前缀 `[Backend]` 输出日志，监听端口 `7001`。
- **前端服务** (Vite + React): 以青色前缀 `[Frontend]` 输出日志，监听端口 `5173`。

使用 **`Ctrl+C`** 终止脚本运行，会安全地自动清理这两个子进程，无需担心端口残留占用。
