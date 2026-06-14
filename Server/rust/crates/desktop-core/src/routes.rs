//! axum 路由 — Phase 1 顶替 v2 api-gateway 端点

use crate::middleware::auth_middleware;
use crate::services::*;
use crate::state::AppState;
use axum::{
    routing::{get, post, delete, patch, put},
    middleware,
    Router,
};
use std::sync::Arc;

pub fn router(state: AppState) -> Router {
    let state = Arc::new(state);
    
    // 需要认证的路由
    let protected_routes = Router::new()
        .route("/api/me", get(get_me).patch(update_me))
        .route("/api/me/preferences", patch(update_preferences))
        .route("/api/skills", get(list_skills))
        .route("/api/memory", get(list_memories).post(create_memory))
        .route("/api/memory/:id", delete(delete_memory))
        .route("/api/memory/search", post(search_memory))
        .route("/api/feeds", get(list_feeds).post(create_feed))
        .route("/api/feeds/:id", delete(delete_feed))
        .route("/api/feeds/:id/items", get(list_feed_items))
        .route("/api/schedules", get(list_schedules).post(create_schedule))
        .route("/api/schedules/:id", put(update_schedule).delete(delete_schedule))
        .route("/api/admin/system", get(get_system_info))
        .route("/api/admin/users", get(list_users))
        .route("/api/admin/stats", get(get_admin_stats))
        .route("/api/weather", get(get_weather))
        .layer(middleware::from_fn(auth_middleware));

    // 不需要认证的路由
    let public_routes = Router::new()
        .route("/health", get(health))
        .route("/api/auth/login", post(login))
        .route("/api/auth/refresh", post(refresh));

    // 合并路由
    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}
