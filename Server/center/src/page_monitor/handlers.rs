//! Page monitor HTTP handlers — CRUD + 事件列表.
//!
//! 业务逻辑 (单次检查 + 写库 + 推送) 在 cron.rs 的 check_one 里,
//! 这里只做参数校验 + 鉴权 + DB 行映射.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{auth::extract_user_id, AppState};

use super::canonicalize::validate_url;

#[derive(Deserialize)]
pub struct PageMonitorInput {
    pub url: String,
    pub label: String,
    pub css_selector: Option<String>,
    #[serde(default = "default_interval")]
    pub check_interval_min: i32,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

/// PATCH 用 — 全字段 Optional, 前端可以只发变更部分 (暂停/启用只发 { enabled: bool })
#[derive(Deserialize)]
pub struct PageMonitorPatchInput {
    pub url: Option<String>,
    pub label: Option<String>,
    pub css_selector: Option<String>,
    pub check_interval_min: Option<i32>,
    pub enabled: Option<bool>,
}

fn default_interval() -> i32 {
    15
}

fn default_enabled() -> bool {
    true
}

type MonitorRow = (
    String,
    String,
    String,
    String,
    Option<String>,
    Option<chrono::DateTime<chrono::Utc>>,
    Option<chrono::DateTime<chrono::Utc>>,
    i32,
    bool,
    chrono::DateTime<chrono::Utc>,
    chrono::DateTime<chrono::Utc>,
);

fn monitor_to_json(r: MonitorRow) -> Value {
    json!({
        "id": r.0,
        "url": r.1,
        "label": r.2,
        "css_selector": r.3,
        "last_hash": r.4,
        "last_checked_at": r.5,
        "last_changed_at": r.6,
        "check_interval_min": r.7,
        "enabled": r.8,
        "created_at": r.9,
        "updated_at": r.10,
    })
}

pub async fn list_page_monitors(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let rows: Vec<MonitorRow> = sqlx::query_as(
        "SELECT id::text, url, label, css_selector, last_hash, last_checked_at,
                last_changed_at, check_interval_min, enabled, created_at, updated_at
         FROM page_monitors
         WHERE user_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 200",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!(rows
        .into_iter()
        .map(monitor_to_json)
        .collect::<Vec<_>>())))
}

pub async fn create_page_monitor(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<PageMonitorInput>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let url = input.url.trim();
    if !validate_url(url) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "url must start with http:// or https://"})),
        ));
    }
    let label = input.label.trim();
    if label.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "label is required"})),
        ));
    }
    if !(1..=1440).contains(&input.check_interval_min) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "check_interval_min must be 1..=1440"})),
        ));
    }

    let selector = input.css_selector.as_deref().unwrap_or("body").trim();
    let row: MonitorRow = sqlx::query_as(
        "INSERT INTO page_monitors
            (user_id, url, label, css_selector, check_interval_min, enabled)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         RETURNING id::text, url, label, css_selector, last_hash, last_checked_at,
                   last_changed_at, check_interval_min, enabled, created_at, updated_at",
    )
    .bind(&user_id)
    .bind(url)
    .bind(label)
    .bind(if selector.is_empty() {
        "body"
    } else {
        selector
    })
    .bind(input.check_interval_min)
    .bind(input.enabled)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("duplicate") || msg.contains("unique") {
            (
                StatusCode::CONFLICT,
                Json(json!({"error": "page monitor url already exists"})),
            )
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": msg})),
            )
        }
    })?;

    Ok((StatusCode::CREATED, Json(monitor_to_json(row))))
}

pub async fn update_page_monitor(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<PageMonitorPatchInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    if uuid::Uuid::parse_str(&id).is_err() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "page monitor not found"})),
        ));
    }

    // 字段校验 — 只校验被传入的字段, 没传就不动
    if let Some(ref u) = input.url {
        if !validate_url(u.trim()) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "url must start with http:// or https://"})),
            ));
        }
    }
    if let Some(ref l) = input.label {
        if l.trim().is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "label cannot be empty"})),
            ));
        }
    }
    if let Some(i) = input.check_interval_min {
        if !(1..=1440).contains(&i) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "check_interval_min must be 1..=1440"})),
            ));
        }
    }

    // 用 COALESCE 保持未传字段不变; selector 空字符串视为 "body"
    let selector_value: Option<String> = input.css_selector.as_ref().map(|s| {
        let t = s.trim();
        if t.is_empty() {
            "body".to_string()
        } else {
            t.to_string()
        }
    });

    let row: Option<MonitorRow> = sqlx::query_as(
        "UPDATE page_monitors
         SET url           = COALESCE($1, url),
             label         = COALESCE($2, label),
             css_selector  = COALESCE($3, css_selector),
             check_interval_min = COALESCE($4, check_interval_min),
             enabled       = COALESCE($5, enabled),
             updated_at    = NOW()
         WHERE id = $6::uuid AND user_id = $7::uuid
         RETURNING id::text, url, label, css_selector, last_hash, last_checked_at,
                   last_changed_at, check_interval_min, enabled, created_at, updated_at",
    )
    .bind(input.url.as_ref().map(|s| s.trim().to_string()))
    .bind(input.label.as_ref().map(|s| s.trim().to_string()))
    .bind(selector_value)
    .bind(input.check_interval_min)
    .bind(input.enabled)
    .bind(&id)
    .bind(&user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    row.map(|r| Json(monitor_to_json(r))).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "page monitor not found"})),
        )
    })
}

pub async fn delete_page_monitor(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let affected =
        sqlx::query("DELETE FROM page_monitors WHERE id = $1::uuid AND user_id = $2::uuid")
            .bind(&id)
            .bind(&user_id)
            .execute(&state.db)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": e.to_string()})),
                )
            })?;

    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "page monitor not found"})),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_page_monitor_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    if uuid::Uuid::parse_str(&id).is_err() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "page monitor not found"})),
        ));
    }

    let owned: Option<(String,)> = sqlx::query_as(
        "SELECT id::text FROM page_monitors WHERE id = $1::uuid AND user_id = $2::uuid",
    )
    .bind(&id)
    .bind(&user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    if owned.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "page monitor not found"})),
        ));
    }

    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            Option<String>,
            chrono::DateTime<chrono::Utc>,
            chrono::DateTime<chrono::Utc>,
        ),
    >(
        "SELECT id::text, title, link, summary, published_at, created_at
         FROM page_monitor_events
         WHERE monitor_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 200",
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!(rows
        .into_iter()
        .map(|r| json!({
            "id": r.0,
            "title": r.1,
            "link": r.2,
            "summary": r.3,
            "published_at": r.4,
            "created_at": r.5,
        }))
        .collect::<Vec<_>>())))
}
