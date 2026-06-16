use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{auth::extract_user_id, AppState};

pub async fn list_schedules(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _user_id = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let rows = sqlx::query_as::<_, (String, String, Option<String>, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>, Option<String>, String)>(
        "SELECT id::text, title, description, start_at, end_at, location, visibility FROM schedules ORDER BY start_at ASC LIMIT 100"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let items: Vec<_> = rows.into_iter().map(|r| json!({
        "id": r.0,
        "title": r.1,
        "body": r.2,            // client 字段名: body
        "starts_at": r.3,       // client 字段名: starts_at
        "end_at": r.4,
        "location": r.5,
        "source": "server",
        "visibility": r.6,
    })).collect();

    Ok(Json(json!(items)))
}

#[derive(Deserialize)]
pub struct ScheduleInput {
    pub title: String,
    pub body: Option<String>,
    /// 客户端用 starts_at (snake_case 但语义跟 start_at 一致)
    #[serde(alias = "start_at")]
    pub starts_at: chrono::DateTime<chrono::Utc>,
    pub location: Option<String>,
    /// 默认 1 小时 — client 不发 end_at, server 推算
    #[serde(default)]
    pub duration_minutes: Option<i32>,
}

pub async fn create_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ScheduleInput>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;
    let duration = input.duration_minutes.unwrap_or(60);
    let end_at = input.starts_at + chrono::Duration::minutes(duration as i64);

    let row: (String, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
        "INSERT INTO schedules (user_id, title, description, start_at, end_at, location, visibility)
         VALUES ($1::uuid, $2, $3, $4::timestamptz, $5::timestamptz, $6, 'private')
         RETURNING id::text, start_at"
    )
    .bind(&user_id)
    .bind(&input.title)
    .bind(&input.body)
    .bind(input.starts_at.to_rfc3339())
    .bind(end_at.to_rfc3339())
    .bind(&input.location)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id": row.0,
            "title": input.title,
            "body": input.body,
            "starts_at": row.1,
            "end_at": end_at,
            "location": input.location,
            "source": "server",
            "visibility": "private",
        })),
    ))
}

pub async fn update_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<ScheduleInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;
    let duration = input.duration_minutes.unwrap_or(60);
    let end_at = input.starts_at + chrono::Duration::minutes(duration as i64);

    let affected = sqlx::query(
        "UPDATE schedules SET title = $1, description = $2, start_at = $3::timestamptz,
         end_at = $4::timestamptz, location = $5, updated_at = NOW()
         WHERE id = $6::uuid AND user_id = $7::uuid"
    )
    .bind(&input.title)
    .bind(&input.body)
    .bind(input.starts_at.to_rfc3339())
    .bind(end_at.to_rfc3339())
    .bind(&input.location)
    .bind(&id)
    .bind(&user_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if affected.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, Json(json!({"error": "schedule not found or not owned"}))));
    }

    Ok(Json(json!({
        "id": id,
        "title": input.title,
        "body": input.body,
        "starts_at": input.starts_at,
        "end_at": end_at,
        "location": input.location,
        "source": "server",
        "visibility": "private",
    })))
}

pub async fn delete_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let affected = sqlx::query("DELETE FROM schedules WHERE id = $1::uuid AND user_id = $2::uuid")
        .bind(&id)
        .bind(&user_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if affected.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, Json(json!({"error": "schedule not found or not owned"}))));
    }

    Ok(StatusCode::NO_CONTENT)
}
