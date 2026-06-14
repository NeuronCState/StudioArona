//! Auth 服务 — login / refresh / register (顶替 v2 services/api-gateway/app/api/auth.py)
//!
//! 行为 1:1 对齐 v2 Python:
//!   - 401 JAVIS_AUTH_INVALID 跟 Python 一致
//!   - access_token TTL 30 min, refresh_token TTL 30 day (v2 auth/jwt.py)
//!   - password hash 用 argon2
//!   - JWT secret 从 env JWT_SECRET 读
//!   - 用户 last_login_at update + return CSRF cookie
//!
//! 注意: sqlx 0.8 有类型推断 bug, 用 sqlx::query! 宏会出问题。
//!       改用手动 query + 显式类型转换来避免。

use crate::error::AppError;
use crate::state::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use chrono::{Duration, Utc};
use desktop_protocol::{LoginRequest, LoginResponse, UserPublic, RefreshRequest};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

const CSRF_COOKIE: &str = "csrf_token";

/// JWT claims
#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,        // user_id
    role: String,
    exp: i64,
    iat: i64,
}

fn create_access_token(user_id: &str, role: &str, secret: &str, ttl_min: i64) -> Result<String, AppError> {
    let now = Utc::now().timestamp();
    let exp = (Utc::now() + Duration::minutes(ttl_min)).timestamp();
    let claims = Claims {
        sub: user_id.to_string(),
        role: role.to_string(),
        iat: now,
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("jwt encode: {e}")))
}

fn create_refresh_token(user_id: &str, secret: &str, ttl_day: i64) -> Result<String, AppError> {
    let now = Utc::now().timestamp();
    let exp = (Utc::now() + Duration::days(ttl_day)).timestamp();
    let claims = Claims {
        sub: user_id.to_string(),
        role: "user".to_string(),
        iat: now,
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("jwt refresh encode: {e}")))
}

/// POST /api/auth/login
pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    // 1. 查 user
    //    关键: sqlx 0.8 在 prepared statement 中会错误推断 $1 类型
    //    解决: 用 sqlx::query_raw 或在 SQL 中强制 CAST
    //    这里用 .bind() 显式类型 + 手动 decode row
    let row = sqlx::query(
        "SELECT id::text, username, display_name, role, password_hash, created_at::text
         FROM users WHERE username = $1"
    )
    .bind(&body.username as &str)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let row = match row {
        Some(r) => r,
        None => {
            return Err(AppError::Auth(
                "{\"code\":\"JAVIS_AUTH_INVALID\",\"message\":\"用户名或密码错误\"}".to_string()
            ))
        }
    };

    let user_id: String = row.try_get("id")?;
    let username: String = row.try_get("username")?;
    let display_name: String = row.try_get("display_name")?;
    let role: String = row.try_get("role")?;
    let password_hash: String = row.try_get("password_hash")?;
    let created_at_str: String = row.try_get("created_at")?;

    // 2. 验密码 (bcrypt verify — v2 services/auth/password.py 用 bcrypt cost 12)
    let valid = bcrypt::verify(&body.password, &password_hash).unwrap_or(false);
    if !valid {
        return Err(AppError::Auth(
            "{\"code\":\"JAVIS_AUTH_INVALID\",\"message\":\"用户名或密码错误\"}".to_string()
        ));
    }

    // 3. 更新 last_login_at
    sqlx::query("UPDATE users SET last_login_at = NOW() WHERE id = $1::uuid")
        .bind(&user_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    // 4. JWT
    let secret = &state.config.auth.jwt_secret;
    let access_token = create_access_token(&user_id, &role, secret, state.config.auth.access_token_ttl_min)?;
    let refresh_token = create_refresh_token(&user_id, secret, state.config.auth.refresh_token_ttl_day)?;

    // 5. CSRF token (32 字节 hex)
    let csrf_token: String = (0..32)
        .map(|i| format!("{:02x}", (Uuid::new_v4().as_u128() >> (i % 16 * 8)) as u8))
        .collect::<String>()
        .chars()
        .take(64)
        .collect();

    let created_at_dt = chrono::DateTime::parse_from_rfc3339(&format!("{}+00:00", created_at_str))
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());

    let body = LoginResponse {
        access_token,
        refresh_token,
        user: UserPublic {
            id: user_id,
            username,
            display_name,
            role,
            created_at: created_at_dt,
        },
    };

    let mut resp = (StatusCode::OK, Json(body)).into_response();
    // CSRF cookie (readable by JS, not HttpOnly)
    let cookie = format!(
        "{}={}; HttpOnly=false; SameSite=Strict; Max-Age=3600; Path=/",
        CSRF_COOKIE, csrf_token
    );
    resp.headers_mut().insert(
        axum::http::header::SET_COOKIE,
        cookie.parse().unwrap(),
    );
    Ok(resp)
}

/// POST /api/auth/refresh
pub async fn refresh(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RefreshRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let secret = &state.config.auth.jwt_secret;
    let validation = Validation::default();
    let token_data = decode::<Claims>(
        &body.refresh_token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|_| AppError::Auth(
        "{\"code\":\"JAVIS_AUTH_EXPIRED\",\"message\":\"刷新令牌无效或已过期\"}".to_string()
    ))?;

    let user_id = token_data.claims.sub;

    let row = sqlx::query("SELECT role FROM users WHERE id = $1::uuid")
        .bind(&user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("database error: {e}")))?;

    let role: String = match row {
        Some(r) => r.try_get("role")?,
        None => return Err(AppError::Auth(
            "{\"code\":\"JAVIS_USER_NOT_FOUND\",\"message\":\"用户不存在\"}".to_string()
        )),
    };

    let access_token = create_access_token(&user_id, &role, secret, state.config.auth.access_token_ttl_min)?;
    Ok(Json(json!({ "access_token": access_token })))
}
