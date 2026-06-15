use anyhow::Result;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_expires_in: i64,
    pub refresh_expires_in: i64,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let port: u16 = std::env::var("CENTER_PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse()
            .unwrap_or(8080);
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://javis:javis@127.0.0.1:5432/javis".to_string());
        let redis_url = std::env::var("REDIS_URL")
            .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        let jwt_secret = std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "dev-secret-change-in-production".to_string());
        let jwt_expires_in: i64 = std::env::var("JWT_EXPIRES_IN")
            .unwrap_or_else(|_| "1800".to_string())
            .parse()
            .unwrap_or(1800);
        let refresh_expires_in: i64 = std::env::var("REFRESH_EXPIRES_IN")
            .unwrap_or_else(|_| "2592000".to_string())
            .parse()
            .unwrap_or(2_592_000);

        Ok(Self {
            port,
            database_url,
            redis_url,
            jwt_secret,
            jwt_expires_in,
            refresh_expires_in,
        })
    }
}
