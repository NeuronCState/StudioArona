-- 20260616000006 — 邮箱验证 token 表 (P0#3)
--
-- 背景: 之前任何用户都能在 preferences 里填任意 email 然后触发邮件降级,
--       服务器没有任何方式确认这个邮箱属于这个用户.
--
-- 设计:
--   token_hash       存 hash (sha256), 不存明文 — 跟 refresh_tokens 一致
--   user_id          谁发起的验证
--   target_email     这次要验证的邮箱 (用户可能换了新邮箱)
--   expires_at       默认 24h
--   consumed_at      用户点击验证链接时填上, 一次性消费
--   created_ip       创建时的 IP (审计, 不参与校验)
--
-- 验证流程:
--   1. POST /api/auth/email/verify-request  → 创建 token, 发送邮件
--   2. 邮件链接 /api/auth/email/verify?token=<raw>  (或 POST body)
--   3. server 查 hash 命中 + 未消费 + 未过期 → 标 users.email_verified = TRUE
--   4. 任何已存在的同邮箱未消费 token 都标 consumed_at (防多封邮件覆盖)

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_email TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verif_user_active
    ON email_verification_tokens(user_id)
    WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_verif_expires
    ON email_verification_tokens(expires_at)
    WHERE consumed_at IS NULL;
