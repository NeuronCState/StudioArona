# ADR 0005: 存储瘦身 — 去 SQLite-FTS5，统一 PostgreSQL tsvector

## Context

02 规划书最初为 B 的短期记忆设计了 SQLite-FTS5 作为独立全文检索引擎，与 PostgreSQL 主库并行运行。实施中发现：

1. **双存储增加运维复杂度**：备份、迁移、CI 都需要处理两套存储
2. **SQLite-FTS5 与 PostgreSQL 数据不同步风险**：chat_messages 在 PG，全文索引在 SQLite，断电/崩溃后可能不一致
3. **PostgreSQL tsvector + GIN 已满足需求**：工作室场景的对话量级（< 10K 条/天），PG 全文搜索性能完全够用
4. **Docker 环境下 SQLite 文件持久化**需要额外 volume 管理

## Decision

**使用 PostgreSQL 内置 tsvector + GIN 索引替代 SQLite-FTS5**

### 方案

```sql
-- chat_messages 表增加 tsvector 列
ALTER TABLE chat_messages ADD COLUMN search_vector tsvector;

-- GIN 索引加速全文搜索
CREATE INDEX idx_chat_messages_search ON chat_messages USING GIN (search_vector);

-- 触发器：插入/更新时自动更新 tsvector
CREATE FUNCTION chat_messages_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_messages_search
  BEFORE INSERT OR UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION chat_messages_search_update();
```

### 搜索查询

```sql
SELECT *, ts_rank(search_vector, query) AS rank
FROM chat_messages
WHERE search_vector @@ plainto_tsquery('simple', '关键字')
ORDER BY rank DESC
LIMIT 20;
```

### 迁移策略

- `services/perception/` 中已有的 SQLite-FTS5 相关代码不删（C 的组件不强制重构）
- 新建 `infra/db/versions/002_tsvector_search.py` 添加 tsvector 列和索引
- B 的短期记忆模块直连 PG 查询，不经过 SQLite

## Consequences

### 正面
- 单一存储：备份/恢复/迁移只关注 PostgreSQL
- 数据一致性：chat_messages 和全文索引在同一事务中
- 运维简化：减少 Docker volume、CI 初始化步骤

### 负面
- 中文分词：`simple` 配置按空格分词，中文需额外处理（可用 `zhparser` 扩展或应用层分词）
- 性能天花板：单表千万级以上需考虑分区表或外部搜索引擎（当前不需）

### 中性
- C 的已有 SQLite-FTS5 代码保留不删，避免影响已完成功能
- 未来如需更强大的全文搜索，可升级为 Elasticsearch（不在 v0.1.0 范围）

## Alternatives considered

### A. 保留 SQLite-FTS5 + PostgreSQL（原方案）
- 优点：FTS5 对英文全文搜索成熟
- 缺点：双存储，备份/恢复/CI 复杂度翻倍
- 决定：放弃，工作室场景不需要双存储

### B. Elasticsearch
- 优点：分布式、中文分词好、性能上限高
- 缺点：增加 Java 依赖、内存占用高（>512MB）、运维重
- 决定：不采用，v0.1.0 过度工程

### C. pgvector + 语义搜索
- 优点：语义匹配
- 缺点：关键词精确搜索场景不如 FTS，需要 embedding 调用
- 决定：pgvector 用于长期记忆（见 ADR 0004），tsvector 用于关键词搜索，两者互补

## Refs
- [PostgreSQL Full Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- 02 规划书 §4.3（短期记忆）
- 05 冲刺计划 §2 不变量 #5
- `infra/db/versions/002_tsvector_search.py`（待创建）
