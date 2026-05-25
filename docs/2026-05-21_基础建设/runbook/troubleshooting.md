# 故障排查 Runbook

## 常见问题

### 1. 容器启动失败

```bash
# 查看日志
docker compose -f infra/compose/docker-compose.prod.yml logs api-gateway

# 常见原因:
# - 数据库未就绪 → 等待 PG healthcheck 通过
# - 环境变量缺失 → 检查 .env.production
# - 端口冲突 → 检查 8080/5432/6379 是否被占用
```

### 2. 数据库连接失败

```bash
# 检查 PG 状态
docker compose -f infra/compose/docker-compose.prod.yml exec postgres pg_isready

# 检查连接数
docker compose -f infra/compose/docker-compose.prod.yml exec postgres \
  psql -U javis -c "SELECT count(*) FROM pg_stat_activity;"

# 常见原因:
# - 连接池耗尽 → 增加 DB_POOL_SIZE
# - PG 崩溃 → 检查 PG 日志，可能需要恢复备份
```

### 3. JWT 认证失败

```bash
# 检查 JWT_SECRET 是否一致
grep JWT_SECRET .env.production

# 常见原因:
# - Secret 不匹配 → 所有服务用同一个 secret
# - Token 过期 → 调用 /api/auth/refresh
# - 时钟偏差 → 同步 NTP
```

### 4. SSE 连接中断

```bash
# 检查 Nginx 超时配置
grep proxy_read_timeout infra/docker/nginx.conf

# 常见原因:
# - Nginx 超时 → 增加 proxy_read_timeout
# - Agent 崩溃 → 检查 agent 日志
# - 网络抖动 → 客户端自动重连
```

### 5. 上传失败

```bash
# 检查 Nginx 上传限制
grep client_max_body_size infra/docker/nginx.conf

# 常见原因:
# - 文件过大 → 检查 100MB 限制
# - 类型不允许 → 检查扩展名白名单
# - zip bomb → 检查解压大小限制
```

## 日志查看

```bash
# 实时日志
docker compose -f infra/compose/docker-compose.prod.yml logs -f api-gateway

# 搜索错误
docker compose -f infra/compose/docker-compose.prod.yml logs api-gateway | grep ERROR

# 审计日志
docker compose -f infra/compose/docker-compose.prod.yml exec postgres \
  psql -U javis -d javis -c "SELECT * FROM audit_log ORDER BY ts DESC LIMIT 20;"
```

## 性能排查

```bash
# 容器资源使用
docker stats

# 数据库慢查询
docker compose -f infra/compose/docker-compose.prod.yml exec postgres \
  psql -U javis -d javis -c "
    SELECT query, calls, mean_exec_time, total_exec_time
    FROM pg_stat_statements
    ORDER BY mean_exec_time DESC LIMIT 10;
  "

# Redis 内存
docker compose -f infra/compose/docker-compose.prod.yml exec redis redis-cli info memory
```
