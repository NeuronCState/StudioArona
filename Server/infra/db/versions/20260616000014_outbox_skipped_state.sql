-- H1 修复: notification_outbox 加 'skipped' 状态.
-- 邮件投递前 (worker 实际投递时) 检查 notify_by_email / email_verified / SSE lease /
-- 邮件配置, 不满足时标 skipped (带 reason in last_error), 不再 retry. 这跟 sent/failed
-- 一样是终态, 不再变.

ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_state_check;
ALTER TABLE notification_outbox
    ADD CONSTRAINT notification_outbox_state_check
    CHECK (state IN ('pending', 'sent', 'skipped', 'failed'));

-- 索引: outbox 没有 user_id 列, 通过 notification_id → notifications.user_id 关联.
-- 限流查询走 JOIN, 现有 idx_outbox_notification + notifications(user_id, created_at) 已够用.
-- 加一个 (notification_id, channel) 部分索引, 加速 "找这个 notification 的 email outbox 行" 这类查询.
CREATE INDEX IF NOT EXISTS idx_outbox_notification_channel_email
    ON notification_outbox(notification_id)
    WHERE channel = 'email';
