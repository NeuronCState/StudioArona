//! Cron status tracker — 让 cron 任务上报心跳 + 错误, 给 /api/system/cron-status 用.
//!
//! 设计: 每个 cron 一个 name, 记录 (last_tick_at, last_error, last_ok_at, total_ticks, total_errors).
//! 用 std::sync::Mutex 保护 HashMap — 低频写 (cron 每 5-15min 一次), 锁竞争可忽略.

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct CronState {
    last_tick_at: Option<DateTime<Utc>>,
    last_ok_at: Option<DateTime<Utc>>,
    last_error: Option<String>,
    last_error_ts: Option<DateTime<Utc>>,
    total_ticks: u64,
    total_errors: u64,
}

#[derive(Clone, Default)]
pub struct CronTracker {
    inner: Arc<Mutex<HashMap<String, CronState>>>,
}

impl CronTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_tick(&self, name: &str) {
        let mut g = self.inner.lock().expect("cron tracker lock");
        let s = g.entry(name.to_string()).or_default();
        s.last_tick_at = Some(Utc::now());
        s.total_ticks += 1;
    }

    pub fn record_ok(&self, name: &str) {
        let mut g = self.inner.lock().expect("cron tracker lock");
        let s = g.entry(name.to_string()).or_default();
        s.last_ok_at = Some(Utc::now());
        s.last_error = None;
        s.last_error_ts = None;
    }

    pub fn record_error(&self, name: &str, err: &str) {
        let mut g = self.inner.lock().expect("cron tracker lock");
        let s = g.entry(name.to_string()).or_default();
        s.last_tick_at = Some(Utc::now());
        let truncated = truncate(err, 500);
        s.last_error = Some(truncated);
        s.last_error_ts = Some(Utc::now());
        s.total_errors += 1;
    }

    pub fn snapshot(&self) -> Vec<CronStatus> {
        let g = self.inner.lock().expect("cron tracker lock");
        let mut out: Vec<CronStatus> = g
            .iter()
            .map(|(name, s)| CronStatus {
                name: name.clone(),
                last_tick_at: s.last_tick_at.map(|d| d.to_rfc3339()),
                last_ok_at: s.last_ok_at.map(|d| d.to_rfc3339()),
                last_error: s.last_error.clone(),
                last_error_ts: s.last_error_ts.map(|d| d.to_rfc3339()),
                total_ticks: s.total_ticks,
                total_errors: s.total_errors,
            })
            .collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while !s.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    format!("{}…", &s[..end])
}

#[derive(Serialize)]
pub struct CronStatus {
    pub name: String,
    pub last_tick_at: Option<String>,
    pub last_ok_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error_ts: Option<String>,
    pub total_ticks: u64,
    pub total_errors: u64,
}

use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};

use crate::{auth, AppState};

/// GET /api/system/cron-status — 需 owner/admin 鉴权 (P2#3)
/// 错误信息已 truncate(500), 不会再泄漏完整 SQL/URL/SMTP 凭据路径.
pub async fn cron_status_handler(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (_, _, role) =
        auth::extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    if !matches!(role.as_str(), "owner" | "admin") {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "cron status requires owner/admin role"})),
        ));
    }
    Ok(Json(json!({
        "crons": state.cron_tracker.snapshot(),
    })))
}
