//! desktop-core: StudioArona 桌面 app 的 Rust 后端 (单进程)
//!
//! 顶替以下 v2 服务 (Server/python/services/):
//!   - api-gateway (业务 API)
//!   - llm_gateway (LLM 代理 + 配额守卫)
//!   - agent/bridge (Hermes + RSS + Weather)
//!   - perception (截图 / OCR / 语音)
//!   - weather_fetcher
//!
//! 详细架构: `docs/v3-rust-architecture.md`

use anyhow::Result;
use tokio::net::TcpListener;
use tracing::info;

mod config;
mod error;
mod middleware;
mod routes;
mod services;
mod state;

pub use error::{AppError, AppResult};
pub use state::AppState;

#[tokio::main]
async fn main() -> Result<()> {
    // 1. 加载配置 (.env.local + config.toml 覆盖)
    let cfg = config::Config::load()?;
    info!(
        "loaded config: bind={}, db_mode={}",
        cfg.server.bind, cfg.database.mode
    );

    // 2. 初始化 tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,sqlx=warn")),
        )
        .init();

    // 3. 初始化 AppState (DB pool + cache + service clients)
    let state = AppState::new(cfg.clone()).await?;

    // 4. 构建 axum router
    let app = routes::router(state);

    // 5. 启动 HTTP server
    let listener = TcpListener::bind(&cfg.server.bind).await?;
    info!("listening on {}", cfg.server.bind);
    axum::serve(listener, app).await?;

    Ok(())
}
