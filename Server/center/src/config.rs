use anyhow::{anyhow, Result};
use std::str::FromStr;

/// 运行环境. 控制启动时的安全门: 生产模式禁止默认 secret / 默认 admin / debug 日志.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppEnv {
    Development,
    Production,
}

impl FromStr for AppEnv {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self> {
        match s.to_ascii_lowercase().as_str() {
            "development" | "dev" | "" => Ok(AppEnv::Development),
            "production" | "prod" => Ok(AppEnv::Production),
            other => Err(anyhow!(
                "unknown APP_ENV value: {other} (use development|production)"
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub env: AppEnv,
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expires_in: i64,
    pub refresh_expires_in: i64,
    /// CORS allowed origins. 空列表在生产模式被拒, dev 默认 ["http://localhost:5173"].
    pub cors_allowed_origins: Vec<String>,
    /// 注册是否对外开放 (私有部署应 false).
    pub allow_public_registration: bool,
}

const DEFAULT_DEV_SECRET: &str = "dev-secret-change-in-production";

impl Config {
    pub fn from_env() -> Result<Self> {
        let env: AppEnv = std::env::var("APP_ENV")
            .unwrap_or_else(|_| "development".to_string())
            .parse()?;

        let port: u16 = std::env::var("CENTER_PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse()
            .unwrap_or(8080);

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://javis:javis@127.0.0.1:5432/javis".to_string());
        // P2#2: 不再读取 REDIS_URL — 选择 "文档化单实例" 路线, 不依赖 Redis pub-sub.
        // 若用户误设了 REDIS_URL, 给一次性 warn, 不报错 (向前兼容旧的部署脚本).
        if std::env::var("REDIS_URL").is_ok() {
            tracing::warn!(
                "REDIS_URL is set but ignored: this build runs as a single instance and does not use Redis. \
                 Unset REDIS_URL to silence this warning. See Server/DEPLOY.md for the single-instance constraint."
            );
        }

        // JWT secret — 生产模式: 必须显式提供且 >= 32 字节; dev 默认 fallback.
        let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_default();
        let jwt_secret = if env == AppEnv::Production {
            if jwt_secret.is_empty() {
                return Err(anyhow!(
                    "JWT_SECRET is required in production (APP_ENV=production)"
                ));
            }
            if jwt_secret == DEFAULT_DEV_SECRET {
                return Err(anyhow!(
                    "JWT_SECRET is set to the built-in dev default; production requires a strong random secret"
                ));
            }
            if jwt_secret.len() < 32 {
                return Err(anyhow!(
                    "JWT_SECRET must be at least 32 bytes in production (got {})",
                    jwt_secret.len()
                ));
            }
            jwt_secret
        } else {
            if jwt_secret.is_empty() {
                DEFAULT_DEV_SECRET.to_string()
            } else {
                jwt_secret
            }
        };

        let jwt_expires_in: i64 = parse_env_or("JWT_EXPIRES_IN", 1800)?;
        let refresh_expires_in: i64 = parse_env_or("REFRESH_EXPIRES_IN", 2_592_000)?;

        // CORS: 逗号分隔 allowlist. 生产模式拒绝空 (避免 * / permissive 误配).
        let cors_allowed_origins: Vec<String> = std::env::var("CORS_ALLOWED_ORIGINS")
            .ok()
            .map(|s| {
                s.split(',')
                    .map(|o| o.trim().to_string())
                    .filter(|o| !o.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        let cors_allowed_origins = if env == AppEnv::Production && cors_allowed_origins.is_empty() {
            return Err(anyhow!(
                "CORS_ALLOWED_ORIGINS is required in production (comma-separated list)"
            ));
        } else if cors_allowed_origins.is_empty() {
            // dev 兜底: Vite 默认端口 + Tauri 本地
            vec![
                "http://localhost:5173".to_string(),
                "http://127.0.0.1:5173".to_string(),
                "tauri://localhost".to_string(),
            ]
        } else {
            cors_allowed_origins
        };

        let allow_public_registration: bool = std::env::var("ALLOW_PUBLIC_REGISTRATION")
            .ok()
            .map(|s| {
                !matches!(
                    s.to_ascii_lowercase().as_str(),
                    "false" | "0" | "no" | "off"
                )
            })
            .unwrap_or(env != AppEnv::Production); // 生产默认关, dev 默认开

        Ok(Self {
            env,
            port,
            database_url,
            jwt_secret,
            jwt_expires_in,
            refresh_expires_in,
            cors_allowed_origins,
            allow_public_registration,
        })
    }
}

fn parse_env_or<T: std::str::FromStr>(key: &str, default: T) -> Result<T>
where
    T::Err: std::fmt::Display,
{
    match std::env::var(key) {
        Ok(s) => s.parse::<T>().map_err(|e| anyhow!("invalid {key}: {e}")),
        Err(_) => Ok(default),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // std::env::set_var / remove_var 在多线程下是 UB (Rust 1.74+ 直接 panic).
    // 用 std::sync::Mutex 串行化所有改 env 的 test, 避免 cargo test 并发跑时污染.
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn dev_env_allows_default_secret() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // 仅在没有设 JWT_SECRET 的环境跑
        let prev = std::env::var("JWT_SECRET").ok();
        std::env::remove_var("JWT_SECRET");
        let cfg = Config::from_env().unwrap();
        assert_eq!(cfg.env, AppEnv::Development);
        assert_eq!(cfg.jwt_secret, DEFAULT_DEV_SECRET);
        if let Some(v) = prev {
            std::env::set_var("JWT_SECRET", v);
        }
    }

    #[test]
    fn prod_env_requires_jwt_secret() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let prev_secret = std::env::var("JWT_SECRET").ok();
        let prev_env = std::env::var("APP_ENV").ok();
        std::env::remove_var("JWT_SECRET");
        std::env::set_var("APP_ENV", "production");
        let r = Config::from_env();
        std::env::remove_var("APP_ENV");
        if let Some(v) = prev_env {
            std::env::set_var("APP_ENV", v);
        }
        if let Some(v) = prev_secret {
            std::env::set_var("JWT_SECRET", v);
        }
        assert!(r.is_err());
    }

    #[test]
    fn prod_env_rejects_default_dev_secret() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let prev_secret = std::env::var("JWT_SECRET").ok();
        let prev_env = std::env::var("APP_ENV").ok();
        std::env::set_var("APP_ENV", "production");
        std::env::set_var("JWT_SECRET", DEFAULT_DEV_SECRET);
        let r = Config::from_env();
        std::env::remove_var("APP_ENV");
        std::env::remove_var("JWT_SECRET");
        if let Some(v) = prev_env {
            std::env::set_var("APP_ENV", v);
        }
        if let Some(v) = prev_secret {
            std::env::set_var("JWT_SECRET", v);
        }
        assert!(r.is_err());
    }

    #[test]
    fn prod_env_rejects_short_secret() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let prev_secret = std::env::var("JWT_SECRET").ok();
        let prev_env = std::env::var("APP_ENV").ok();
        std::env::set_var("APP_ENV", "production");
        std::env::set_var("JWT_SECRET", "too-short");
        let r = Config::from_env();
        std::env::remove_var("APP_ENV");
        std::env::remove_var("JWT_SECRET");
        if let Some(v) = prev_env {
            std::env::set_var("APP_ENV", v);
        }
        if let Some(v) = prev_secret {
            std::env::set_var("JWT_SECRET", v);
        }
        assert!(r.is_err());
    }

    #[test]
    fn prod_env_accepts_strong_secret() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let prev_secret = std::env::var("JWT_SECRET").ok();
        let prev_env = std::env::var("APP_ENV").ok();
        let prev_cors = std::env::var("CORS_ALLOWED_ORIGINS").ok();
        std::env::set_var("APP_ENV", "production");
        std::env::set_var("JWT_SECRET", "x".repeat(64));
        std::env::set_var("CORS_ALLOWED_ORIGINS", "https://app.example.com");
        let cfg = Config::from_env().unwrap();
        std::env::remove_var("APP_ENV");
        std::env::remove_var("JWT_SECRET");
        std::env::remove_var("CORS_ALLOWED_ORIGINS");
        if let Some(v) = prev_env {
            std::env::set_var("APP_ENV", v);
        }
        if let Some(v) = prev_secret {
            std::env::set_var("JWT_SECRET", v);
        }
        if let Some(v) = prev_cors {
            std::env::set_var("CORS_ALLOWED_ORIGINS", v);
        }
        assert_eq!(cfg.env, AppEnv::Production);
        assert_eq!(cfg.jwt_secret.len(), 64);
        assert!(cfg
            .cors_allowed_origins
            .contains(&"https://app.example.com".to_string()));
    }
}
