# 部署 Runbook

## 前置条件

- Ubuntu 主机已安装 Docker + Docker Compose
- 已配置 `.env.production`
- 已构建并推送镜像到 registry（或本地 load）

## 部署步骤

```bash
# 1. 拉取最新代码
cd /opt/studio-javis
git fetch origin --tags

# 2. 部署指定版本
bash infra/scripts/deploy-linux.sh v0.1.0
```

## 部署脚本内部流程

1. `git checkout <tag>` — 切到目标版本
2. `docker compose pull` — 拉取镜像
3. `alembic upgrade head` — 跑数据库迁移
4. `docker compose up -d` — 启动所有服务
5. `healthcheck.sh` — 验证服务健康
6. 健康检查失败 → 自动回滚

## 手动部署（不用脚本）

```bash
# 构建镜像（Mac 交叉编译 linux/amd64）
docker buildx build --platform linux/amd64 \
  -f infra/docker/Dockerfile.api-gateway \
  -t studio-javis/api-gateway:v0.1.0 .

# 传输到 Linux
scp dist/*.tar javis@<host>:/opt/staging/
ssh javis@<host> "docker load -i /opt/staging/api-gateway.tar"

# 启动
ssh javis@<host> "cd /opt/studio-javis && \
  IMAGE_TAG=v0.1.0 docker compose -f infra/compose/docker-compose.prod.yml up -d"
```

## 验证

```bash
# 检查容器状态
docker compose -f infra/compose/docker-compose.prod.yml ps
# 期望: 6 个容器全部 healthy

# 检查 API
curl -s http://localhost:8080/health
# 期望: {"status":"ok","service":"api-gateway"}

# 检查前端
curl -s -o /dev/null -w "%{http_code}" http://localhost
# 期望: 200
```
