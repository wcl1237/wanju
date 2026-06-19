##############################################
# Stage 1 — Build
##############################################
FROM node:20-slim AS builder

WORKDIR /build

# 安装依赖
COPY package.json package-lock.json* ./
RUN npm install

# 拷贝源码并编译
COPY tsconfig.json ./
COPY src/ ./src/
COPY bootstrap.js ./

RUN npx tsc

##############################################
# Stage 2 — Runtime
##############################################
FROM node:20-slim

# 安装必要的系统工具
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    jq \
    ripgrep \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# 创建非 root 用户
RUN groupadd -r agent && useradd -r -g agent -m -s /bin/bash agent

WORKDIR /app

# 从 builder 阶段拷贝 node_modules 和编译产物
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/bootstrap.js ./
COPY --from=builder /build/package.json ./

# 创建工作空间挂载点
RUN mkdir -p /workspace/.code-agent && chown -R agent:agent /workspace
RUN chown -R agent:agent /app

USER agent

# 环境变量
ENV NODE_ENV=production
ENV PORT=8765
ENV WORKSPACE_DIR=/workspace
ENV LOG_LEVEL=info

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

EXPOSE 8765

CMD ["node", "bootstrap.js"]
