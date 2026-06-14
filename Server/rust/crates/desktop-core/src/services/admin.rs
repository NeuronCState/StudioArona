//! Admin 管理端点 — GET /api/admin/system, GET /api/admin/users

use crate::error::AppError;
use crate::state::AppState;
use axum::{extract::State, response::IntoResponse, Json};
use serde::Serialize;
use sqlx::Row;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct UserSummary {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct AdminStats {
    pub total_users: i64,
    pub total_feeds: i64,
    pub total_memories: i64,
    pub total_schedules: i64,
}

/// GET /api/admin/system
pub async fn get_system_info() -> Result<impl IntoResponse, AppError> {
    // 使用 std 获取系统信息
    let cores = std::thread::available_parallelism()
        .map(|n| n.get() as u64)
        .unwrap_or(1);

    // 简化的系统信息 (不依赖 sys-info crate)
    Ok(Json(serde_json::json!({
        "system": {
            "cores": cores,
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        }
    })))
}

/// GET /api/admin/users
pub async fn list_users(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query(
        "SELECT id::text, username, display_name, email, role, created_at::text
         FROM users ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let users: Vec<UserSummary> = rows.iter().map(|row| UserSummary {
        id: row.try_get("id").unwrap_or_default(),
        username: row.try_get("username").unwrap_or_default(),
        display_name: row.try_get("display_name").unwrap_or_default(),
        email: row.try_get("email").ok(),
        role: row.try_get("role").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }).collect();

    Ok(Json(serde_json::json!({
        "users": users,
        "total": users.len(),
    })))
}

/// GET /api/admin/stats
pub async fn get_admin_stats(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let total_users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let total_feeds: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM feed")
        .fetch_one(&state.db).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let total_memories: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM memory_entry")
        .fetch_one(&state.db).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let total_schedules: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM schedule")
        .fetch_one(&state.db).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    Ok(Json(AdminStats {
        total_users,
        total_feeds,
        total_memories,
        total_schedules,
    }))
}
