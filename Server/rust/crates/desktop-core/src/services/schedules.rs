//! Schedule 管理端点 — GET/POST/PUT/DELETE /api/schedules

use crate::error::AppError;
use crate::state::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct ScheduleEntry {
    pub id: String,
    pub title: String,
    pub body: Option<String>,
    pub starts_at: String,
    pub ends_at: Option<String>,
    pub rrule: Option<String>,
    pub reminder_min: Option<i32>,
    pub status: String,
    pub source: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateScheduleRequest {
    pub title: String,
    pub body: Option<String>,
    pub starts_at: String,
    pub ends_at: Option<String>,
    pub rrule: Option<String>,
    pub reminder_min: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateScheduleRequest {
    pub title: Option<String>,
    pub body: Option<String>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub rrule: Option<String>,
    pub reminder_min: Option<i32>,
    pub status: Option<String>,
}

/// GET /api/schedules
pub async fn list_schedules(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b";

    let rows = sqlx::query(
        "SELECT id::text, title, body, starts_at::text, ends_at::text, rrule, reminder_min, status, source, created_at::text, updated_at::text
         FROM schedule WHERE user_id = $1::uuid ORDER BY starts_at ASC"
    )
    .bind(user_id)
    .fetch_all(&state.db).await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let entries: Vec<ScheduleEntry> = rows.iter().map(|row| ScheduleEntry {
        id: row.try_get("id").unwrap_or_default(),
        title: row.try_get("title").unwrap_or_default(),
        body: row.try_get("body").ok(),
        starts_at: row.try_get("starts_at").unwrap_or_default(),
        ends_at: row.try_get("ends_at").ok(),
        rrule: row.try_get("rrule").ok(),
        reminder_min: row.try_get("reminder_min").ok(),
        status: row.try_get("status").unwrap_or_default(),
        source: row.try_get("source").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }).collect();

    Ok(Json(serde_json::json!({ "schedules": entries, "total": entries.len() })))
}

/// POST /api/schedules
pub async fn create_schedule(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateScheduleRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b";

    let row = sqlx::query(
        "INSERT INTO schedule (user_id, title, body, starts_at, ends_at, rrule, reminder_min)
         VALUES ($1::uuid, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7)
         RETURNING id::text, title, body, starts_at::text, ends_at::text, rrule, reminder_min, status, source, created_at::text, updated_at::text"
    )
    .bind(user_id).bind(&body.title).bind(&body.body)
    .bind(&body.starts_at).bind(&body.ends_at)
    .bind(&body.rrule).bind(&body.reminder_min)
    .fetch_optional(&state.db).await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    match row {
        Some(r) => Ok((StatusCode::CREATED, Json(ScheduleEntry {
            id: r.try_get("id")?,
            title: r.try_get("title")?,
            body: r.try_get("body").ok(),
            starts_at: r.try_get("starts_at")?,
            ends_at: r.try_get("ends_at").ok(),
            rrule: r.try_get("rrule").ok(),
            reminder_min: r.try_get("reminder_min").ok(),
            status: r.try_get("status")?,
            source: r.try_get("source")?,
            created_at: r.try_get("created_at")?,
            updated_at: r.try_get("updated_at")?,
        }))),
        None => Err(AppError::Internal(anyhow::anyhow!("insert failed"))),
    }
}

/// PUT /api/schedules/:id
pub async fn update_schedule(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(body): Json<UpdateScheduleRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b";

    let row = sqlx::query(
        "UPDATE schedule SET
            title = COALESCE($1, title),
            body = COALESCE($2, body),
            starts_at = COALESCE($3::timestamptz, starts_at),
            ends_at = COALESCE($4::timestamptz, ends_at),
            rrule = COALESCE($5, rrule),
            reminder_min = COALESCE($6, reminder_min),
            status = COALESCE($7, status),
            updated_at = NOW()
         WHERE id = $8::uuid AND user_id = $9::uuid
         RETURNING id::text, title, body, starts_at::text, ends_at::text, rrule, reminder_min, status, source, created_at::text, updated_at::text"
    )
    .bind(&body.title).bind(&body.body)
    .bind(&body.starts_at).bind(&body.ends_at)
    .bind(&body.rrule).bind(&body.reminder_min)
    .bind(&body.status)
    .bind(&id).bind(user_id)
    .fetch_optional(&state.db).await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    match row {
        Some(r) => Ok(Json(ScheduleEntry {
            id: r.try_get("id")?,
            title: r.try_get("title")?,
            body: r.try_get("body").ok(),
            starts_at: r.try_get("starts_at")?,
            ends_at: r.try_get("ends_at").ok(),
            rrule: r.try_get("rrule").ok(),
            reminder_min: r.try_get("reminder_min").ok(),
            status: r.try_get("status")?,
            source: r.try_get("source")?,
            created_at: r.try_get("created_at")?,
            updated_at: r.try_get("updated_at")?,
        })),
        None => Err(AppError::NotFound("日程不存在".to_string())),
    }
}

/// DELETE /api/schedules/:id
pub async fn delete_schedule(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b";
    let result = sqlx::query("DELETE FROM schedule WHERE id = $1::uuid AND user_id = $2::uuid")
        .bind(&id).bind(user_id)
        .execute(&state.db).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("日程不存在".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}
