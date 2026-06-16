use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{auth::extract_user_id, AppState};

/// 一条 schedule 的 SQL tuple — list / get / 冲突 body 都用它
type ScheduleRow = (
    String,         // 0: id
    String,         // 1: title
    Option<String>, // 2: description
    DateTime<Utc>,  // 3: start_at
    DateTime<Utc>,  // 4: end_at
    Option<String>, // 5: location
    String,         // 6: visibility
    DateTime<Utc>,  // 7: updated_at
);

fn row_to_json(r: &ScheduleRow) -> Value {
    json!({
        "id": r.0,
        "title": r.1,
        "body": r.2,
        "starts_at": r.3,
        "end_at": r.4,
        "location": r.5,
        "source": "server",
        "visibility": r.6,
        "updated_at": r.7,
    })
}

pub async fn list_schedules(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _user_id = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let rows = sqlx::query_as::<_, ScheduleRow>(
        "SELECT id::text, title, description, start_at, end_at, location, visibility, updated_at
         FROM schedules ORDER BY start_at ASC LIMIT 100",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let items: Vec<_> = rows.iter().map(row_to_json).collect();
    Ok(Json(json!(items)))
}

/// 单条 — 跟 list_schedules 同 owner 校验
pub async fn get_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let row: Option<ScheduleRow> = sqlx::query_as(
        "SELECT id::text, title, description, start_at, end_at, location, visibility, updated_at
         FROM schedules WHERE id = $1::uuid AND user_id = $2::uuid",
    )
    .bind(&id)
    .bind(&user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let row = row.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "schedule not found or not owned"})),
        )
    })?;

    Ok(Json(row_to_json(&row)))
}

#[derive(Deserialize)]
pub struct ScheduleInput {
    pub title: String,
    pub body: Option<String>,
    /// 客户端用 starts_at (snake_case 但语义跟 start_at 一致)
    #[serde(alias = "start_at")]
    pub starts_at: DateTime<Utc>,
    pub location: Option<String>,
    /// 默认 1 小时 — client 不发 end_at, server 推算
    #[serde(default)]
    pub duration_minutes: Option<i32>,
    /// 乐观锁 — client 上次见到的 server updated_at。空 / 不匹配 → 409。
    /// 注意: client 第一次 push (serverId 还没建好) 不传 → 跳过冲突检查。
    #[serde(default)]
    pub expected_updated_at: Option<DateTime<Utc>>,
}

/// 比较两个 JSON 在若干关键字段上是否相同 — 返字段名列表 (有差异)
fn field_diff(server: &Value, client: &Value) -> Vec<String> {
    const FIELDS: &[&str] = &["title", "body", "starts_at", "end_at", "location"];
    let mut diffs = Vec::new();
    for f in FIELDS {
        let a = server.get(*f).cloned().unwrap_or(Value::Null);
        let b = client.get(*f).cloned().unwrap_or(Value::Null);
        if a != b {
            diffs.push((*f).to_string());
        }
    }
    diffs
}

fn build_conflict_response(
    server_row: &ScheduleRow,
    client_doc: &Value,
) -> (StatusCode, Json<Value>) {
    let server_doc = row_to_json(server_row);
    let diffs = field_diff(&server_doc, client_doc);
    (
        StatusCode::CONFLICT,
        Json(json!({
            "error": "conflict",
            "server": server_doc,
            "client": client_doc,
            "field_diff": diffs,
        })),
    )
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

    let row: (String, DateTime<Utc>) = sqlx::query_as(
        "INSERT INTO schedules (user_id, title, description, start_at, end_at, location, visibility)
         VALUES ($1::uuid, $2, $3, $4::timestamptz, $5::timestamptz, $6, 'private')
         RETURNING id::text, start_at",
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

    // 乐观锁: 如果 client 带了 expected_updated_at, 先读 server 当前行,
    // 不匹配 → 409 (附 server + client doc + 字段 diff)
    if let Some(expected) = input.expected_updated_at {
        let server_row: Option<ScheduleRow> = sqlx::query_as(
            "SELECT id::text, title, description, start_at, end_at, location, visibility, updated_at
             FROM schedules WHERE id = $1::uuid AND user_id = $2::uuid",
        )
        .bind(&id)
        .bind(&user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

        let server_row = server_row.ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "schedule not found or not owned"})),
            )
        })?;

        // 时间精度匹配 — server updated_at 是 microsecond, client DateTime<Utc> 解析 ISO 时
        // 可能丢精度。允许 1 秒误差 (UI 编辑间隔不可能 < 1s)
        let delta = (server_row.7 - expected).num_seconds().abs();
        if delta > 1 {
            let client_doc = json!({
                "id": id,
                "title": input.title,
                "body": input.body,
                "starts_at": input.starts_at,
                "end_at": end_at,
                "location": input.location,
                "source": "client",
                "expected_updated_at": expected,
            });
            return Err(build_conflict_response(&server_row, &client_doc));
        }
    }

    let affected = sqlx::query(
        "UPDATE schedules SET title = $1, description = $2, start_at = $3::timestamptz,
         end_at = $4::timestamptz, location = $5, updated_at = NOW()
         WHERE id = $6::uuid AND user_id = $7::uuid",
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
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "schedule not found or not owned"})),
        ));
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
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "schedule not found or not owned"})),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}