# 回滚 Runbook

## 快速回滚

```bash
bash infra/scripts/rollback.sh v0.0.9
```

## 回滚流程

1. `git checkout <tag>` — 切到上一个稳定版本
2. `docker compose up -d` — 重启服务（使用旧镜像）
3. 检查是否有不可逆迁移（标记为 `IRREVERSIBLE`）

## 数据库回滚

### 可逆迁移

```bash
# 回滚一个迁移版本
uv run alembic -c alembic.ini downgrade -1

# 回滚到指定版本
uv run alembic -c alembic.ini downgrade <revision>
```

### 不可逆迁移

如果迁移标记为 `IRREVERSIBLE`，必须从备份恢复：

```bash
# 1. 找到最近的备份
ls -lt /opt/studio-javis/backups/

# 2. 恢复
bash infra/scripts/restore.sh /opt/studio-javis/backups/javis_20260521_030000.sql.gz
```

## 回滚后验证

```bash
# 容器状态
docker compose -f infra/compose/docker-compose.prod.yml ps

# API 健康
curl http://localhost:8080/health

# 前端可访问
curl -s -o /dev/null -w "%{http_code}" http://localhost

# 数据库连接
docker compose -f infra/compose/docker-compose.prod.yml exec postgres \
  psql -U javis -d javis -c "SELECT count(*) FROM users;"
```

## 回滚决策树

```
问题发现
  ├─ API 返回 500 → 检查日志 → 代码 bug → 回滚代码
  ├─ 数据库报错 → 检查迁移 → 回滚迁移 + 代码
  ├─ 前端白屏 → 检查 Nginx → 回滚 web 镜像
  └─ 性能下降 → 检查资源 → 扩容 / 回滚
```
