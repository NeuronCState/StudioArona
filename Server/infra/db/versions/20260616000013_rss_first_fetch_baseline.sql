-- F1 修复: RSS 首次抓取 baseline — feeds 加 last_checked_at 列.
-- process_one 检查该列: NULL = 从未抓取, 这次只 persist 不通知不发事件;
-- 非 NULL = 已经建立 baseline, 后续新增条目正常通知.
--
-- 现有 feed 历史: 上一次抓取算"已 baseline", 直接 backfill = NOW(), 不重发历史通知.

ALTER TABLE feeds
    ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_checked_items_count INT NOT NULL DEFAULT 0;

-- Backfill: 把所有现有 feed 标成"已 baseline", 避免升级后第一次抓取被误判为首次.
UPDATE feeds SET last_checked_at = NOW() WHERE last_checked_at IS NULL;
