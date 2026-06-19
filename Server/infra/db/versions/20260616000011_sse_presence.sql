-- 20260616000011 — SSE 多设备 presence 租约 + 邮件 throttle 持久化 (P1#5)
--
-- 背景 1: spec §7.1 要求
--   - 多设备 presence: 一个设备断开不能覆盖其他设备的活跃状态
--   - 周期性心跳 (period < offline threshold)
--   - 进程崩溃通过租约过期自动判离线
--   - 邮件发送前检查有效在线租约, 而不是只看一次连接时间
--
-- 设计 sse_lease:
--   - 每行代表一个 SSE 连接的租约 (user_id, device_id) PK
--   - device_id 来自 client (X-Device-Id header) 或 server 生成 (uuid)
--   - last_heartbeat_at: SSE handler 每次 send / recv 时刷新
--   - expires_at: created_at + 5min (定期续约); client 断开 / 进程崩溃 → 自动过期
--   - "online" = COUNT(*) > 0 WHERE expires_at > NOW()  (按 user_id)
--
-- 背景 2: spec §7.2 邮件 throttle
--   - 之前 email.rs 用 std Mutex<HashMap> 进程内 throttle, 进程重启 → 状态丢失
--   - 修复: 利用现有 notifications 表 — 同一 (user_id, level) 1h 内已有记录 → skip
--   - 不引入新表, 复用现有 index
--
-- 背景 3: spec §7.1 SSE token
--   - 当前 events.rs 同时支持 query ?token= 和 Authorization header
--   - 短期 SSE token 没做 (未来再补), 但不再把长期 access token 放 URL

CREATE TABLE IF NOT EXISTS sse_lease (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, device_id)
);

-- 反查: "这个用户当前哪些设备还在 lease"
-- 注: PG 要求 partial index 的 WHERE 谓词用 IMMUTABLE 函数. NOW() 不是 IMMUTABLE,
-- 所以这里用普通 index, 应用层 WHERE expires_at > NOW() 过滤.
CREATE INDEX IF NOT EXISTS idx_sse_lease_user_active
    ON sse_lease(user_id, expires_at);

-- 反查: "过期了需要 GC 的 lease"
CREATE INDEX IF NOT EXISTS idx_sse_lease_expires
    ON sse_lease(expires_at);

-- GC worker: 定期删 expires_at < NOW() - 1h 的行
