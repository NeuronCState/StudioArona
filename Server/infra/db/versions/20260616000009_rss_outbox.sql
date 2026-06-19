-- 20260616000009 — RSS guid / dedupe / outbox (P1#3 + P1#4)
--
-- 1. feed_items.guid — 没有 link 的 RSS item 也能稳定去重
--    现状: 只有 (feed_id, link) 的 partial unique index
--          没 link 的 items 永远插重复 → spec §6.2 失败
--    加 guid 字段 + partial unique index (feed_id, guid) WHERE guid IS NOT NULL
--    业务 fallback: 没 link 也没 guid → 用 sha256(title || published_at) 当 dedupe key
--
-- 2. feed_items.dedupe_key — 统一 dedupe hash (link / guid / title+pub 派生)
--    用于跨格式 (RSS 2.0 / Atom) 一致去重
--
-- 3. notification_outbox — 通知投递状态机
--    spec §6.4: "增加 outbox/notification delivery 状态，例如 pending、sent、failed、
--                 attempts、next_retry_at"
--    state machine: pending → sent → (终态) | failed → (终态 after N attempts)
--    attempts 自动累加, next_retry_at 用于指数退避
--    进程崩溃恢复: pending + next_retry_at <= NOW() 的会重新被 worker 拉起

ALTER TABLE feed_items
    ADD COLUMN IF NOT EXISTS guid TEXT,
    ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

-- RSS 2.0 / Atom 都有 link; partial index 匹配老 schema
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_items_feed_dedupe_key
    ON feed_items(feed_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

-- guid 用于调试 / 客户端展示
CREATE INDEX IF NOT EXISTS idx_feed_items_feed_guid
    ON feed_items(feed_id, guid)
    WHERE guid IS NOT NULL;

-- 旧 schema 的 (feed_id, link) partial index 也保留 (兼容)
-- 20260616000003 已经建过, 不动它

CREATE TABLE IF NOT EXISTS notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('sse', 'email')),
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- worker 拉取: state=pending AND next_retry_at <= NOW()
CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON notification_outbox(next_retry_at)
    WHERE state = 'pending';

-- 反查某 notification 的所有 outbox 行 (调试 + UI)
CREATE INDEX IF NOT EXISTS idx_outbox_notification
    ON notification_outbox(notification_id);
