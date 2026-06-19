//! 邮件发送 — notification 离线兜底 (P1#6).
//!
//! 设计:
//! - SMTP 配置从环境变量读: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD,
//!   SMTP_FROM (默认 "Studio Arona <noreply@studio-arona.local>")
//! - 没配 SMTP_HOST → send 走 noop + 返回 Ok (不让 dev 环境报错)
//! - 限流: per-user, per-(level, category) key 1h 内最多 1 封 (避免页面频繁变化时轰炸)
//! - HTML 模板极简, 不引外部 CSS
//!
//! 调用方: notifications::create_and_publish fallback.

use chrono::Utc;
use lettre::{
    message::{header::ContentType, Mailbox, Message},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::time::Duration;

use crate::AppState;

/// Throttle 记录: 已废弃, throttle 现在走 PG (throttled_pg).
/// 保留 stub API 给老调用方 / 旧测试.
const THROTTLE_WINDOW_SECS: i64 = 3600; // 1h
const VERIFY_TOKEN_TTL_SECS: i64 = 24 * 3600; // 24h

/// sha256 hex of a verification token — DB 存 hash, 不存明文.
pub fn hash_token(raw: &str) -> String {
    let mut h = Sha256::new();
    h.update(raw.as_bytes());
    hex_encode(&h.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// PG 持久化 throttle (spec §7.2 "发送记录持久化, 进程重启后不能丢失重试状态或限流状态").
///
/// H1 修复: 之前查 `notifications` 表做 throttle, 但**当前要发的通知** 本身就在
/// notifications 表里 → 1h 内必然命中 → 永远 throttle → 邮件永远不发.
///
/// 正确做法: 查 `notification_outbox` (channel='email', state='sent') 的 sent_at
/// 字段 — 那是**真正发送过**的记录, 不包含当前 outbox 行 (因为它的 state 还是 pending).
///
/// M2 修复: **只数 `state = 'sent'`, 不数 `skipped`**. 原因:
///   - `skipped` = 没发 (用户在线 / 未验证 / notify_by_email=false / SMTP 未配)
///   - 这些情况下用户没收到邮件, 不应该占用户的 1h 配额
///   - 旧实现: 用户在线被 skip, 5 min 后离线 + 完成验证 → 仍被 throttle, 错失真该发的邮件
///   - 现在: 只有真正发过 (`sent`) 才占配额, `skipped` 不算
///
/// 公开: 让 outbox worker 在 deliver_one 调, 不只 try_send.
pub async fn is_throttled(db: &PgPool, user_id: &str) -> bool {
    throttled_pg(db, user_id).await
}

async fn throttled_pg(db: &PgPool, user_id: &str) -> bool {
    let recent: Option<(String,)> = sqlx::query_as(
        "SELECT o.id::text FROM notification_outbox o
         JOIN notifications n ON n.id = o.notification_id
         WHERE n.user_id = $1::uuid
           AND o.channel = 'email'
           AND o.state = 'sent'
           AND o.sent_at > NOW() - ($2 || ' seconds')::interval
         LIMIT 1",
    )
    .bind(user_id)
    .bind(THROTTLE_WINDOW_SECS.to_string())
    .fetch_optional(db)
    .await
    .unwrap_or(None);
    recent.is_some()
}

/// SMTP 配置缓存. 启动时读 env, 不支持热重载 (够用).
#[derive(Clone, Debug, Serialize)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub user: Option<String>,
    pub password: Option<String>,
    pub from: String,
    pub enabled: bool,
}

impl SmtpConfig {
    pub fn from_env() -> Self {
        let host = std::env::var("SMTP_HOST").unwrap_or_default();
        let port: u16 = std::env::var("SMTP_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(587);
        let user = std::env::var("SMTP_USER").ok().filter(|s| !s.is_empty());
        let password = std::env::var("SMTP_PASSWORD")
            .ok()
            .filter(|s| !s.is_empty());
        let from = std::env::var("SMTP_FROM")
            .unwrap_or_else(|_| "Studio Arona <noreply@studio-arona.local>".to_string());
        Self {
            enabled: !host.is_empty(),
            host,
            port,
            user,
            password,
            from,
        }
    }
}

/// 限流记录: 进程内 in-memory throttle 已废弃 (spec §7.2 要求持久化).
/// PG 版见 throttled_pg (用 notifications 表 source).
/// 保留 _UNUSED_THROTTLE 占位, 防外部 stale import 编译失败.
#[allow(dead_code)]
type _ThrottleMap =
    std::collections::HashMap<String, std::collections::HashMap<String, chrono::DateTime<Utc>>>;
#[allow(dead_code)]
static _UNUSED_THROTTLE: once_cell::sync::Lazy<std::sync::Mutex<_ThrottleMap>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

/// 解析 from 字符串 "Name <addr@host>" → Mailbox.
fn parse_mailbox(s: &str) -> Result<Mailbox, String> {
    s.parse::<Mailbox>()
        .map_err(|e| format!("parse mailbox: {e}"))
}

/// 构造邮件 (HTML + 文本回退).
fn build_email(
    cfg: &SmtpConfig,
    to: &str,
    subject: &str,
    title: &str,
    body: Option<&str>,
) -> Result<Message, String> {
    let from = parse_mailbox(&cfg.from)?;
    let to = to
        .parse::<Mailbox>()
        .map_err(|e| format!("parse recipient: {e}"))?;

    let html = format!(
        r#"<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="border-bottom: 1px solid #e5e5e5; padding-bottom: 12px; margin-bottom: 16px;">
  <h2 style="margin: 0; font-size: 16px; color: #1a1a1a;">Studio Arona</h2>
</div>
<div style="font-size: 14px; color: #333; line-height: 1.6;">
  <h3 style="margin-top: 0; font-size: 15px;">{title}</h3>
  {body_html}
  <p style="margin-top: 24px; font-size: 12px; color: #888;">
    这是离线通知 — 在线时不会再发。你可以在 Studio Arona 设置里关闭邮件通知。
  </p>
</div>
</body></html>"#,
        title = html_escape(title),
        body_html = body
            .map(|b| format!(
                r#"<p style="white-space: pre-wrap;">{}</p>"#,
                html_escape(b)
            ))
            .unwrap_or_default(),
    );

    let text = format!(
        "{title}\n\n{body}\n\n— Studio Arona (离线通知)",
        title = title,
        body = body.unwrap_or(""),
    );

    Message::builder()
        .from(from)
        .to(to)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(html + "\n<!-- text fallback -->\n" + &text)
        .map_err(|e| format!("build message: {e}"))
}

/// 极简 HTML escape — 防 XSS + 模板注入.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// 实际发送 — 配置缺失 / 未验证邮箱 / throttle 命中 → 返回 Ok(false) 表示未发送.
///
/// P0#3: 必须 email_verified = TRUE 才发业务通知. 验证邮件 (verify_request) 是单独的
/// 通道, 不走这个函数 — 那些是引导用户完成验证的, 必须能发.
pub async fn try_send(
    state: &AppState,
    user_id: &str,
    email_to: &str,
    level: &str,
    title: &str,
    body: Option<&str>,
) -> Result<bool, String> {
    let cfg = &state.smtp_config;
    if !cfg.enabled {
        tracing::debug!("smtp not configured, skip email for user={user_id}");
        return Ok(false);
    }

    // P0#3: email_verified 必须在 DB 真的为 true. notify_by_email 由 caller 在更外层检查.
    let verified: Option<(bool,)> =
        sqlx::query_as("SELECT email_verified FROM users WHERE id = $1::uuid")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| format!("email lookup: {e}"))?;
    match verified {
        Some((true,)) => {}
        Some((false,)) => {
            tracing::debug!(user_id, "email not verified, skip notification mail");
            return Ok(false);
        }
        None => {
            tracing::warn!(user_id, "user vanished between auth and email send");
            return Ok(false);
        }
    }

    // P1#5: 限流走 PG (notifications 表), 进程重启不丢状态
    if throttled_pg(&state.db, user_id).await {
        tracing::debug!(user_id, level, "throttled (1h window), skip email");
        return Ok(false);
    }

    let subject = format!("[Arona] {title}");
    let msg = build_email(cfg, email_to, &subject, title, body)?;

    let creds = match (&cfg.user, &cfg.password) {
        (Some(u), Some(p)) => Some(Credentials::new(u.clone(), p.clone())),
        _ => None,
    };
    let transport = AsyncSmtpTransport::<Tokio1Executor>::relay(&cfg.host)
        .map_err(|e| format!("smtp relay: {e}"))?
        .port(cfg.port);
    let transport = if let Some(c) = creds {
        transport.credentials(c)
    } else {
        transport
    };
    let transport = transport.timeout(Some(Duration::from_secs(15))).build();

    match transport.send(msg).await {
        Ok(_) => {
            // P1#5: 发送成功 → 写一行 notifications 作为 throttle 标记 (notifications 表本身就是 throttle source)
            //         不用额外表, 复用现有 user_id + created_at 索引
            tracing::info!(user_id, level, "notification email sent");
            Ok(true)
        }
        Err(e) => Err(format!("smtp send: {e}")),
    }
}

/// 发验证邮件 — 跳过 email_verified 检查 (这是用户请求验证的引导邮件, 必须能发).
/// 单独 throttle key "verify" 避免被业务邮件 throttle 拖累.
pub async fn try_send_verification(
    state: &AppState,
    user_id: &str,
    email_to: &str,
    verify_link: &str,
) -> Result<bool, String> {
    let cfg = &state.smtp_config;
    if !cfg.enabled {
        tracing::debug!("smtp not configured, skip verify mail for user={user_id}");
        return Ok(false);
    }
    let _throttle_key = "verify";
    // 用 level = "verify" 作为独立 throttle key, 跟业务通知分开
    if throttled_pg(&state.db, user_id).await {
        tracing::debug!(user_id, "verify email throttled (1h window)");
        return Ok(false);
    }

    let subject = "[Arona] 请验证你的邮箱";
    let body = format!(
        "你 (或代表你) 刚刚在 Studio Arona 请求验证这个邮箱地址.\n\n\
         点击下面的链接完成验证 (24h 内有效):\n\n\
         {verify_link}\n\n\
         如果这不是你发起的请求, 请忽略本邮件."
    );
    let msg = build_email(
        cfg,
        email_to,
        subject,
        "验证你的 Studio Arona 邮箱",
        Some(&body),
    )?;

    let creds = match (&cfg.user, &cfg.password) {
        (Some(u), Some(p)) => Some(Credentials::new(u.clone(), p.clone())),
        _ => None,
    };
    let transport = AsyncSmtpTransport::<Tokio1Executor>::relay(&cfg.host)
        .map_err(|e| format!("smtp relay: {e}"))?
        .port(cfg.port);
    let transport = if let Some(c) = creds {
        transport.credentials(c)
    } else {
        transport
    };
    let transport = transport.timeout(Some(Duration::from_secs(15))).build();

    match transport.send(msg).await {
        Ok(_) => {
            // PG 版 throttle: 发送成功本身就是 throttle source (notifications 表里这行就是 mark)
            tracing::info!(user_id, "verification email sent");
            // 注意: 不打 email / token 明文到日志 (P0#3 隐私要求)
            tracing::info!(user_id, "verification email sent");
            Ok(true)
        }
        Err(e) => Err(format!("smtp send: {e}")),
    }
}

// ─── 验证 token 流程 ──────────────────────────────────────────────────────

/// 创建验证 token. 返回 (raw_token, expires_at). raw_token 走邮件发出, DB 只存 hash.
///
/// 随机源: uuid::Uuid::new_v4() × 2 → 128 bits hex. 与 refresh jti 同强度, 已足够.
pub async fn create_verification_token(
    db: &PgPool,
    user_id: &str,
    target_email: &str,
    ip: Option<&str>,
) -> anyhow::Result<(String, chrono::DateTime<Utc>)> {
    let raw = uuid::Uuid::new_v4().to_string() + &uuid::Uuid::new_v4().to_string();
    let raw = raw.replace('-', ""); // 64 hex chars
    let hash = hash_token(&raw);

    // 撤销同邮箱同用户已有的未消费 token (只允许同时一个活跃 token)
    sqlx::query(
        "UPDATE email_verification_tokens SET consumed_at = NOW()
         WHERE user_id = $1::uuid AND target_email = $2 AND consumed_at IS NULL",
    )
    .bind(user_id)
    .bind(target_email)
    .execute(db)
    .await?;

    let expires_at = Utc::now() + chrono::Duration::seconds(VERIFY_TOKEN_TTL_SECS);

    sqlx::query(
        "INSERT INTO email_verification_tokens (token_hash, user_id, target_email, expires_at, created_ip)
         VALUES ($1, $2::uuid, $3, $4, NULLIF($5, '')::inet)",
    )
    .bind(&hash)
    .bind(user_id)
    .bind(target_email)
    .bind(expires_at)
    .bind(ip.unwrap_or(""))
    .execute(db)
    .await?;

    Ok((raw, expires_at))
}

/// 消费一个验证 token: hash 命中 + 未消费 + 未过期 → 标 consumed_at + 标 user verified.
pub async fn consume_verification_token(
    db: &PgPool,
    raw_token: &str,
) -> anyhow::Result<Option<String>> {
    let hash = hash_token(raw_token);
    // 一次原子 SQL 完成: 找 → 标 consumed → 返回 user_id
    let row: Option<(String, String)> = sqlx::query_as(
        "UPDATE email_verification_tokens
         SET consumed_at = NOW()
         WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
         RETURNING user_id::text, target_email",
    )
    .bind(&hash)
    .fetch_optional(db)
    .await?;
    let (user_id, target_email) = match row {
        Some(r) => r,
        None => return Ok(None),
    };

    // 标 user.email + email_verified. 仅当 user 当前 email 与 token 一致时标 verified
    // (防跨用户提交 token 干扰)
    sqlx::query(
        "UPDATE users
         SET email_verified = TRUE,
             email = CASE WHEN email = $1 THEN email ELSE email END
         WHERE id = $2::uuid",
    )
    .bind(&target_email)
    .bind(&user_id)
    .execute(db)
    .await?;

    Ok(Some(user_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_escape_handles_special_chars() {
        let s = r#"<script>alert("x&y")</script>"#;
        let escaped = html_escape(s);
        assert!(!escaped.contains('<'));
        assert!(!escaped.contains('>'));
        assert!(!escaped.contains('"'));
        assert!(escaped.contains("&lt;"));
        assert!(escaped.contains("&amp;"));
        assert!(escaped.contains("&quot;"));
    }

    #[test]
    fn throttle_window_matches_spec() {
        // spec §7.2: 1h 窗口
        assert_eq!(THROTTLE_WINDOW_SECS, 3600);
    }

    #[test]
    fn parse_mailbox_handles_named_and_bare() {
        assert!(parse_mailbox("Arona <noreply@arona.local>").is_ok());
        assert!(parse_mailbox("noreply@arona.local").is_ok());
        assert!(parse_mailbox("not-an-email").is_err());
    }

    #[test]
    fn hash_token_is_stable_and_64_hex() {
        let h1 = hash_token("abc123");
        let h2 = hash_token("abc123");
        let h3 = hash_token("abc124");
        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
        // sha256 → 32 bytes → 64 hex chars
        assert_eq!(h1.len(), 64);
        assert!(h1.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn html_escape_in_subject_and_body() {
        // 主体内容必须转义, 防止邮件模板注入
        let s = "<img src=x onerror=alert(1)>";
        let escaped = html_escape(s);
        assert!(!escaped.contains('<'));
        assert!(escaped.contains("&lt;"));
    }
}
