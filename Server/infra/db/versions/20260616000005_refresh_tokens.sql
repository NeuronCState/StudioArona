-- 20260616000005 — refresh token 持久化 + 版本化 (P0#2)
--
-- 背景: 之前 refresh JWT 没存, 改密码 / 退出全部设备 / 禁用账户都没法撤销.
-- 现在每个 refresh token 在 DB 留痕, server 可主动 revoke + 强制轮换.
--
-- 设计:
--   jti            PK, 与 JWT 内部 jti claim 完全一致
--   user_id        所属用户
--   issued_at      创建时间 (与 JWT.iat 对齐, 用于审计)
--   expires_at     过期时间 (与 JWT.exp 对齐, server-side 二次校验)
--   revoked_at     撤销时间, NULL 表示活跃
--   replaced_by    轮换链: 这个 token 被 refresh 后被哪个 jti 替换 (NULL = 活跃 或 已自然过期)
--   user_agent     请求时的 UA, 审计用 (不参与校验)
--   ip             请求时的 IP, 审计用 (不参与校验)
--
-- 校验语义:
--   1. JWT 签名 + exp 必须过 (jsonwebtoken 库处理)
--   2. DB 这行存在 且 revoked_at IS NULL 且 expires_at > NOW()
--   3. user_id 与 JWT.sub 一致 (防跨用户 token 复用)
--
-- 轮换: refresh endpoint 每次成功 refresh → 当前 jti 标 revoked_at + replaced_by = 新 jti.
--       任何被撤销 token 上的后续 refresh 请求一律拒.

CREATE TABLE IF NOT EXISTS refresh_tokens (
    jti UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    -- 不做 FK: refresh 流程是 "先标旧 jti revoked+replaced_by, 再 INSERT 新 jti",
    -- 如果 FK 指向 refresh_tokens.jti, 新行还没插入就违反约束. 这个字段只是审计链.
    replaced_by UUID,
    user_agent TEXT,
    ip INET
);

-- 反查: "这个用户当前有哪些活跃 refresh token" — 用于"退出全部设备"
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
    ON refresh_tokens(user_id)
    WHERE revoked_at IS NULL;

-- 反查: "这个用户的全部 token 历史" — 审计
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_issued
    ON refresh_tokens(user_id, issued_at DESC);

-- 过期清理 job (cron) 可用: 找 expires_at < NOW() AND revoked_at IS NULL 的批量清理
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
    ON refresh_tokens(expires_at)
    WHERE revoked_at IS NULL;
