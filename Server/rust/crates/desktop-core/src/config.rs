//! 应用配置 — 从 .env.local / config.toml 加载

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub llm: LlmConfig,
    pub smtp: SmtpConfig,
    pub auth: AuthConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub bind: String,  // e.g. "127.0.0.1:8080"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub mode: String,            // "postgres" (online) or "sqlite" (offline)
    pub url: String,             // PG connection string or SQLite file path
    pub max_connections: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    pub provider: String,         // "minimax" | "openai" | "anthropic" | "ollama"
    pub api_key: String,
    pub base_url: String,
    pub mini_max_5h_quota: u32,  // 触发 5h quota 守卫的 token 上限
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub from_email: String,
    pub from_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub access_token_ttl_min: i64,
    pub refresh_token_ttl_day: i64,
}

impl Config {
    /// 从 .env.local + 环境变量加载 (跟 v2 Python 端兼容字段名)
    pub fn load() -> anyhow::Result<Self> {
        // Phase 1 stub: 全部从 env 读, 后续可加 config.toml
        Ok(Self {
            server: ServerConfig {
                bind: std::env::var("BIND_ADDR")
                    .unwrap_or_else(|_| "127.0.0.1:8080".to_string()),
            },
            database: DatabaseConfig {
                mode: std::env::var("DATABASE_MODE").unwrap_or_else(|_| "postgres".to_string()),
                url: std::env::var("DATABASE_URL")
                    .unwrap_or_else(|_| "postgresql://javis:javis@localhost:5432/javis".to_string()),
                max_connections: std::env::var("DB_MAX_CONNECTIONS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10),
            },
            llm: LlmConfig {
                provider: std::env::var("LLM_PROVIDER")
                    .unwrap_or_else(|_| "minimax".to_string()),
                api_key: std::env::var("MINIMAX_API_KEY")
                    .or_else(|_| std::env::var("OPENAI_API_KEY"))
                    .unwrap_or_default(),
                base_url: std::env::var("LLM_BASE_URL")
                    .unwrap_or_else(|_| "https://api.minimaxi.com/v1".to_string()),
                mini_max_5h_quota: std::env::var("MINIMAX_5H_QUOTA")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(400_000),
            },
            smtp: SmtpConfig {
                host: std::env::var("NOTIFY_SMTP_HOST")
                    .unwrap_or_else(|_| "smtp.qq.com".to_string()),
                port: std::env::var("NOTIFY_SMTP_PORT")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(465),
                user: std::env::var("NOTIFY_SMTP_USER")
                    .unwrap_or_default(),
                password: std::env::var("NOTIFY_SMTP_PASS")
                    .unwrap_or_default(),
                from_email: std::env::var("NOTIFY_FROM_EMAIL")
                    .unwrap_or_default(),
                from_name: std::env::var("NOTIFY_FROM_NAME")
                    .unwrap_or_else(|_| "什亭之匣 AI".to_string()),
            },
            auth: AuthConfig {
                jwt_secret: std::env::var("JWT_SECRET")
                    .unwrap_or_else(|_| "change-me-in-production".to_string()),
                access_token_ttl_min: 30,
                refresh_token_ttl_day: 30,
            },
        })
    }
}

pub fn project_root() -> PathBuf {
    // Cargo workspace root
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .expect("project root not found")
}
