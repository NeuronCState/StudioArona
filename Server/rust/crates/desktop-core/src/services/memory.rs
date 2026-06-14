//! Memory 管理端点 — GET/POST/DELETE /api/memory
//!
//! 注意: 数据库表名是 `memory_entry`, 列名: kind (非 memory_type), weight (非 importance)

use crate::error::AppError;
use crate::state::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct MemoryEntry {
    pub id: String,
    pub content: String,
    pub kind: String,
    pub weight: f64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMemoryRequest {
    pub content: String,
    pub kind: Option<String>,
    pub weight: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct SearchMemoryRequest {
    pub query: String,
    pub limit: Option<i64>,
}

/// GET /api/memory
pub async fn list_memories(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b"; // demo user

    let rows = sqlx::query(
        "SELECT id::text, content, kind, weight, created_at::text
         FROM memory_entry WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 100"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let memories: Vec<MemoryEntry> = rows.iter().map(|row| {
        MemoryEntry {
            id: row.try_get("id").unwrap_or_default(),
            content: row.try_get("content").unwrap_or_default(),
            kind: row.try_get("kind").unwrap_or_default(),
            weight: row.try_get("weight").unwrap_or(1.0),
            created_at: row.try_get("created_at").unwrap_or_default(),
        }
    }).collect();

    Ok(Json(serde_json::json!({
        "memories": memories,
        "total": memories.len(),
    })))
}

/// POST /api/memory
pub async fn create_memory(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateMemoryRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b"; // demo user
    let kind = body.kind.unwrap_or_else(|| "fact".to_string());
    let weight = body.weight.unwrap_or(1.0);

    let row = sqlx::query(
        "INSERT INTO memory_entry (user_id, content, kind, weight)
         VALUES ($1::uuid, $2, $3, $4)
         RETURNING id::text, content, kind, weight, created_at::text"
    )
    .bind(user_id)
    .bind(&body.content)
    .bind(&kind)
    .bind(weight)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    match row {
        Some(r) => Ok((
            StatusCode::CREATED,
            Json(MemoryEntry {
                id: r.try_get("id")?,
                content: r.try_get("content")?,
                kind: r.try_get("kind")?,
                weight: r.try_get("weight")?,
                created_at: r.try_get("created_at")?,
            }),
        )),
        None => Err(AppError::Internal(anyhow::anyhow!("insert failed"))),
    }
}

/// DELETE /api/memory/:id
pub async fn delete_memory(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b"; // demo user

    let result = sqlx::query(
        "DELETE FROM memory_entry WHERE id = $1::uuid AND user_id = $2::uuid"
    )
    .bind(&id)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("记忆不存在".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/memory/search
pub async fn search_memory(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SearchMemoryRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b"; // demo user
    let limit = body.limit.unwrap_or(20);

    let rows = sqlx::query(
        "SELECT id::text, content, kind, weight, created_at::text
         FROM memory_entry
         WHERE user_id = $1::uuid AND content ILIKE $2
         ORDER BY weight DESC, created_at DESC
         LIMIT $3"
    )
    .bind(user_id)
    .bind(format!("%{}%", body.query))
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let memories: Vec<MemoryEntry> = rows.iter().map(|row| {
        MemoryEntry {
            id: row.try_get("id").unwrap_or_default(),
            content: row.try_get("content").unwrap_or_default(),
            kind: row.try_get("kind").unwrap_or_default(),
            weight: row.try_get("weight").unwrap_or(1.0),
            created_at: row.try_get("created_at").unwrap_or_default(),
        }
    }).collect();

    Ok(Json(serde_json::json!({
        "memories": memories,
        "total": memories.len(),
    })))
}