-- Studio Arona v3 — P2#1: page_monitor 分布式租约.
-- 单实例部署不强制需要 (DEPLOY.md §2.1), 但为未来多实例迁移预留钩子.
-- claim 窗口: 默认 10 min. 一个 instance 领到 monitor 后, 在窗口内不会被其他 instance
-- 重复领取. 处理完成 (成功/失败) 后, claimed_until 自动过期, 下个 tick 可重领.
-- 注意: claimed_until 只阻止并发领取, 不阻止失败重试 — claim_at < NOW() - claim_window
-- 视为 lease 失效, 可被任何 worker 重新领取.

ALTER TABLE page_monitors
    ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS claimed_by    TEXT;

-- 部分索引: 只索引 "enabled + due + 未被持有" 的活跃 monitor, 加快 cron 拉取.
-- claimed_until 为 NULL 或已过期 → 可被领取.
-- 注: PG 要求 partial index 的 WHERE 谓词用 IMMUTABLE 函数, NOW() 不是 IMMUTABLE.
-- 这里用普通 (enabled, last_checked_at) index + 应用层 WHERE claimed_until IS NULL OR claimed_until <= NOW() 过滤.
CREATE INDEX IF NOT EXISTS idx_page_monitors_claim_due
    ON page_monitors(enabled, last_checked_at);

-- 现有 page_monitor 的 claimed_until 保持 NULL (未持有), 不会影响现有行为.
