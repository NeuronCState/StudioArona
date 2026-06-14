//! 用户个人信息端点 — GET/PATCH /api/me, PATCH /api/me/preferences

use crate::error::AppError;
use crate::state::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct ProfileUpdate {
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PreferenceUpdate {
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub role: String,
    pub created_at: String,
    pub preferences: serde_json::Value,
    pub face_enrolled: bool,
}

/// GET /api/me
pub async fn get_me(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    // TODO: 从 JWT token 获取 user_id (需要 extract middleware)
    // 暂时从 query 或 header 获取
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b"; // demo user

    let row = sqlx::query(
        "SELECT id::text, username, display_name, email, role, created_at::text
         FROM users WHERE id = $1::uuid"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("用户不存在".to_string())),
    };

    let user_id: String = row.try_get("id")?;
    let username: String = row.try_get("username")?;
    let display_name: String = row.try_get("display_name")?;
    let email: Option<String> = row.try_get("email")?;
    let role: String = row.try_get("role")?;
    let created_at: String = row.try_get("created_at")?;

    // 获取用户偏好
    let prefs_rows = sqlx::query("SELECT key, value_json FROM user_preferences WHERE user_id = $1::uuid")
        .bind(&user_id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let mut prefs = serde_json::Map::new();
    for pref_row in prefs_rows {
        let key: String = pref_row.try_get("key")?;
        let value_str: String = pref_row.try_get("value_json")?;
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&value_str) {
            prefs.insert(key, value);
        }
    }

    // 检查人脸注册
    let face_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_face_embeddings WHERE user_id = $1::uuid"
    )
    .bind(&user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    Ok(Json(MeResponse {
        id: user_id,
        username,
        display_name,
        email,
        role,
        created_at,
        preferences: serde_json::Value::Object(prefs),
        face_enrolled: face_count > 0,
    }))
}

/// PATCH /api/me
pub async fn update_me(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ProfileUpdate>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b"; // demo user

    // 构建动态更新
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn sqlx::Encode<'_, sqlx::Postgres> + Send>> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref username) = body.username {
        updates.push(format!("username = ${}", param_idx));
        params.push(Box::new(username.clone()));
        param_idx += 1;
    }
    if let Some(ref display_name) = body.display_name {
        updates.push(format!("display_name = ${}", param_idx));
        params.push(Box::new(display_name.clone()));
        param_idx += 1;
    }
    if let Some(ref email) = body.email {
        if email.is_empty() {
            updates.push("email = NULL".to_string());
        } else {
            // 验证邮箱唯一性
            let existing = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM users WHERE email = $1 AND id != $2::uuid"
            )
            .bind(email)
            .bind(user_id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

            if existing > 0 {
                return Err(AppError::Conflict(
                    "{\"code\":\"JAVIS_EMAIL_TAKEN\",\"message\":\"邮箱已被使用\"}".to_string()
                ));
            }
            updates.push(format!("email = ${}", param_idx));
            params.push(Box::new(email.clone()));
            param_idx += 1;
        }
    }

    if updates.is_empty() {
        return Err(AppError::BadRequest("没有需要更新的字段".to_string()));
    }

    let query = format!(
        "UPDATE users SET {} WHERE id = ${}::uuid RETURNING id::text, username, display_name, email, role",
        updates.join(", "),
        param_idx
    );

    // 由于动态参数绑定复杂，这里简化为固定字段更新
    let result = sqlx::query(
        "UPDATE users SET
            username = COALESCE($1, username),
            display_name = COALESCE($2, display_name),
            email = $3
         WHERE id = $4::uuid
         RETURNING id::text, username, display_name, email, role"
    )
    .bind(&body.username)
    .bind(&body.display_name)
    .bind(&body.email)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    match result {
        Some(row) => Ok(Json(serde_json::json!({
            "id": row.try_get::<String, _>("id")?,
            "username": row.try_get::<String, _>("username")?,
            "display_name": row.try_get::<String, _>("display_name")?,
            "email": row.try_get::<Option<String>, _>("email")?,
            "role": row.try_get::<String, _>("role")?,
        }))),
        None => Err(AppError::NotFound("用户不存在".to_string())),
    }
}

/// PATCH /api/me/preferences
pub async fn update_preferences(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PreferenceUpdate>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b"; // demo user
    let value_json = serde_json::to_string(&body.value)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("json error: {e}")))?;

    // Upsert preference
    sqlx::query(
        "INSERT INTO user_preferences (user_id, key, value_json)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value_json = $3"
    )
    .bind(user_id)
    .bind(&body.key)
    .bind(&value_json)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    // 返回所有偏好
    let prefs_rows = sqlx::query("SELECT key, value_json FROM user_preferences WHERE user_id = $1::uuid")
        .bind(user_id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let mut prefs = serde_json::Map::new();
    for pref_row in prefs_rows {
        let key: String = pref_row.try_get("key")?;
        let value_str: String = pref_row.try_get("value_json")?;
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&value_str) {
            prefs.insert(key, value);
        }
    }

    // 获取用户信息
    let user_row = sqlx::query(
        "SELECT id::text, username, display_name, email, role FROM users WHERE id = $1::uuid"
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    Ok(Json(serde_json::json!({
        "id": user_row.try_get::<String, _>("id")?,
        "username": user_row.try_get::<String, _>("username")?,
        "display_name": user_row.try_get::<String, _>("display_name")?,
        "email": user_row.try_get::<Option<String>, _>("email")?,
        "role": user_row.try_get::<String, _>("role")?,
        "preferences": serde_json::Value::Object(prefs),
    })))
}
