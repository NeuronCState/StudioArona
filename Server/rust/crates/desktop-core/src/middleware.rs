//! JWT 认证中间件 — 从 Authorization header 提取 user_id

use axum::{
    extract::Request,
    http::header::AUTHORIZATION,
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,    // user_id
    pub role: String,
    pub exp: i64,
    pub iat: i64,
}

/// JWT 认证中间件
pub async fn auth_middleware(
    mut request: Request,
    next: Next,
) -> Result<Response, axum::http::StatusCode> {
    // 从 Authorization header 提取 token
    let auth_header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(axum::http::StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(axum::http::StatusCode::UNAUTHORIZED)?;

    // TODO: 从 config 获取 secret
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "test".to_string());

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| axum::http::StatusCode::UNAUTHORIZED)?;

    // 将 claims 注入到 request extensions
    request.extensions_mut().insert(token_data.claims);

    Ok(next.run(request).await)
}
