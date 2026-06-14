//! desktop-core 库入口 (供 tauri-bridge 复用)

pub mod config;
pub mod error;
pub mod routes;
pub mod services;
pub mod state;

pub use error::{AppError, AppResult};
pub use state::AppState;
