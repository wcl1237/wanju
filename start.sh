#!/usr/bin/env bash

# ==============================================================================
# WanJu (智能客服系统) & OpenClaw 一键启动与环境检测脚本
# 支持彩色控制台输出、非交互式运行、依赖自动检测、镜像自动检测与优雅的子进程退出管理。
# ==============================================================================

set -o pipefail

# 彩色输出颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# 状态标识
T_OK="${GREEN}✔${NC}"
T_ERR="${RED}✘${NC}"
T_WARN="${YELLOW}⚠${NC}"
T_INFO="${BLUE}ℹ${NC}"

# 是否是非交互模式 (-y 或 --yes 触发)
NON_INTERACTIVE=false
for arg in "$@"; do
  if [ "$arg" = "-y" ] || [ "$arg" = "--yes" ] || [ "$arg" = "--non-interactive" ]; then
    NON_INTERACTIVE=true
  fi
done

# 错误计数器
BLOCKED_ERRORS=0
WARNINGS=0

# 记录函数
log_info() { echo -e "${T_INFO} $1"; }
log_success() { echo -e "${T_OK} $1"; }
log_warn() { echo -e "${T_WARN} $1"; WARNINGS=$((WARNINGS + 1)); }
log_error() { echo -e "${T_ERR} ${RED}$1${NC}"; BLOCKED_ERRORS=$((BLOCKED_ERRORS + 1)); }
log_step() { echo -e "\n${BOLD}${BLUE}==>${NC} ${BOLD}$1${NC}"; }

# Banner 打印
print_banner() {
  echo -e "${CYAN}"
  echo -e "===================================================================="
  echo -e "      🤖  WanJu (智能客服系统) & OpenClaw 本地一键启动脚本  🤖"
  echo -e "===================================================================="
  echo -e "${NC}"
}

# 询问函数
ask_confirm() {
  local prompt_msg=$1
  if [ "$NON_INTERACTIVE" = true ]; then
    return 0
  fi
  read -p "$(echo -e "${YELLOW}${T_WARN} ${prompt_msg} (y/n): ${NC}")" choice
  case "$choice" in 
    y|Y|yes|YES ) return 0;;
    * ) return 1;;
  esac
}

# 提取 env 配置值的辅助函数
get_env_val() {
  local key=$1
  local file=$2
  if [ -f "$file" ]; then
    grep -E "^${key}=" "$file" | head -n 1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
  fi
}

# 检查端口是否开放
check_port() {
  local host=$1
  local port=$2
  local timeout=$3
  nc -z -w "$timeout" "$host" "$port" >/dev/null 2>&1
}

# 1. 主流程开始
print_banner

# ------------------------------------------------------------------------------
# 步骤 1: 检测核心开发工具
# ------------------------------------------------------------------------------
log_step "步骤 1: 检测本地开发环境与基础命令"

# Node.js 检测
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    log_success "Node.js 版本检测通过: v$NODE_VER (需要 ≥ 20.x)"
  else
    log_error "Node.js 版本不符: 当前 v$NODE_VER，系统需要 ≥ 20.x"
  fi
else
  log_error "未检测到 Node.js，请先安装 Node.js (≥ 20.x)"
fi

# npm 检测
if command -v npm >/dev/null 2>&1; then
  NPM_VER=$(npm -v)
  log_success "npm 工具检测通过: v$NPM_VER"
else
  log_error "未检测到 npm，请确保 npm 与 Node.js 已正确安装"
fi

# Docker 检测
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    log_success "Docker Desktop / Daemon 正在运行"
  else
    log_error "Docker CLI 已安装，但 Docker Daemon 未启动，请打开 Docker Desktop 运行之"
  fi
else
  log_error "未检测到 Docker，系统需要 Docker 以运行 OpenClaw 容器沙箱，请先安装 Docker Desktop"
fi

# ------------------------------------------------------------------------------
# 步骤 2: 配置文件检测与解析
# ------------------------------------------------------------------------------
log_step "步骤 2: 校验配置文件与参数配置"

ENV_FILE="server/.env"
ENV_EXAMPLE="server/.env.example"
ENV_COPY="server/.env.copy"

if [ ! -f "$ENV_FILE" ]; then
  log_warn "未找到后端配置文件 server/.env"
  if [ -f "$ENV_EXAMPLE" ] || [ -f "$ENV_COPY" ]; then
    TARGET_SRC=""
    [ -f "$ENV_COPY" ] && TARGET_SRC="$ENV_COPY" || TARGET_SRC="$ENV_EXAMPLE"
    if ask_confirm "是否自动从 $TARGET_SRC 复制一份作为 server/.env ？"; then
      cp "$TARGET_SRC" "$ENV_FILE"
      log_success "成功创建配置文件: server/.env"
    else
      log_error "需要 server/.env 配置文件以运行后端，请根据模板创建后再行启动"
    fi
  else
    log_error "无法找到 server/.env.example 模板，请确认项目源码完整度"
  fi
else
  log_success "已找到后端配置文件 server/.env"
fi

# 只有在 .env 文件存在时，才进行详细配置项检验
if [ -f "$ENV_FILE" ]; then
  # 校验大模型 KEY
  AI_API_KEY=$(get_env_val "AI_API_KEY" "$ENV_FILE")
  if [ -z "$AI_API_KEY" ] || [ "$AI_API_KEY" = "your_dashscope_api_key" ]; then
    log_error "AI_API_KEY 未配置或使用了默认占位符，请配置阿里通义千问 API 密钥"
  else
    # 遮掩显示 API KEY 保护隐私
    MASKED_KEY="${AI_API_KEY:0:6}******${AI_API_KEY: -4}"
    log_success "大模型 API 配置检测通过: KEY = $MASKED_KEY"
  fi

  # 校验 OpenClaw 持久化目录
  OPENCLAW_SHARED_DATA_DIR=$(get_env_val "OPENCLAW_SHARED_DATA_DIR" "$ENV_FILE")
  if [ -z "$OPENCLAW_SHARED_DATA_DIR" ]; then
    log_error "OPENCLAW_SHARED_DATA_DIR 未配置，这会导致云龙虾挂载持久化路径异常"
  elif [[ ! "$OPENCLAW_SHARED_DATA_DIR" =~ ^/ ]]; then
    log_error "OPENCLAW_SHARED_DATA_DIR 必须配置为【绝对路径】，当前配置为: $OPENCLAW_SHARED_DATA_DIR"
  else
    if [ ! -d "$OPENCLAW_SHARED_DATA_DIR" ]; then
      log_info "配置目录不存在，正在尝试自动创建: $OPENCLAW_SHARED_DATA_DIR"
      mkdir -p "$OPENCLAW_SHARED_DATA_DIR" >/dev/null 2>&1
      if [ $? -eq 0 ]; then
        log_success "共享数据目录已自动创建: $OPENCLAW_SHARED_DATA_DIR"
      else
        log_error "创建挂载目录失败，请检查写入权限: $OPENCLAW_SHARED_DATA_DIR"
      fi
    else
      log_success "共享数据目录验证成功: $OPENCLAW_SHARED_DATA_DIR"
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 步骤 3: 检测第三方依赖服务连通性
# ------------------------------------------------------------------------------
log_step "步骤 3: 连通性检测 (Redis, Ollama)"

if [ -f "$ENV_FILE" ]; then
  # Redis 探测
  REDIS_HOST=$(get_env_val "REDIS_HOST" "$ENV_FILE")
  REDIS_PORT=$(get_env_val "REDIS_PORT" "$ENV_FILE")
  : ${REDIS_HOST:="127.0.0.1"}
  : ${REDIS_PORT:="6379"}

  if check_port "$REDIS_HOST" "$REDIS_PORT" 2; then
    log_success "Redis 服务连接成功: $REDIS_HOST:$REDIS_PORT"
  else
    log_error "Redis 服务不可达 ($REDIS_HOST:$REDIS_PORT)。请确保 Redis 已启动并运行"
  fi

  # Ollama 探测 (可选配置)
  EMBEDDING_API_BASE=$(get_env_val "EMBEDDING_API_BASE" "$ENV_FILE")
  if [ -n "$EMBEDDING_API_BASE" ]; then
    # 解析 host 和 port，默认 Ollama 服务在 11434 端口
    OLLAMA_HOST=$(echo "$EMBEDDING_API_BASE" | awk -F[/:] '{print $4}')
    OLLAMA_PORT=$(echo "$EMBEDDING_API_BASE" | awk -F[/:] '{print $5}')
    : ${OLLAMA_HOST:="localhost"}
    : ${OLLAMA_PORT:="11434"}

    # 仅当是在本地运行时才探活，避免外部 API 服务被防火墙拦截报错
    if [ "$OLLAMA_HOST" = "localhost" ] || [ "$OLLAMA_HOST" = "127.0.0.1" ]; then
      if check_port "$OLLAMA_HOST" "$OLLAMA_PORT" 2; then
        log_success "Ollama 本地 Embedding 服务连接成功: $OLLAMA_HOST:$OLLAMA_PORT"
      else
        log_warn "Ollama 本地服务未运行 ($OLLAMA_HOST:$OLLAMA_PORT)，若您不需要本地向量检索可以忽略此项"
      fi
    else
      log_info "Ollama 配置了外部地址 $EMBEDDING_API_BASE，跳过本地存活检测"
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 步骤 4: 依赖镜像检测
# ------------------------------------------------------------------------------
log_step "步骤 4: 校验 OpenClaw Docker 镜像"

if [ -f "$ENV_FILE" ] && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  OPENCLAW_IMAGE=$(get_env_val "OPENCLAW_IMAGE" "$ENV_FILE")
  : ${OPENCLAW_IMAGE:="ghcr.io/openclaw/openclaw:latest"}

  log_info "检测本地 OpenClaw 镜像: $OPENCLAW_IMAGE ..."
  IMAGE_EXISTS=$(docker images -q "$OPENCLAW_IMAGE" 2>/dev/null)
  
  if [ -n "$IMAGE_EXISTS" ]; then
    log_success "OpenClaw Docker 镜像已就绪"
  else
    log_warn "本地未检测到 OpenClaw 镜像: $OPENCLAW_IMAGE"
    if ask_confirm "是否现在通过 Docker 拉取该镜像？这需要一些网络带宽"; then
      log_info "开始拉取镜像 $OPENCLAW_IMAGE ..."
      docker pull "$OPENCLAW_IMAGE"
      if [ $? -eq 0 ]; then
        log_success "镜像拉取成功！"
      else
        log_error "镜像拉取失败，请检查网络或配置国内 Docker 加速源"
      fi
    else
      log_warn "建议启动前手动执行: docker pull $OPENCLAW_IMAGE"
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 汇总检测结果
# ------------------------------------------------------------------------------
echo -e "\n--------------------------------------------------------------------"
if [ "$BLOCKED_ERRORS" -gt 0 ]; then
  echo -e "${RED}${BOLD}检测未通过！共发现 $BLOCKED_ERRORS 个阻断性问题，请根据上方的红色 ${T_ERR} 提示进行修复后再启动。${NC}"
  [ "$WARNINGS" -gt 0 ] && echo -e "${YELLOW}另有 $WARNINGS 个非阻断性警告提示。${NC}"
  echo -e "--------------------------------------------------------------------"
  exit 1
else
  echo -e "${GREEN}${BOLD}检测通过！一切已就绪。${NC}"
  [ "$WARNINGS" -gt 0 ] && echo -e "${YELLOW}注意：有 $WARNINGS 个非阻断性警告提示，可能影响可选功能。${NC}"
  echo -e "--------------------------------------------------------------------"
fi

# ------------------------------------------------------------------------------
# 步骤 5: Node 包依赖检测与安装
# ------------------------------------------------------------------------------
log_step "步骤 5: 校验前后端 node_modules 依赖"

NEED_INSTALL_SERVER=false
NEED_INSTALL_WEB=false

if [ ! -d "server/node_modules" ]; then
  NEED_INSTALL_SERVER=true
  log_warn "后端依赖未安装 (未找到 server/node_modules)"
fi

if [ ! -d "web/node_modules" ]; then
  NEED_INSTALL_WEB=true
  log_warn "前端依赖未安装 (未找到 web/node_modules)"
fi

if [ "$NEED_INSTALL_SERVER" = true ] || [ "$NEED_INSTALL_WEB" = true ]; then
  if ask_confirm "是否需要一键安装缺失的依赖包？"; then
    if [ "$NEED_INSTALL_SERVER" = true ]; then
      log_info "正在安装后端依赖包..."
      (cd server && npm install)
      if [ $? -eq 0 ]; then
        log_success "后端依赖包安装完成"
      else
        log_error "后端依赖安装失败，请手动在 server 目录下运行 npm install"
        exit 1
      fi
    fi

    if [ "$NEED_INSTALL_WEB" = true ]; then
      log_info "正在安装前端依赖包..."
      (cd web && npm install)
      if [ $? -eq 0 ]; then
        log_success "前端依赖包安装完成"
      else
        log_error "前端依赖安装失败，请手动在 web 目录下运行 npm install"
        exit 1
      fi
    fi
  else
    log_error "启动由于缺少必要的依赖包而中断。请手动运行 npm install 后重试"
    exit 1
  fi
else
  log_success "前后端依赖包均已就绪"
fi

# ------------------------------------------------------------------------------
# 步骤 6: 启动前后端服务
# ------------------------------------------------------------------------------
log_step "步骤 6: 启动开发服务"
log_info "正在并行拉起前端和后端服务..."
log_info "您可以使用 Ctrl+C 随时安全关闭所有服务"

# 优雅退出的清理逻辑
cleanup() {
  echo -e "\n\n${YELLOW}${T_WARN} 收到关闭信号，正在停止前后端开发服务...${NC}"
  # 终止我们的子进程
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  log_success "服务已安全退出。"
  exit 0
}

# 监听信号
trap cleanup SIGINT SIGTERM EXIT

# 启动后端 (紫色前缀)
(cd server && npm run dev 2>&1) | sed $'s/^/\x1b[35m[Backend]\x1b[0m /' &
BACKEND_PID=$!

# 启动前端 (青色前缀)
(cd web && npm run dev 2>&1) | sed $'s/^/\x1b[36m[Frontend]\x1b[0m /' &
FRONTEND_PID=$!

# 保持前台等待
wait "$BACKEND_PID" "$FRONTEND_PID"
