//! 统一错误类型

pub type AppResult<T> = std::result::Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("config error: {0}")]
    Config(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("http client error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("auth error: {0}")]
    Auth(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("validation: {0}")]
    Validation(String),

    #[error("rate limited")]
    RateLimited,

    #[error("internal: {0}")]
    Internal(#[from] anyhow::Error),
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        use axum::http::StatusCode;
        let (status, code) = match &self {
            AppError::Auth(_) => (StatusCode::UNAUTHORIZED, "JAVIS_AUTH_INVALID"),
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "JAVIS_NOT_FOUND"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "JAVIS_CONFLICT"),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "JAVIS_BAD_REQUEST"),
            AppError::Validation(_) => (StatusCode::BAD_REQUEST, "JAVIS_VALIDATION"),
            AppError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "JAVIS_RATE_LIMITED"),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "JAVIS_INTERNAL_ERROR"),
        };
        let body = axum::Json(serde_json::json!({
            "code": code,
            "message": self.to_string(),
        }));
        (status, body).into_response()
    }
}
