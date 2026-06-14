//! axum 路由 — Phase 1 顶替 v2 api-gateway 端点

use crate::services::*;
use crate::state::AppState;
use axum::{
    routing::{get, post, delete, patch},
    Router,
};
use std::sync::Arc;

pub fn router(state: AppState) -> Router {
    let state = Arc::new(state);
    Router::new()
        // Health
        .route("/health", get(health))
        
        // Auth
        .route("/api/auth/login", post(login))
        .route("/api/auth/refresh", post(refresh))
        
        // User profile
        .route("/api/me", get(get_me).patch(update_me))
        .route("/api/me/preferences", patch(update_preferences))
        
        // Skills (file-based, read-only)
        .route("/api/skills", get(list_skills))
        
        // Memory
        .route("/api/memory", get(list_memories).post(create_memory))
        .route("/api/memory/:id", delete(delete_memory))
        .route("/api/memory/search", post(search_memory))
        
        // TODO: 顶替 v2 api-gateway 全部 endpoint:
        //   /api/users (admin)
        //   /api/skills/marketplace/{search,install,categories,favorites,trending,installed}
        //   /api/feeds, /api/schedules, /api/vms, /api/admin
        //   /api/weather, /api/notifications
        
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}
