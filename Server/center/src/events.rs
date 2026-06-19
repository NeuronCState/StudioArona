//! Real-time event bus + SSE endpoint.
//!
//! 设计目标:
//! - 进程内 broadcast (单 daemon 部署够用, 不引入 Redis pub/sub — P2#2)
//! - 写 notification / page_monitor_event / rss_new_items 后 publish, 前端 SSE 订阅拉取
//! - SSE 端点按 user_id 过滤: 客户端只看到自己用户的事件
//! - 多设备 presence 租约 (spec §7.1): 每条 SSE 连接在 sse_lease 表占一行,
//!   周期性心跳刷 expires_at, 客户端断开/进程崩溃 → lease 过期自动判离线
//! - 邮件发送前查 sse_lease (count > 0) 判断在线, 而不是看单次连接时间
//!
//! 协议:
//! - event: ready              → 启动握手
//! - event: notification       → 新通知
//! - event: rss_new_items      → RSS 新条目合并通知
//! - event: page_monitor_change → 网页变化
//! - event: lagged             → 消费太慢丢了 N 条
//! - keep-alive: 每 15s 一条注释行 ": ping"

use axum::{
    extract::Query,
    extract::State,
    http::HeaderMap,
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{convert::Infallible, time::Duration};
use tokio::sync::broadcast;

use crate::{auth, AppState};

/// SSE lease TTL — 比 客户端 keep-alive 间隔略长, 允许 1-2 次心跳丢失仍算活跃
const SSE_LEASE_TTL_SECS: i64 = 5 * 60; // 5min
/// 心跳刷新周期 — 必须小于 TTL 才能保持续约
const SSE_HEARTBEAT_SECS: u64 = 60;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AppEvent {
    NotificationCreated {
        id: String,
        user_id: String,
        title: String,
        body: Option<String>,
        level: String,
        created_at: String,
    },
    RssNewItems {
        feed_id: String,
        user_id: String,
        count: usize,
        top_titles: Vec<String>,
    },
    PageMonitorChange {
        event_id: String,
        monitor_id: String,
        user_id: String,
        label: String,
        url: String,
        summary: Option<String>,
    },
}

impl AppEvent {
    pub fn matches_user(&self, user_id: &str) -> bool {
        let event_user = match self {
            AppEvent::NotificationCreated { user_id, .. } => user_id,
            AppEvent::RssNewItems { user_id, .. } => user_id,
            AppEvent::PageMonitorChange { user_id, .. } => user_id,
        };
        event_user == user_id
    }

    fn event_name(&self) -> &'static str {
        match self {
            AppEvent::NotificationCreated { .. } => "notification",
            AppEvent::RssNewItems { .. } => "rss_new_items",
            AppEvent::PageMonitorChange { .. } => "page_monitor_change",
        }
    }
}

#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<AppEvent>,
}

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self { tx }
    }

    pub fn publish(&self, event: AppEvent) {
        let _ = self.tx.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AppEvent> {
        self.tx.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Deserialize)]
pub struct SseAuthQuery {
    /// access token. Optional — B4 同时支持 Authorization header.
    /// 缺 token 时 query 解析不应 fail (否则 axum 直接返 400 而不是我们 401).
    #[serde(default)]
    pub token: Option<String>,
    /// 客户端提供的 device 标识 (用于多设备 presence).
    /// 缺失时 server 端用 uuid 生成 (仍可工作, 但客户端主动断开后 server 不知道是哪台 device).
    #[serde(default)]
    pub device_id: Option<String>,
}

/// 检查某 user 是否 "在线" (有 ≥1 个活跃 SSE lease). spec §7.1
pub async fn is_user_online(db: &sqlx::PgPool, user_id: &str) -> bool {
    let n: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM sse_lease
         WHERE user_id = $1::uuid AND expires_at > NOW()",
    )
    .bind(user_id)
    .fetch_one(db)
    .await
    .unwrap_or(0);
    n > 0
}

/// GET /api/events
///
/// 鉴权 (B4 修复: 强制 access token + 支持 Authorization header):
///   - `Authorization: Bearer <access_jwt>` (推荐, 不进 URL 日志)
///   - `?token=<access_jwt>&device_id=<id>` (兼容旧前端 / EventSource 不支持 header)
///
/// 必须用 `verify_access_token` — refresh token 拒绝订阅, 避免 30d refresh 长时间在线
/// 走完整个事件总线 (重放/泄漏面太大).
///
/// 设备标识 (`X-Device-Id` header 或 `device_id` query): 用于多设备 presence 隔离.
/// 缺失时 server 端生成 uuid.
pub async fn stream_events(
    headers: HeaderMap,
    Query(q): Query<SseAuthQuery>,
    State(state): State<AppState>,
) -> Result<
    Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>>,
    (axum::http::StatusCode, Json<Value>),
> {
    // B4: 优先 Authorization header, fallback 到 query token.
    let query_token = q.token.as_deref().unwrap_or("");
    let token = extract_sse_token(&headers, query_token).ok_or_else(|| {
        (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "missing access token (Authorization: Bearer or ?token=)"})),
        )
    })?;

    // B4: 强制 access token, refresh token 拒收.
    let claims = auth::verify_access_token(&token, &state.config.jwt_secret).map_err(|e| {
        tracing::debug!(error = %e, "SSE auth failed");
        (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "invalid or wrong-type token"})),
        )
    })?;
    let user_id = claims.sub;

    // device_id 优先 X-Device-Id header, fallback 到 query, 都没有则 server 生成.
    let device_id = headers
        .get("x-device-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or(q.device_id.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    upsert_lease(&state.db, &user_id, &device_id).await;
    // backward-compat: 仍写 presence.last_seen (旧邮件 fallback / 第三方集成可能依赖)
    if let Err(e) = sqlx::query(
        "INSERT INTO presence (user_id, last_seen, status)
         VALUES ($1::uuid, NOW(), 'online')
         ON CONFLICT (user_id) DO UPDATE SET last_seen = NOW(), status = 'online'",
    )
    .bind(&user_id)
    .execute(&state.db)
    .await
    {
        tracing::warn!(user_id = %user_id, error = %e, "presence update on SSE connect failed");
    }

    let mut rx = state.event_bus.subscribe();
    let db = state.db.clone();
    let user_id_for_heartbeat = user_id.clone();
    let device_id_for_heartbeat = device_id.clone();
    let mut heartbeat_tick = tokio::time::interval(Duration::from_secs(SSE_HEARTBEAT_SECS));
    // tokio::interval 第一次 tick 立即触发 — 我们手动 skip, 让第一次心跳在 SSE_HEARTBEAT_SECS 后
    heartbeat_tick.tick().await;

    let stream = async_stream::stream! {
        // 启动握手
        yield Ok::<_, Infallible>(
            Event::default()
                .event("ready")
                .data(format!("{{\"ok\":true,\"device_id\":\"{}\"}}", device_id))
        );

        // B3 修复: 必须在 select! 里同时 select 业务事件 和 心跳 timer.
        // 旧实现: 心跳检查在 loop 顶部 if-elapsed, 但没有 timer 分支, 业务事件没有
        //          到来时 select! 永久阻塞, 心跳永远走不到, lease 过期.
        // 新实现: tokio::time::interval 与 rx.recv() 在 select! 里并列.
        loop {
            tokio::select! {
                // B3: 心跳 timer 分支
                _ = heartbeat_tick.tick() => {
                    upsert_lease(&db, &user_id_for_heartbeat, &device_id_for_heartbeat).await;
                    yield Ok(Event::default().event("heartbeat").data("{}"));
                }
                // 业务事件分支
                msg = rx.recv() => {
                    match msg {
                        Ok(event) => {
                            if !event.matches_user(&user_id) {
                                continue;
                            }
                            let name = event.event_name();
                            let data = serde_json::to_string(&event).unwrap_or_default();
                            yield Ok(Event::default().event(name).data(data));
                        }
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            yield Ok(Event::default()
                                .event("lagged")
                                .data(format!("{{\"skipped\":{n}}}")));
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
            }
        }
        // stream 结束 (client disconnect / 进程退出): 删 lease → 立即算离线
        let _ = sqlx::query("DELETE FROM sse_lease WHERE user_id = $1::uuid AND device_id = $2")
            .bind(&user_id_for_heartbeat)
            .bind(&device_id_for_heartbeat)
            .execute(&db)
            .await;
    };

    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    ))
}

/// B4: 从请求里抽 access token. 优先 Authorization Bearer header, fallback query.
fn extract_sse_token(headers: &HeaderMap, query_token: &str) -> Option<String> {
    if let Some(h) = headers.get(axum::http::header::AUTHORIZATION) {
        if let Ok(s) = h.to_str() {
            if let Some(rest) = s.strip_prefix("Bearer ") {
                return Some(rest.trim().to_string());
            }
        }
    }
    if !query_token.is_empty() {
        return Some(query_token.to_string());
    }
    None
}

/// UPSERT 一条 SSE lease (heartbeat / 续约).
async fn upsert_lease(db: &sqlx::PgPool, user_id: &str, device_id: &str) {
    let _ = sqlx::query(
        "INSERT INTO sse_lease (user_id, device_id, last_heartbeat_at, expires_at)
         VALUES ($1::uuid, $2, NOW(), NOW() + ($3 || ' seconds')::interval)
         ON CONFLICT (user_id, device_id) DO UPDATE
         SET last_heartbeat_at = NOW(),
             expires_at = NOW() + ($3 || ' seconds')::interval",
    )
    .bind(user_id)
    .bind(device_id)
    .bind(SSE_LEASE_TTL_SECS.to_string())
    .execute(db)
    .await;
}

/// GC worker: 删过期 lease. 启动时 spawn, 每 5min 跑一次.
pub fn start_lease_gc(db: sqlx::PgPool) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(5 * 60));
        tick.tick().await; // skip immediate
        loop {
            tick.tick().await;
            let deleted =
                sqlx::query("DELETE FROM sse_lease WHERE expires_at < NOW() - INTERVAL '1 hour'")
                    .execute(&db)
                    .await
                    .map(|r| r.rows_affected())
                    .unwrap_or(0);
            if deleted > 0 {
                tracing::debug!(deleted, "sse_lease GC removed expired rows");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_name_includes_rss_new_items() {
        let e = AppEvent::RssNewItems {
            feed_id: "f".into(),
            user_id: "u".into(),
            count: 3,
            top_titles: vec!["a".into(), "b".into()],
        };
        assert_eq!(e.event_name(), "rss_new_items");
    }

    #[test]
    fn matches_user_filters_correctly() {
        let e = AppEvent::NotificationCreated {
            id: "n1".into(),
            user_id: "alice".into(),
            title: "t".into(),
            body: None,
            level: "info".into(),
            created_at: "2026".into(),
        };
        assert!(e.matches_user("alice"));
        assert!(!e.matches_user("bob"));
    }

    #[test]
    fn rss_new_items_matches_user() {
        let e = AppEvent::RssNewItems {
            feed_id: "f".into(),
            user_id: "u1".into(),
            count: 1,
            top_titles: vec!["x".into()],
        };
        assert!(e.matches_user("u1"));
        assert!(!e.matches_user("u2"));
    }

    #[test]
    fn page_monitor_change_matches_user() {
        let e = AppEvent::PageMonitorChange {
            event_id: "e1".into(),
            monitor_id: "m1".into(),
            user_id: "u1".into(),
            label: "L".into(),
            url: "https://x".into(),
            summary: None,
        };
        assert!(e.matches_user("u1"));
    }
}
