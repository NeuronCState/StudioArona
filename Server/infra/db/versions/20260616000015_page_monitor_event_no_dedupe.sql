-- H2 修复: page_monitor_events 去掉 (monitor_id, content_hash) UNIQUE.
--
-- 旧设计: UNIQUE 让"同一 hash 出现第二次"被 ON CONFLICT DO NOTHING 吞掉, 不插事件.
-- 配合 cron.rs:160-164 在 hash 已存在分支 commit 不动 last_hash, 产生两个 bug:
--   1. A→B→A→B 第二次 B 仍触发 changed (因为 last_hash 没推进)
--   2. 状态转换审计日志丢失 (A→B→A 是 2 个 transition, 但 events 只插 1 个)
--
-- 修复: 去掉 UNIQUE, 每次真实状态转换 (last_hash != current) 都插事件 + 推进
-- last_hash + last_checked_at. events 表变成 transition log.

ALTER TABLE page_monitor_events DROP CONSTRAINT IF EXISTS page_monitor_events_monitor_id_content_hash_key;
