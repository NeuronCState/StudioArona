//! Feed (RSS) 管理端点 — GET/POST/DELETE /api/feeds, GET /api/feeds/:id/items

use crate::error::AppError;
use crate::state::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct Feed {
    pub id: String,
    pub url: String,
    pub title: Option<String>,
    pub category: Option<String>,
    pub enabled: bool,
    pub last_fetched_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct FeedItem {
    pub id: String,
    pub feed_id: String,
    pub guid: String,
    pub title: String,
    pub link: Option<String>,
    pub summary: Option<String>,
    pub published_at: Option<String>,
    pub read: bool,
    pub starred: bool,
    pub fetched_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateFeedRequest {
    pub url: String,
    pub title: Option<String>,
    pub category: Option<String>,
}

/// GET /api/feeds
pub async fn list_feeds(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b";

    let rows = sqlx::query(
        "SELECT id::text, url, title, category, enabled, last_fetched_at::text, created_at::text
         FROM feed WHERE user_id = $1::uuid ORDER BY created_at DESC"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let feeds: Vec<Feed> = rows.iter().map(|row| Feed {
        id: row.try_get("id").unwrap_or_default(),
        url: row.try_get("url").unwrap_or_default(),
        title: row.try_get("title").ok(),
        category: row.try_get("category").ok(),
        enabled: row.try_get("enabled").unwrap_or(true),
        last_fetched_at: row.try_get("last_fetched_at").ok(),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }).collect();

    Ok(Json(serde_json::json!({ "feeds": feeds, "total": feeds.len() })))
}

/// POST /api/feeds
pub async fn create_feed(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateFeedRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b";

    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM feed WHERE user_id = $1::uuid AND url = $2"
    )
    .bind(user_id).bind(&body.url)
    .fetch_one(&state.db).await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    if existing > 0 {
        return Err(AppError::Conflict(
            "{\"code\":\"JAVIS_FEED_EXISTS\",\"message\":\"订阅源已存在\"}".to_string()
        ));
    }

    let row = sqlx::query(
        "INSERT INTO feed (user_id, url, title, category)
         VALUES ($1::uuid, $2, $3, $4)
         RETURNING id::text, url, title, category, enabled, created_at::text"
    )
    .bind(user_id).bind(&body.url).bind(&body.title).bind(&body.category)
    .fetch_optional(&state.db).await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    match row {
        Some(r) => Ok((StatusCode::CREATED, Json(Feed {
            id: r.try_get("id")?,
            url: r.try_get("url")?,
            title: r.try_get("title").ok(),
            category: r.try_get("category").ok(),
            enabled: r.try_get("enabled")?,
            last_fetched_at: None,
            created_at: r.try_get("created_at")?,
        }))),
        None => Err(AppError::Internal(anyhow::anyhow!("insert failed"))),
    }
}

/// DELETE /api/feeds/:id
pub async fn delete_feed(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b";
    let result = sqlx::query("DELETE FROM feed WHERE id = $1::uuid AND user_id = $2::uuid")
        .bind(&id).bind(user_id)
        .execute(&state.db).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("订阅源不存在".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/feeds/:id/items
pub async fn list_feed_items(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(feed_id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query(
        "SELECT id::text, feed_id::text, guid, title, link, summary, published_at::text, read, starred, fetched_at::text
         FROM feed_item WHERE feed_id = $1::uuid ORDER BY published_at DESC LIMIT 50"
    )
    .bind(&feed_id)
    .fetch_all(&state.db).await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let items: Vec<FeedItem> = rows.iter().map(|row| FeedItem {
        id: row.try_get("id").unwrap_or_default(),
        feed_id: row.try_get("feed_id").unwrap_or_default(),
        guid: row.try_get("guid").unwrap_or_default(),
        title: row.try_get("title").unwrap_or_default(),
        link: row.try_get("link").ok(),
        summary: row.try_get("summary").ok(),
        published_at: row.try_get("published_at").ok(),
        read: row.try_get("read").unwrap_or(false),
        starred: row.try_get("starred").unwrap_or(false),
        fetched_at: row.try_get("fetched_at").unwrap_or_default(),
    }).collect();

    Ok(Json(serde_json::json!({ "items": items, "total": items.len() })))
}
