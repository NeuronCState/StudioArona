# 凭据轮换 Runbook

## 需要轮换的凭据

| 凭据 | 位置 | 轮换周期 | 风险 |
|------|------|----------|------|
| JWT_SECRET | .env.production | 每 6 个月 | 所有用户需重新登录 |
| PG_PASSWORD | .env.production + docker-compose | 每 6 个月 | 需同步所有服务 |
| MINIMAX_API_KEY | GitHub Secrets + .env.production | 每 3 个月 | LLM 服务中断 |
| GitHub Actions SSH key | GitHub Secrets | 每 6 个月 | CI/CD 中断 |

## JWT_SECRET 轮换

```bash
# 1. 生成新 secret
NEW_SECRET=$(openssl rand -hex 32)
echo "新 JWT_SECRET: $NEW_SECRET"

# 2. 更新 .env.production
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" .env.production

# 3. 滚动重启（所有服务同时生效）
docker compose -f infra/compose/docker-compose.prod.yml restart api-gateway

# 4. 通知用户需要重新登录
```

## PostgreSQL 密码轮换

```bash
# 1. 生成新密码
NEW_PASS=$(openssl rand -base64 24)

# 2. 修改 PG 密码
docker compose -f infra/compose/docker-compose.prod.yml exec postgres \
  psql -U javis -c "ALTER USER javis PASSWORD '$NEW_PASS';"

# 3. 更新 .env.production
sed -i "s/PG_PASSWORD=.*/PG_PASSWORD=$NEW_PASS/" .env.production
sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql+asyncpg://javis:$NEW_PASS@postgres:5432/javis|" .env.production

# 4. 滚动重启所有服务
docker compose -f infra/compose/docker-compose.prod.yml restart
```

## MiniMax API Key 轮换

```bash
# 1. 在 MiniMax 控制台生成新 key
# 2. 更新 GitHub Secrets: MINIMAX_API_KEY
# 3. 更新 .env.production
# 4. 重启 agent 服务
docker compose -f infra/compose/docker-compose.prod.yml restart agent
```

## 轮换后验证

```bash
# JWT 验证
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# PG 验证
docker compose -f infra/compose/docker-compose.prod.yml exec postgres \
  psql -U javis -d javis -c "SELECT 1;"

# LLM 验证（如果有 key）
curl -X POST http://localhost:8080/api/chat/sessions \
  -H "Authorization: Bearer <token>"
```

## 紧急轮换（凭据泄露）

```bash
# 1. 立即轮换泄露的凭据
# 2. 检查审计日志是否有异常访问
docker compose -f infra/compose/docker-compose.prod.yml exec postgres \
  psql -U javis -d javis -c "
    SELECT * FROM audit_log
    WHERE ts > now() - interval '24 hours'
    ORDER BY ts DESC;
  "
# 3. 通知全员
# 4. 如果是 JWT 泄露，强制所有用户重新登录
```
