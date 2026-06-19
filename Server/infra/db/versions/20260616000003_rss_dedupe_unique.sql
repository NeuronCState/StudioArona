-- 20260616000003 — RSS 去重硬化
-- 目的: 让 rss::persist_items 的 ON CONFLICT (feed_id, link) DO NOTHING 真正生效.
--      之前用 SELECT+INSERT 有竞态 + 性能差.
--
-- 注意: link 可空, 唯一约束对 NULL 不生效 (PG 默认行为),
--       所以多个 link=NULL 的 items 仍能插入. 这是有意的: 没 link 的 items 没有自然 key.

-- 1. 先删已有重复行, 保留最早一条
DELETE FROM feed_items a
USING feed_items b
WHERE a.feed_id = b.feed_id
  AND a.link IS NOT NULL
  AND a.link = b.link
  AND a.created_at > b.created_at;

-- 2. 加唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_items_feed_link
    ON feed_items (feed_id, link)
    WHERE link IS NOT NULL;
