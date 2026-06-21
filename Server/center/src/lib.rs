use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::{Arc, Mutex};
use anyhow::Result;
use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode},
    response::{Html, IntoResponse},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

pub mod agent_config;
pub mod auth;
pub mod config;
pub mod cron_tracker;
pub mod crypto;
pub mod email;
pub mod events;
pub mod memory;
pub mod notifications;
pub mod page_monitor;
pub mod rss;
pub mod safe_fetch;
pub mod schedule;
pub mod skills;
pub mod user_skills;
pub mod vms;
pub mod weather;

use auth::{
    hash_password, verify_password, AuthError, LoginRequest, RefreshRequest, RegisterRequest,
    TokenPair, User,
};
use config::Config;
use cron_tracker::CronTracker;
use email::SmtpConfig;
use events::EventBus;
use weather::MetricsCache;

/// Track LAN clients that recently connected.
pub type ConnectedDevices = Arc<Mutex<HashMap<IpAddr, u64>>>;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub metrics_cache: MetricsCache,
    pub event_bus: EventBus,
    pub cron_tracker: CronTracker,
    pub smtp_config: SmtpConfig,
    pub instance_id: String,
    pub devices: ConnectedDevices,
}

/// Liveness probe — 仅返回进程是否在跑, 不查 DB.
async fn health() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "service": "studio-arona-center",
        "version": "0.1.0"
    }))
}

/// Home page — 服务状态面板 (中文).
async fn home() -> impl IntoResponse {
    Html(format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Studio Arona Server</title>
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{font-family:"SF Mono",Monaco,"JetBrains Mono",monospace;background:#0d1117;color:#c9d1d9;min-height:100vh;display:flex;align-items:center;justify-content:center}}
  .card{{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:32px 40px;max-width:480px;width:100%}}
  h1{{font-size:20px;color:#f0883e;margin-bottom:4px}}
  .sub{{font-size:12px;color:#8b949e;margin-bottom:24px}}
  .row{{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #21262d;font-size:13px}}
  .row:last-child{{border-bottom:none}}
  .label{{color:#8b949e}}
  .val{{color:#c9d1d9;font-weight:500}}
  .ok{{color:#3fb950}}.warn{{color:#d29922}}
  .links{{margin-top:20px;display:flex;gap:12px}}
  .links a{{color:#58a6ff;text-decoration:none;font-size:12px;padding:6px 12px;border:1px solid #30363d;border-radius:6px}}
  .links a:hover{{background:#1f2937}}
</style></head>
<body>
<div class="card">
  <h1>什亭之匣 · Studio Arona</h1>
  <p class="sub">Server Center Daemon — Rust axum</p>
  <div class="row"><span class="label">服务状态</span><span class="val ok">运行中</span></div>
  <div class="row"><span class="label">版本</span><span class="val">{version}</span></div>
  <div class="row"><span class="label">端口</span><span class="val">8080</span></div>
  <div class="row"><span class="label">运行时间</span><span class="val">{uptime}</span></div>
  <div class="row"><span class="label">PID</span><span class="val">{pid}</span></div>
  <div class="links">
    <a href="/health">/health</a>
    <a href="/readyz">/readyz</a>
    <a href="/api/me">/api/me</a>
  </div>
</div>
</body></html>"#,
        version = env!("CARGO_PKG_VERSION"),
        uptime = format_uptime(),
        pid = std::process::id(),
    ))
}

fn format_uptime() -> String {
    // uptime via /proc/uptime on Linux, else placeholder
    #[cfg(target_os = "linux")]
    {
        if let Ok(s) = std::fs::read_to_string("/proc/uptime") {
            let secs = s.split_whitespace().next().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
            let d = secs as u64 / 86400;
            let h = (secs as u64 % 86400) / 3600;
            let m = (secs as u64 % 3600) / 60;
            return format!("{d}d {h}h {m}m");
        }
    }
    "未知".to_string()
}

/// LAN discovery endpoint — returns server IPs + connected devices for the TUI.
async fn discovery(State(state): State<AppState>, ConnectInfo(addr): ConnectInfo<IpAddr>) -> impl IntoResponse {
    {
        let mut devices = state.devices.lock().unwrap();
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        devices.insert(addr, ts);
        devices.retain(|_, t| ts - *t < 300);
    }

    let devices: Vec<_> = state.devices.lock().unwrap()
        .iter()
        .map(|(ip, t)| json!({"ip": ip.to_string(), "last_seen_sec": t}))
        .collect();

    let ips = get_local_ips();

    Json(json!({
        "service": "studio-arona-center",
        "ips": ips,
        "port": 8080,
        "mdns": "studio-arona._tcp.local",
        "devices": devices,
    }))
}

fn get_local_ips() -> Vec<String> {
    use std::net::UdpSocket;
    let mut ips = Vec::new();
    // Best-effort: bind a UDP socket and read local addr
    if let Ok(s) = UdpSocket::bind("0.0.0.0:0") {
        if let Ok(()) = s.connect("10.255.255.255:1") {
            if let Ok(addr) = s.local_addr() {
                ips.push(addr.ip().to_string());
            }
        }
    }
    // Also add loopback
    ips.push("127.0.0.1".into());
    ips
}

/// Readiness probe — DB 可达才返 200. K8s / load balancer 用这个摘流量.
async fn readyz(State(state): State<AppState>) -> impl IntoResponse {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await
        .is_ok();
    let cron = state.cron_tracker.snapshot();
    let cron_healthy = cron.iter().all(|c| c.last_error_ts.is_none());
    let body = json!({
        "status": if db_ok && cron_healthy { "ready" } else { "degraded" },
        "db": db_ok,
        "cron": cron,
    });
    if db_ok && cron_healthy {
        (StatusCode::OK, Json(body))
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, Json(body))
    }
}

async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<TokenPair>), (StatusCode, Json<Value>)> {
    if !state.config.allow_public_registration {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "registration is disabled"})),
        ));
    }

    auth::validate_credentials(&req.username, &req.password).map_err(|(s, v)| (s, Json(v)))?;

    let password_hash = hash_password(&req.password).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "password hash failed"})),
        )
    })?;

    let id = Uuid::new_v4().to_string();
    let display_name = req
        .display_name
        .clone()
        .unwrap_or_else(|| req.username.clone());

    sqlx::query(
        "INSERT INTO users (id, username, display_name, password_hash, role) VALUES ($1::uuid, $2, $3, $4, 'member')"
    )
    .bind(&id)
    .bind(&req.username)
    .bind(&display_name)
    .bind(&password_hash)
    .execute(&state.db)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("duplicate") {
            (StatusCode::CONFLICT, Json(json!({"error": "username already exists"})))
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "user create failed"})))
        }
    })?;

    let user = User {
        id: id.clone(),
        username: req.username.clone(),
        display_name,
        role: "member".to_string(),
    };

    let (ua, ip) = extract_req_meta(&headers);
    let tokens = auth::create_tokens(
        &state.db,
        &user,
        &state.config,
        ua.as_deref(),
        ip.as_deref(),
    )
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("token issue failed: {e}")})),
        )
    })?;

    Ok((StatusCode::CREATED, Json(tokens)))
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> Result<Json<TokenPair>, (StatusCode, Json<Value>)> {
    let row = sqlx::query_as::<_, (String, String, String, String, String)>(
        "SELECT id::text, username, display_name, password_hash, role FROM users WHERE username = $1"
    )
    .bind(&req.username)
    .fetch_optional(&state.db)
    .await
    .map_err(|_e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "login lookup failed"}))))?
    .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(json!({"error": "invalid credentials"}))))?;

    let (id, username, display_name, password_hash, role) = row;

    let ok = verify_password(&req.password, &password_hash).map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "password verify failed"})),
        )
    })?;
    if !ok {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "invalid credentials"})),
        ));
    }

    let user = User {
        id,
        username,
        display_name,
        role,
    };
    let (ua, ip) = extract_req_meta(&headers);
    let tokens = auth::create_tokens(
        &state.db,
        &user,
        &state.config,
        ua.as_deref(),
        ip.as_deref(),
    )
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("token issue failed: {e}")})),
        )
    })?;

    Ok(Json(tokens))
}

async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<TokenPair>, (StatusCode, Json<Value>)> {
    // 1. JWT 签名 + exp + 类型必须为 refresh (P0#2)
    let claims = auth::verify_refresh_token(&req.refresh_token, &state.config.jwt_secret)
        .map_err(|e| e.into_http())?;

    // 2. DB 中 jti 必须活跃 (未被撤销且未过期), user_id 与 sub 一致
    auth::verify_refresh_in_db(&state.db, &claims)
        .await
        .map_err(|e| e.into_http())?;

    // 3. 拉 user 信息 (用刚 verify 过的 claims.sub, 不接受请求体里的 user_id)
    let row = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id::text, username, display_name, role FROM users WHERE id = $1::uuid",
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "refresh lookup failed"})),
        )
    })?
    .ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "user not found"})),
        )
    })?;

    let user = User {
        id: row.0,
        username: row.1,
        display_name: row.2,
        role: row.3,
    };

    // B2 修复: refresh rotation + 新 token 签发 走单一事务 (auth::rotate_and_issue).
    // - 旧 jti 锁 + 条件撤销 (revoked_at IS NULL) 防止重放
    // - 新 refresh_jti 在事务内生成, INSERT 到 refresh_tokens, 同时设到旧行的 replaced_by
    // - replaced_by 链真实可追踪
    let (ua, ip) = extract_req_meta(&headers);
    let (access_token, refresh_token, _new_refresh_jti) = auth::rotate_and_issue(
        &state.db,
        &state.config,
        &claims,
        &user,
        ua.as_deref(),
        ip.as_deref(),
    )
    .await
    .map_err(|e| match e {
        // Revoked (重放 / 过期) → 401, 不暴露是哪种
        AuthError::Revoked => (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "refresh token revoked or expired"})),
        ),
        other => {
            tracing::error!(error = %other, "rotate_and_issue failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("rotate failed: {other}")})),
            )
        }
    })?;

    Ok(Json(TokenPair {
        access_token,
        refresh_token,
        user,
    }))
}

/// POST /api/auth/logout — 撤销当前 refresh token (即 "退出这台设备").
/// 注: access token 仍然有效到自然过期 (短), 严格 exit-all 走 DELETE /api/auth/sessions.
async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RefreshRequest>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let claims = auth::verify_refresh_token(&req.refresh_token, &state.config.jwt_secret)
        .map_err(|e| e.into_http())?;
    auth::revoke_refresh(&state.db, claims.jti)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("revoke failed: {e}")})),
            )
        })?;
    let _ = &headers;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/auth/logout-all — 撤销当前用户全部活跃 refresh token (改密码 / 失窃兜底).
async fn logout_all(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        auth::extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    let n = auth::revoke_all_user_refresh(&state.db, &user_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("revoke-all failed: {e}")})),
            )
        })?;
    Ok(Json(json!({"revoked": n})))
}

/// 提取 UA + IP 头部用于 refresh_tokens 审计 (不参与校验).
fn extract_req_meta(headers: &HeaderMap) -> (Option<String>, Option<String>) {
    let ua = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let ip = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        });
    (ua, ip)
}

async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        auth::extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    // 读真实 DB 状态, 而不是请求默认值 (P0#3)
    let row = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            String,
            chrono::DateTime<chrono::Utc>,
            Option<String>,
            bool,
            bool,
            serde_json::Value,
            bool,
        ),
    >(
        "SELECT id::text, username, display_name, role, created_at, email, notify_by_email, email_verified, preferences, face_enrolled
         FROM users WHERE id = $1::uuid",
    )
    .bind(&user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "user lookup failed"})),
        )
    })?
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "user not found"})),
        )
    })?;

    let (
        id,
        username,
        display_name,
        role,
        created_at,
        email,
        notify_by_email,
        email_verified,
        preferences,
        face_enrolled,
    ) = row;

    Ok(Json(json!({
        "id": id,
        "username": username,
        "display_name": display_name,
        "role": role,
        "created_at": created_at,
        "email": email,
        "notify_by_email": notify_by_email,
        "email_verified": email_verified,
        "preferences": preferences,
        "face_enrolled": face_enrolled,
    })))
}

/// PATCH /api/me/notification-prefs — 设置 email + notify_by_email (P0#3).
async fn update_notification_prefs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<UpdateNotificationPrefsInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        auth::extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    if let Some(ref e) = input.email {
        if !e.is_empty() && (!e.contains('@') || e.len() > 254) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid email format"})),
            ));
        }
    }

    // "email 改变即重置 verified" — 也包括空串 (清空邮箱, 也会清 verified).
    // 没传 email 字段 (None) → 不动现有 email.
    let new_email_is_set = input.email.as_ref().is_some_and(|s| !s.is_empty());
    let email_value: Option<String> = if new_email_is_set {
        input.email.clone()
    } else {
        None // 包括 input.email == Some("") (清空) 和 None (保持)
    };

    let row: (Option<String>, bool, bool) = sqlx::query_as(
        "UPDATE users
         SET email = CASE WHEN $1::boolean THEN $2 ELSE email END,
             notify_by_email = COALESCE($3, notify_by_email),
             email_verified = CASE WHEN $1::boolean THEN FALSE ELSE email_verified END,
             updated_at = NOW()
         WHERE id = $4::uuid
         RETURNING email, notify_by_email, email_verified",
    )
    .bind(new_email_is_set)
    .bind(&email_value)
    .bind(input.notify_by_email)
    .bind(&user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "prefs update failed"})),
        )
    })?;

    let (final_email, final_notify, final_verified) = row;

    Ok(Json(json!({
        "email": final_email,
        "notify_by_email": final_notify,
        "email_verified": final_verified,
    })))
}

#[derive(Deserialize)]
struct UpdateNotificationPrefsInput {
    email: Option<String>,
    notify_by_email: Option<bool>,
}

// ─── Email verification (P0#3) ─────────────────────────────────────────────

#[derive(Deserialize)]
struct VerifyEmailRequest {
    token: String,
}

/// POST /api/auth/email/verify-request — 用户在自己的 settings 里改完 email 后调这个.
/// 注意: 即使 SMTP 没配, token 也会进 DB (给 dev / 测试用), 返回 200 即可.
async fn request_email_verification(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        auth::extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT email FROM users WHERE id = $1::uuid")
            .bind(&user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|_e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "user lookup failed"})),
                )
            })?;
    let email = row.and_then(|(e,)| e).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(
                json!({"error": "no email set on account; set one via /api/me/notification-prefs"}),
            ),
        )
    })?;

    let (_, ip) = extract_req_meta(&headers);
    let (raw_token, expires_at) =
        email::create_verification_token(&state.db, &user_id, &email, ip.as_deref())
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("token create failed: {e}")})),
                )
            })?;

    // 构造验证链接. 生产模式要求 PUBLIC_BASE_URL; dev 模式兜底 localhost.
    let base =
        std::env::var("PUBLIC_BASE_URL").unwrap_or_else(|_| "http://localhost:5173".to_string());
    let link = format!("{base}/settings/email/verify?token={raw_token}");

    // 即使 SMTP 未配也返 200 — token 已经在 DB, 用户可手动粘到浏览器.
    // 日志只记 user_id, 不打 raw token / email 内容 (P0#3 隐私).
    let sent = email::try_send_verification(&state, &user_id, &email, &link)
        .await
        .unwrap_or(false);
    tracing::info!(user_id = %user_id, sent, "email verification requested");

    Ok(Json(json!({
        "requested": true,
        "expires_at": expires_at.to_rfc3339(),
        "email_sent": sent,
        "verify_link": if sent { None } else { Some(link) }, // dev 友好: 没发出时返 link
    })))
}

/// POST /api/auth/email/verify — 验证 token, 成功后 users.email_verified = TRUE.
async fn verify_email(
    State(state): State<AppState>,
    Json(req): Json<VerifyEmailRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let user_id = email::consume_verification_token(&state.db, &req.token)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("verify failed: {e}")})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid or expired verification token"})),
            )
        })?;

    tracing::info!(user_id = %user_id, "email verified");
    Ok(Json(json!({"verified": true, "user_id": user_id})))
}

/// 提取出来的 Router 构造 — 给 integration test (`tests/integration_http.rs`) 用.
/// 复用 main 启动时的所有路由 + CORS, 不启 TCP listener.
/// `tower::ServiceExt::oneshot` 可以直接打.
pub fn build_router(state: AppState, config: &Config) -> axum::Router {
    use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
    use tower_http::cors::CorsLayer as TowerCorsLayer;
    use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin};

    let allowed_origins: Vec<_> = config
        .cors_allowed_origins
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();

    let cors = TowerCorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods(AllowMethods::list([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PATCH,
            axum::http::Method::DELETE,
        ]))
        .allow_headers(AllowHeaders::list([ACCEPT, AUTHORIZATION, CONTENT_TYPE]))
        .allow_credentials(true)
        .max_age(Duration::from_secs(600));

    Router::new()
        .route("/", get(home))
        .route("/health", get(health))
        .route("/api/discovery", get(discovery))
        .route("/readyz", get(readyz))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/refresh", post(refresh))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/logout-all", post(logout_all))
        .route(
            "/api/auth/email/verify-request",
            post(request_email_verification),
        )
        .route("/api/auth/email/verify", post(verify_email))
        .route("/api/me", get(me))
        .route(
            "/api/me/notification-prefs",
            axum::routing::patch(update_notification_prefs),
        )
        .route("/api/feeds", get(rss::list_feeds).post(rss::create_feed))
        .route(
            "/api/feeds/:id",
            axum::routing::patch(rss::update_feed).delete(rss::delete_feed),
        )
        .route("/api/feeds/:id/items", get(rss::list_feed_items))
        .route("/api/feeds/:id/refresh", post(rss::refresh_feed))
        .route(
            "/api/page-monitors",
            get(page_monitor::list_page_monitors).post(page_monitor::create_page_monitor),
        )
        .route(
            "/api/page-monitors/:id",
            axum::routing::patch(page_monitor::update_page_monitor)
                .delete(page_monitor::delete_page_monitor),
        )
        .route(
            "/api/page-monitors/:id/events",
            get(page_monitor::list_page_monitor_events),
        )
        .route(
            "/api/page-monitors/:id/check",
            post(page_monitor::manual_check),
        )
        .route(
            "/api/memory/entries",
            get(memory::list_memory_entries).post(memory::create_memory_entry),
        )
        .route(
            "/api/memory/entries/:id",
            axum::routing::patch(memory::update_memory_entry).delete(memory::delete_memory_entry),
        )
        .route(
            "/api/schedules",
            get(schedule::list_schedules).post(schedule::create_schedule),
        )
        .route(
            "/api/schedules/:id",
            get(schedule::get_schedule)
                .patch(schedule::update_schedule)
                .delete(schedule::delete_schedule),
        )
        .route("/api/vms", get(vms::list_vms))
        .route("/api/vms/:id/start", post(vms::start_vm))
        .route("/api/vms/:id/stop", post(vms::stop_vm))
        .route("/api/vms/:id/restart", post(vms::restart_vm))
        .route("/api/weather", get(weather::get_weather))
        .route("/api/system/metrics", get(weather::get_system_metrics))
        .route(
            "/api/system/cron-status",
            get(cron_tracker::cron_status_handler),
        )
        .route(
            "/api/skills/marketplace/install",
            post(skills::install_skill),
        )
        .route(
            "/api/skills/marketplace/categories",
            get(skills::marketplace_categories),
        )
        .route(
            "/api/skills/marketplace/trending",
            get(skills::marketplace_trending),
        )
        .route(
            "/api/skills/marketplace/search",
            get(skills::marketplace_search),
        )
        .route(
            "/api/skills/marketplace/installed",
            get(skills::marketplace_installed),
        )
        .route("/api/skills/installed", get(skills::list_installed_skills))
        .route("/api/skills/:slug", delete(skills::uninstall_skill))
        .route(
            "/api/user-skills",
            get(user_skills::list_user_skills).post(user_skills::create_user_skill),
        )
        .route(
            "/api/user-skills/sync",
            axum::routing::post(user_skills::sync_user_skills),
        )
        .route(
            "/api/user-skills/:slug",
            get(user_skills::get_user_skill)
                .put(user_skills::update_user_skill)
                .delete(user_skills::delete_user_skill),
        )
        .route("/api/agent/config", get(agent_config::list_agent_config))
        .route(
            "/api/agent/config/:key",
            axum::routing::put(agent_config::upsert_agent_config),
        )
        .route("/api/agent/secrets", get(agent_config::list_secrets))
        .route(
            "/api/agent/secrets/:key",
            axum::routing::put(agent_config::set_secret).delete(agent_config::delete_secret),
        )
        .route("/api/events", get(events::stream_events))
        .route("/api/notifications", get(notifications::list_notifications))
        .route(
            "/api/notifications/unread-count",
            get(notifications::unread_count),
        )
        .route(
            "/api/notifications/:id/read",
            post(notifications::mark_read),
        )
        .route(
            "/api/notifications/read-all",
            post(notifications::mark_all_read),
        )
        .layer(cors)
        .with_state(state)
}

// 使用 std::time::Duration 用于 CORS max-age
use std::time::Duration;

// ─── public API for integration tests + main() ───────────────────────────

/// Public alias for integration test — same as the local `AppState` struct.
pub use self::AppState as PublicAppState;

/// Test config — dev mode, strong JWT secret, no CORS restriction.
pub fn test_config() -> config::Config {
    use config::{AppEnv, Config};
    Config {
        env: AppEnv::Development,
        port: 0, // unused in tests
        database_url: String::new(),
        jwt_secret: "test-secret-test-secret-test-secret-test-secret".to_string(),
        jwt_expires_in: 1800,
        refresh_expires_in: 2_592_000,
        cors_allowed_origins: vec!["http://localhost:5173".to_string()],
        allow_public_registration: true,
    }
}

/// Build a minimal AppState for tests — 真 PG, 关掉 SMTP, 用 test config.
pub async fn build_test_app_state(db: sqlx::PgPool) -> AppState {
    AppState {
        db,
        config: test_config(),
        metrics_cache: weather::MetricsCache::new(),
        event_bus: events::EventBus::new(),
        cron_tracker: cron_tracker::CronTracker::new(),
        smtp_config: email::SmtpConfig::from_env(),
        instance_id: format!("test-{}", uuid::Uuid::new_v4()),
        devices: Arc::new(Mutex::new(HashMap::new())),
    }
}

/// Public build_router — 给 main() 和 test 用. 已经 pub 在文件中部, 这里加 alias.
pub use self::build_router as build_router_public;

/// Binary entry — 启动 config + DB + Router + 监听.
pub async fn run() -> anyhow::Result<()> {
    use std::net::SocketAddr;

    let config = config::Config::from_env()?;
    tracing::info!(
        env = ?config.env,
        port = config.port,
        public_registration = config.allow_public_registration,
        instance_id = %std::env::var("CENTER_INSTANCE_ID").unwrap_or_default(),
        "Starting Studio Arona Center daemon"
    );

    crypto::load_master_key(config.env == config::AppEnv::Production)
        .map_err(|e| anyhow::anyhow!("master key load failed: {e}"))?;

    let db = sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await?;
    tracing::info!("PG connected");

    sqlx::migrate!("../infra/db/versions").run(&db).await?;
    tracing::info!("migrations applied");

    if config.env == config::AppEnv::Development {
        let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(&db)
            .await?;
        if user_count == 0 {
            let admin_hash =
                auth::hash_password("admin123").map_err(|e| anyhow::anyhow!("bcrypt: {}", e))?;
            sqlx::query(
                "INSERT INTO users (id, username, display_name, password_hash, role) VALUES ($1::uuid, 'admin', 'Admin', $2, 'admin')"
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&admin_hash)
            .execute(&db)
            .await?;
            tracing::info!("seeded default admin/admin123 (admin role, dev only)");
        }
    }

    let instance_id =
        std::env::var("CENTER_INSTANCE_ID").unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());

    let state = AppState {
        db,
        config: config.clone(),
        metrics_cache: weather::MetricsCache::new(),
        event_bus: events::EventBus::new(),
        cron_tracker: cron_tracker::CronTracker::new(),
        smtp_config: email::SmtpConfig::from_env(),
        instance_id: instance_id.clone(),
        devices: Arc::new(Mutex::new(HashMap::new())),
    };

    weather::init_weather_cache();
    rss::start_cron_state(state.clone(), state.cron_tracker.clone());
    page_monitor::start_cron(state.clone(), state.cron_tracker.clone());
    notifications::start_outbox_worker(state.clone(), state.cron_tracker.clone());
    events::start_lease_gc(state.db.clone());

    let app = build_router(state, &config);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;
    Ok(())
}
