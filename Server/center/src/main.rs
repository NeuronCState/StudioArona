use anyhow::Result;
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use uuid::Uuid;

mod auth;
mod config;
mod schedule;
mod rss;
mod memory;
mod skills;
mod vms;
mod weather;

use auth::{
    hash_password, verify_password, Claims, LoginRequest, RefreshRequest, RegisterRequest,
    TokenPair, User,
};
use config::Config;
use weather::MetricsCache;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub metrics_cache: MetricsCache,
}

async fn health() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "service": "studio-arona-center",
        "version": "0.1.0"
    }))
}

async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<TokenPair>), (StatusCode, Json<Value>)> {
    if req.username.is_empty() || req.password.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "username/password required"})),
        ));
    }

    let password_hash = hash_password(&req.password)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let id = Uuid::new_v4().to_string();
    let display_name = req.display_name.clone().unwrap_or_else(|| req.username.clone());

    sqlx::query(
        "INSERT INTO users (id, username, display_name, password_hash, role) VALUES ($1::uuid, $2, $3, $4, 'member')"
    )
    .bind(&id)
    .bind(&req.username)
    .bind(&display_name)
    .bind(&password_hash)
    .execute(&state.db)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("duplicate") {
            (StatusCode::CONFLICT, Json(json!({"error": "username already exists"})))
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": msg})))
        }
    })?;

    let user = User {
        id: id.clone(),
        username: req.username.clone(),
        display_name,
        role: "member".to_string(),
    };

    let tokens = auth::create_tokens(&user, &state.config)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    Ok((StatusCode::CREATED, Json(tokens)))
}

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<TokenPair>, (StatusCode, Json<Value>)> {
    let row = sqlx::query_as::<_, (String, String, String, String, String)>(
        "SELECT id::text, username, display_name, password_hash, role FROM users WHERE username = $1"
    )
    .bind(&req.username)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?
    .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(json!({"error": "invalid credentials"}))))?;

    let (id, username, display_name, password_hash, role) = row;

    let ok = verify_password(&req.password, &password_hash)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;
    if !ok {
        return Err((StatusCode::UNAUTHORIZED, Json(json!({"error": "invalid credentials"}))));
    }

    let user = User { id, username, display_name, role };
    let tokens = auth::create_tokens(&user, &state.config)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    Ok(Json(tokens))
}

async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<TokenPair>, (StatusCode, Json<Value>)> {
    let claims = auth::verify_token(&req.refresh_token, &state.config.jwt_secret)
        .map_err(|_| (StatusCode::UNAUTHORIZED, Json(json!({"error": "invalid token"}))))?;

    let row = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id::text, username, display_name, role FROM users WHERE id = $1::uuid"
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?
    .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(json!({"error": "user not found"}))))?;

    let user = User { id: row.0, username: row.1, display_name: row.2, role: row.3 };
    let tokens = auth::create_tokens(&user, &state.config)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;
    Ok(Json(tokens))
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "studio_arona_center=debug,tower_http=info".into()),
        )
        .init();

    let config = Config::from_env()?;
    tracing::info!("Starting Studio Arona Center daemon on :{}", config.port);

    // PG connect
    let db = sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await?;
    tracing::info!("PG connected");

    // Run migrations from infra/db/versions
    sqlx::migrate!("../infra/db/versions")
        .run(&db)
        .await?;
    tracing::info!("migrations applied");

    // Seed default admin if no users
    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&db)
        .await?;
    if user_count == 0 {
        let admin_hash = hash_password("admin123")
            .map_err(|e| anyhow::anyhow!("bcrypt: {}", e))?;
        sqlx::query(
            "INSERT INTO users (id, username, display_name, password_hash, role) VALUES ($1, 'admin', 'Admin', $2, 'admin')"
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&admin_hash)
        .execute(&db)
        .await?;
        tracing::info!("seeded default admin/admin123 (admin role)");
    }

    let state = AppState {
        db,
        config: config.clone(),
        metrics_cache: MetricsCache::new(),
    };

    // S1c — initialize the in-process weather cache (5min TTL) and spawn the
    // RSS fetch cron (5min interval). Both run for the life of the process.
    weather::init_weather_cache();
    rss::start_cron(state.db.clone());

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/refresh", post(refresh))
        .route("/api/me", get(me))
.route("/api/feeds", get(rss::list_feeds).post(rss::create_feed))
        .route("/api/feeds/:id", axum::routing::patch(rss::update_feed).delete(rss::delete_feed))
        .route("/api/feeds/:id/items", get(rss::list_feed_items))
        .route("/api/memory/entries", get(memory::list_memory_entries).post(memory::create_memory_entry))
        .route("/api/memory/entries/:id", axum::routing::patch(memory::update_memory_entry).delete(memory::delete_memory_entry))
        .route("/api/schedules", get(schedule::list_schedules).post(schedule::create_schedule))
        .route("/api/schedules/:id", get(schedule::get_schedule).patch(schedule::update_schedule).delete(schedule::delete_schedule))
        .route("/api/vms", get(vms::list_vms))
        .route("/api/vms/:id/start", post(vms::start_vm))
        .route("/api/vms/:id/stop", post(vms::stop_vm))
        .route("/api/vms/:id/restart", post(vms::restart_vm))
        .route("/api/weather", get(weather::get_weather))
        .route("/api/system/metrics", get(weather::get_system_metrics))
        // S1c — skills install backend
        .route("/api/skills/marketplace/install", post(skills::install_skill))
        .route("/api/skills/installed", get(skills::list_installed_skills))
        .route("/api/skills/:slug", delete(skills::uninstall_skill))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn me(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(json!({"error": "missing token"}))))?;

    let claims: Claims = auth::verify_token(token, &state.config.jwt_secret)
        .map_err(|_| (StatusCode::UNAUTHORIZED, Json(json!({"error": "invalid token"}))))?;

    let row = sqlx::query_as::<_, (String, String, String, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT id::text, username, display_name, role, created_at FROM users WHERE id = $1::uuid"
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, Json(json!({"error": "user not found"}))))?;

    Ok(Json(json!({
        "id": row.0,
        "username": row.1,
        "display_name": row.2,
        "role": row.3,
        "created_at": row.4,
        "preferences": {},
        "face_enrolled": false,
    })))
}
