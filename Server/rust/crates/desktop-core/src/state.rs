//! 全局 app state — DB pool, cache, service clients

use crate::config::Config;
use anyhow::Result;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: PgPool,
    // TODO: 加 moka cache / reqwest client / hermes client / center client
}

impl AppState {
    pub async fn new(config: Config) -> Result<Self> {
        let db = sqlx::postgres::PgPoolOptions::new()
            .max_connections(config.database.max_connections)
            .connect(&config.database.url)
            .await?;

        Ok(Self {
            config: Arc::new(config),
            db,
        })
    }
}
