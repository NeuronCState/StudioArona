-- 20260616000008 — Sonetto Agent 配置 + secrets AEAD 存储 (P1#2)
--
-- 背景: Client 的 Sonetto 配置 (provider / persona / tool / mcp) 没在 server 留痕,
--       换设备就丢. 现在做完整的 server-side sync, secrets 用 AEAD 加密.
--
-- agent_configs (非敏感):
--   - user_id         拥有者
--   - config_key      'providers' | 'persona' | 'tools' | 'mcp_servers' | 'settings'
--   - value           JSONB (provider 列表 / persona 文本 / tool enable map / mcp servers)
--   - version         乐观锁
--   - updated_at
--   一个 user 每个 config_key 一行 (类似 setting 单例)
--
-- agent_secrets (敏感, AEAD 加密):
--   - user_id
--   - secret_key      'openai_api_key' | 'anthropic_api_key' | 'deepseek_api_key' |
--                     'mcp_<server_id>_token' | ...
--   - ciphertext      AES-256-GCM 密文 (base64)
--   - nonce           12-byte nonce (base64)
--   - key_version     当前主密钥版本, 未来轮换时区分新旧
--   - size_bytes      密文 + nonce 大小 (审计)
--   - created_at / updated_at
--   - rotated_from    上一条 secret_key 行的 jti-like ID, 审计链
--
-- 主密钥: 启动时从 APP_MASTER_KEY env 读 (32 bytes hex), key_version = 1.
--         轮换: 引入 key_version=2 的新密钥, 双写/双读, 切换完成后下线旧密钥.
--
-- API 响应: secrets 端点只返 "configured" + 掩码 (前 4 后 4), 不返密文/明文.

CREATE TABLE IF NOT EXISTS agent_configs (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    config_key TEXT NOT NULL,
    value JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, config_key),
    CONSTRAINT config_key_allowed CHECK (config_key IN (
        'providers', 'persona', 'tools', 'mcp_servers', 'settings'
    ))
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_updated
    ON agent_configs(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret_key TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    nonce TEXT NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    size_bytes INTEGER NOT NULL,
    rotated_from UUID REFERENCES agent_secrets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, secret_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_secrets_user
    ON agent_secrets(user_id);
