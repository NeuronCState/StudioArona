use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};

use crate::AppState;

pub async fn list_feeds(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _user_id = crate::auth::extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, String, bool, chrono::DateTime<chrono::Utc>)>(
        "SELECT id::text, url, title, source, priority, enabled, created_at FROM feeds ORDER BY created_at DESC LIMIT 100"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let items: Vec<_> = rows.into_iter().map(|r| json!({
        "id": r.0,
        "url": r.1,
        "title": r.2,
        "source": r.3,
        "priority": r.4,
        "enabled": r.5,
        "created_at": r.6,
    })).collect();

    Ok(Json(json!(items)))
}
