use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::{json, Value};

use crate::{auth::extract_user_id, AppState};

/// VM row shape (matches `vms` table schema in Server/infra/db/versions)
/// id, name, host, cpu, memory_gb, disk_gb, os, status
type VmRow = (
    String,         // id (text)
    String,         // name
    Option<String>, // host
    i32,            // cpu
    i32,            // memory_gb
    i32,            // disk_gb
    Option<String>, // os
    String,         // status
);

fn row_to_json(r: VmRow) -> Value {
    json!({
        "id": r.0,
        "name": r.1,
        "host": r.2,
        "cpu": r.3,
        "memory_gb": r.4,
        "disk_gb": r.5,
        "os": r.6,
        "status": r.7,
    })
}

/// GET /api/vms — list VMs owned by the caller.
pub async fn list_vms(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let rows: Vec<VmRow> = sqlx::query_as(
        "SELECT id::text, name, host, cpu, memory_gb, disk_gb, os, status
         FROM vms
         WHERE user_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 100",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    let items: Vec<_> = rows.into_iter().map(row_to_json).collect();
    Ok(Json(json!(items)))
}

/// Resolve a VM by id and check the caller owns it.
/// Returns the row on success, or a `(StatusCode, Json)` error tuple on failure.
async fn load_owned_vm(
    state: &AppState,
    headers: &HeaderMap,
    vm_id: &str,
) -> Result<VmRow, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    // Validate id parses as UUID; bail early with 404 (not 500) if it doesn't
    if uuid::Uuid::parse_str(vm_id).is_err() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "vm not found"})),
        ));
    }

    let row: Option<VmRow> = sqlx::query_as(
        "SELECT id::text, name, host, cpu, memory_gb, disk_gb, os, status
         FROM vms WHERE id = $1::uuid AND user_id = $2::uuid",
    )
    .bind(vm_id)
    .bind(&user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    row.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "vm not found"})),
        )
    })
}

/// Mutate vms.status in the DB. Real libvirt / qemu / vmware integration is left as
/// TODO (S1b spec); we only persist the status row + return the new state to the client.
/// Mocks happen by overwriting the row, not by mutating in-memory state, so the
/// status survives process restart and matches what other endpoints see.
async fn set_vm_status(
    state: &AppState,
    user_id: &str,
    vm_id: &str,
    new_status: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    // 必须 user_id 过滤: load_owned_vm 已经在前面校验了, 但这里也再 bind 防 TOCTOU
    let affected = sqlx::query(
        "UPDATE vms SET status = $1, updated_at = NOW()
         WHERE id = $2::uuid AND user_id = $3::uuid",
    )
    .bind(new_status)
    .bind(vm_id)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "vm not found"})),
        ));
    }
    Ok(())
}

/// POST /api/vms/:id/start — mock: flip status -> "running"
pub async fn start_vm(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let row = load_owned_vm(&state, &headers, &id).await?;
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    set_vm_status(&state, &user_id, &id, "running").await?;
    tracing::info!(vm_id = %id, name = %row.1, "vm start (mock)");
    Ok(Json(json!({
        "id": row.0,
        "name": row.1,
        "status": "running",
    })))
}

/// POST /api/vms/:id/stop — mock: flip status -> "stopped"
pub async fn stop_vm(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let row = load_owned_vm(&state, &headers, &id).await?;
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    set_vm_status(&state, &user_id, &id, "stopped").await?;
    tracing::info!(vm_id = %id, name = %row.1, "vm stop (mock)");
    Ok(Json(json!({
        "id": row.0,
        "name": row.1,
        "status": "stopped",
    })))
}

/// POST /api/vms/:id/restart — mock: stop then start
pub async fn restart_vm(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let row = load_owned_vm(&state, &headers, &id).await?;
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    set_vm_status(&state, &user_id, &id, "stopped").await?;
    set_vm_status(&state, &user_id, &id, "running").await?;
    tracing::info!(vm_id = %id, name = %row.1, "vm restart (mock)");
    Ok(Json(json!({
        "id": row.0,
        "name": row.1,
        "status": "running",
    })))
}
