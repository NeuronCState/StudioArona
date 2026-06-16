use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{auth::extract_user_id, AppState};

pub async fn list_memory_entries(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let rows = sqlx::query_as::<_, (String, String, String, i32, Option<String>, Value, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)>(
        "SELECT id::text, category, content, importance, source, metadata, created_at, updated_at
         FROM memory_entries WHERE user_id = $1::uuid
         ORDER BY updated_at DESC LIMIT 200"
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let items: Vec<_> = rows.into_iter().map(|r| json!({
        "id": r.0,
        "category": r.1,
        "content": r.2,
        "importance": r.3,
        "source": r.4,
        "metadata": r.5,
        "created_at": r.6,
        "updated_at": r.7,
    })).collect();

    Ok(Json(json!(items)))
}

#[derive(Deserialize)]
pub struct MemoryEntryInput {
    pub category: String,
    pub content: String,
    #[serde(default = "default_importance")]
    pub importance: i32,
    pub source: Option<String>,
    #[serde(default)]
    pub metadata: Value,
}

fn default_importance() -> i32 {
    3
}

pub async fn create_memory_entry(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<MemoryEntryInput>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    if input.category.is_empty() || input.content.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "category and content are required"})),
        ));
    }
    if !(1..=5).contains(&input.importance) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "importance must be 1..=5"})),
        ));
    }

    let row: (String, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
        "INSERT INTO memory_entries (user_id, category, content, importance, source, metadata)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         RETURNING id::text, created_at"
    )
    .bind(&user_id)
    .bind(&input.category)
    .bind(&input.content)
    .bind(input.importance)
    .bind(&input.source)
    .bind(&input.metadata)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id": row.0,
            "category": input.category,
            "content": input.content,
            "importance": input.importance,
            "source": input.source,
            "metadata": input.metadata,
            "created_at": row.1,
            "updated_at": row.1,
        })),
    ))
}

pub async fn update_memory_entry(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<MemoryEntryInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    if input.category.is_empty() || input.content.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "category and content are required"})),
        ));
    }
    if !(1..=5).contains(&input.importance) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "importance must be 1..=5"})),
        ));
    }

    let affected = sqlx::query(
        "UPDATE memory_entries SET category = $1, content = $2, importance = $3,
         source = $4, metadata = $5, updated_at = NOW()
         WHERE id = $6::uuid AND user_id = $7::uuid"
    )
    .bind(&input.category)
    .bind(&input.content)
    .bind(input.importance)
    .bind(&input.source)
    .bind(&input.metadata)
    .bind(&id)
    .bind(&user_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if affected.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, Json(json!({"error": "memory entry not found or not owned"}))));
    }

    Ok(Json(json!({
        "id": id,
        "category": input.category,
        "content": input.content,
        "importance": input.importance,
        "source": input.source,
        "metadata": input.metadata,
    })))
}

pub async fn delete_memory_entry(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let affected = sqlx::query("DELETE FROM memory_entries WHERE id = $1::uuid AND user_id = $2::uuid")
        .bind(&id)
        .bind(&user_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if affected.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, Json(json!({"error": "memory entry not found or not owned"}))));
    }

    Ok(StatusCode::NO_CONTENT)
}