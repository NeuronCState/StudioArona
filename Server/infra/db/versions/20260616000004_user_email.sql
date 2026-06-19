-- 20260616000004 — 邮件降级基础字段
-- 目的: 让 notifications 在 client 不在线时, 通过 SMTP 发邮件兜底 (P1#6).
--
-- 字段:
--   email               TEXT       可选, 用户设置后才会发邮件
--   notify_by_email     BOOLEAN    用户偏好 (默认 FALSE, 不发 — 隐私第一)
--   email_verified      BOOLEAN    邮箱是否验证过 (避免任意用户塞别人的邮箱)
--
-- 验证策略: 首次设置时 server 发一封确认邮件 (含 token), 用户点链接 → 验证.
--          本次 commit 只把字段加上 + handler, 验证邮件流程下个迭代再做 (需要先有 SMTP config).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS notify_by_email BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;
