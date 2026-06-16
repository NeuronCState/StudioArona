use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{auth::extract_user_id, AppState};

// ─── Marketplace (mock) ─────────────────────────────────────────────────────

/// Marketplace "registry" is a static mock until the real registry ships.
/// Real registry / categories / search belong to a separate task (TODO).
fn marketplace_metadata(slug: &str) -> Value {
    json!({
        "slug": slug,
        "name": slug,
        "description": format!("Marketplace skill `{}` (metadata from local mock)", slug),
        "version": "0.1.0",
        "category": "general",
        "source": "marketplace",
    })
}

// ─── Install ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct InstallRequest {
    pub slug: String,
    /// Optional override; mostly for tests / local imports.
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
}

/// POST /api/skills/marketplace/install
///
/// Inserts a row into `skills` for the calling user. If the row already
/// exists (same slug), the existing row is returned (idempotent install).
///
/// We *always* succeed when the slug is non-empty — the marketplace is a
/// mock registry, so there's no upstream validation step. When the real
/// registry lands, this is where the lookup / fetch happens.
pub async fn install_skill(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<InstallRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let slug = input.slug.trim().to_string();
    if slug.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "slug is required"})),
        ));
    }

    // Pull metadata from the mock marketplace; let explicit body fields win.
    let meta = marketplace_metadata(&slug);
    let name = input.name.unwrap_or_else(|| {
        meta.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&slug)
            .to_string()
    });
    let version = input
        .version
        .unwrap_or_else(|| meta.get("version").and_then(|v| v.as_str()).unwrap_or("0.1.0").to_string());
    let description = input.description.or_else(|| {
        meta.get("description").and_then(|v| v.as_str()).map(|s| s.to_string())
    });
    let category = input.category.or_else(|| {
        meta.get("category").and_then(|v| v.as_str()).map(|s| s.to_string())
    });

    // Idempotent insert: if (user_id, slug) already exists, keep it and return
    // the existing row instead of erroring.
    let row: (String, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
        "INSERT INTO skills (user_id, slug, name, version, description, category, source)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 'marketplace')
         ON CONFLICT (user_id, slug) DO UPDATE SET slug = EXCLUDED.slug
         RETURNING id::text, installed_at",
    )
    .bind(&user_id)
    .bind(&slug)
    .bind(&name)
    .bind(&version)
    .bind(&description)
    .bind(&category)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let (id, installed_at) = row;
    tracing::info!(user_id = %user_id, slug = %slug, "skill installed");

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "installed": true,
            "skill": {
                "id": id,
                "slug": slug,
                "name": name,
                "version": version,
                "description": description,
                "category": category,
                "source": "marketplace",
                "installed_at": installed_at,
            }
        })),
    ))
}

// ─── List ──────────────────────────────────────────────────────────────────

/// GET /api/skills/installed — list skills installed by the calling user.
pub async fn list_installed_skills(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let rows = sqlx::query_as::<_, (String, String, String, String, Option<String>, Option<String>, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT id::text, slug, name, version, description, category, source, installed_at
         FROM skills WHERE user_id = $1::uuid
         ORDER BY installed_at DESC LIMIT 200",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let items: Vec<_> = rows.into_iter().map(|r| json!({
        "id": r.0,
        "slug": r.1,
        "name": r.2,
        "version": r.3,
        "description": r.4,
        "category": r.5,
        "source": r.6,
        "installed_at": r.7,
    })).collect();

    Ok(Json(json!(items)))
}

// ─── Uninstall ──────────────────────────────────────────────────────────────

/// DELETE /api/skills/:slug — uninstall a skill by slug for the calling user.
pub async fn uninstall_skill(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let affected = sqlx::query("DELETE FROM skills WHERE user_id = $1::uuid AND slug = $2")
        .bind(&user_id)
        .bind(&slug)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if affected.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, Json(json!({"error": "skill not found"}))));
    }

    tracing::info!(user_id = %user_id, slug = %slug, "skill uninstalled");
    Ok(StatusCode::NO_CONTENT)
}
