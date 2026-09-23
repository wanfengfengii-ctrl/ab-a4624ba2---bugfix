# syntax=docker/dockerfile:1

# ---- 构建阶段：单元测试 + 类型检查 + 静态产物 ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- 测试阶段：verify 一次性服务使用 ----
FROM node:22-alpine AS test
WORKDIR /app
# wget 供冒烟脚本使用（alpine 自带 busybox wget，显式安装保证可用）
RUN apk add --no-cache wget
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# verify 服务在 compose 中覆盖 command；默认直接给出失败提示，避免误当常驻服务
CMD ["sh", "-c", "echo '请通过 docker compose run --rm verify（或 docker compose up）运行一次性校验' && exit 2"]

# ---- 运行阶段：纯静态站点 ----
FROM nginx:1.27-alpine AS runtime
# 健康检查通过 wget 访问站内端点，显式提供该运行时依赖。
RUN apk add --no-cache wget
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=5 \
  CMD wget -q -O - http://localhost/healthz || exit 1
