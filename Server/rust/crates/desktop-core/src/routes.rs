//! axum 路由 — Phase 1 顶替 v2 api-gateway 端点

use crate::services::{login, refresh};
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;

pub fn router(state: AppState) -> Router {
    let state = Arc::new(state);
    Router::new()
        .route("/health", get(health))
        .route("/api/auth/login", post(login))
        .route("/api/auth/refresh", post(refresh))
        // TODO: 顶替 v2 api-gateway 全部 endpoint:
        //   /api/auth/{register,logout}
        //   /api/users, /api/me, /api/me/preferences
        //   /api/skills, /api/skills/marketplace/{search,install,categories,favorites,trending,installed}
        //   /api/memory, /api/feeds, /api/schedules, /api/vms, /api/admin
        //   /api/weather, /api/notifications
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

