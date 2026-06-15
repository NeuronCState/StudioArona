use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};

use crate::AppState;

pub async fn list_vms(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _user_id = crate::auth::extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let rows = sqlx::query_as::<_, (String, String, Option<String>, i32, i32, i32, Option<String>, String)>(
        "SELECT id::text, name, host, cpu, memory_gb, disk_gb, os, status FROM vms ORDER BY created_at DESC LIMIT 100"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let items: Vec<_> = rows.into_iter().map(|r| json!({
        "id": r.0,
        "name": r.1,
        "host": r.2,
        "cpu": r.3,
        "memory_gb": r.4,
        "disk_gb": r.5,
        "os": r.6,
        "status": r.7,
    })).collect();

    Ok(Json(json!(items)))
}
