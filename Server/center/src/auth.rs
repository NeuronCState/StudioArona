//! JWT + 用户认证 + 密码哈希.
//!
//! 设计要点 (P0#2):
//! - Claims 加 `token_type: "access" | "refresh"`, `jti: Uuid`
//! - 普通 API 路由只接受 access; `/api/auth/refresh` 只接受 refresh
//! - Refresh token 落 `refresh_tokens` 表 (jti PK), 支持撤销 + 强制轮换
//! - 用户名 / 密码长度 + 字符校验在 `validate_credentials`
//! - `extract_user_id` 强化为只接 access token (类型不匹配 → 401)
//! - `verify_refresh_in_db` 校验 DB 中 jti 未撤销未过期

use axum::http::StatusCode;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TokenType {
    Access,
    Refresh,
}

impl TokenType {
    #[allow(dead_code)] // 外部 caller / 日志可能用, 保留以便后续接 JWT 调试
    pub fn as_str(&self) -> &'static str {
        match self {
            TokenType::Access => "access",
            TokenType::Refresh => "refresh",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String, // user id (uuid string)
    pub username: String,
    pub role: String,
    pub token_type: TokenType,
    pub jti: Uuid,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub user: User,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub role: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

// ─── 凭据校验 ──────────────────────────────────────────────────────────────

/// 用户名 / 密码长度 + 字符规则. 失败返 (Status, error_json).
pub fn validate_credentials(
    username: &str,
    password: &str,
) -> Result<(), (StatusCode, serde_json::Value)> {
    const USERNAME_MIN: usize = 3;
    const USERNAME_MAX: usize = 32;
    const PASSWORD_MIN: usize = 8;
    const PASSWORD_MAX: usize = 128; // bcrypt 72-byte 上限是有效字节, 这里给 char 上限

    let u_len = username.chars().count();
    if !(USERNAME_MIN..=USERNAME_MAX).contains(&u_len) {
        return Err((
            StatusCode::BAD_REQUEST,
            serde_json::json!({"error": format!("username must be {USERNAME_MIN}-{USERNAME_MAX} characters")}),
        ));
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return Err((
            StatusCode::BAD_REQUEST,
            serde_json::json!({"error": "username may only contain letters, digits, '_', '-', '.'"}),
        ));
    }
    let p_len = password.chars().count();
    if p_len < PASSWORD_MIN {
        return Err((
            StatusCode::BAD_REQUEST,
            serde_json::json!({"error": format!("password must be at least {PASSWORD_MIN} characters")}),
        ));
    }
    if p_len > PASSWORD_MAX {
        return Err((
            StatusCode::BAD_REQUEST,
            serde_json::json!({"error": format!("password must be at most {PASSWORD_MAX} characters")}),
        ));
    }
    Ok(())
}

// ─── JWT 签发 ──────────────────────────────────────────────────────────────

/// 签发一对 access + refresh, 并把 refresh token jti 写入 DB.
pub async fn create_tokens(
    db: &PgPool,
    user: &User,
    config: &Config,
    user_agent: Option<&str>,
    ip: Option<&str>,
) -> anyhow::Result<TokenPair> {
    let now = chrono::Utc::now().timestamp();
    let access_jti = Uuid::new_v4();
    let refresh_jti = Uuid::new_v4();

    let access_claims = Claims {
        sub: user.id.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        token_type: TokenType::Access,
        jti: access_jti,
        exp: now + config.jwt_expires_in,
        iat: now,
    };
    let refresh_claims = Claims {
        sub: user.id.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        token_type: TokenType::Refresh,
        jti: refresh_jti,
        exp: now + config.refresh_expires_in,
        iat: now,
    };

    let access_token = encode(
        &Header::default(),
        &access_claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )?;
    let refresh_token = encode(
        &Header::default(),
        &refresh_claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )?;

    let refresh_expires_at =
        chrono::DateTime::<chrono::Utc>::from_timestamp(now + config.refresh_expires_in, 0)
            .unwrap_or_else(chrono::Utc::now);

    sqlx::query(
        "INSERT INTO refresh_tokens (jti, user_id, expires_at, user_agent, ip)
         VALUES ($1, $2::uuid, $3, $4, NULLIF($5, '')::inet)",
    )
    .bind(refresh_jti)
    .bind(&user.id)
    .bind(refresh_expires_at)
    .bind(user_agent)
    .bind(ip.unwrap_or(""))
    .execute(db)
    .await?;

    Ok(TokenPair {
        access_token,
        refresh_token,
        user: user.clone(),
    })
}

/// 校验 token 签名 + exp. 不查 DB, 不区分类型.
pub fn verify_token(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

/// 严格校验 access token. 必须是 access 类型, 否则 401.
pub fn verify_access_token(token: &str, secret: &str) -> Result<Claims, AuthError> {
    let claims = verify_token(token, secret)?;
    if claims.token_type != TokenType::Access {
        return Err(AuthError::WrongTokenType);
    }
    Ok(claims)
}

/// 严格校验 refresh token. 必须是 refresh 类型, 否则 401.
pub fn verify_refresh_token(token: &str, secret: &str) -> Result<Claims, AuthError> {
    let claims = verify_token(token, secret)?;
    if claims.token_type != TokenType::Refresh {
        return Err(AuthError::WrongTokenType);
    }
    Ok(claims)
}

/// DB-side 二次校验: jti 存在 + 未撤销 + 未过期.
pub async fn verify_refresh_in_db(db: &PgPool, claims: &Claims) -> Result<(), AuthError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT user_id::text FROM refresh_tokens
         WHERE jti = $1::uuid AND revoked_at IS NULL AND expires_at > NOW()",
    )
    .bind(claims.jti.to_string())
    .fetch_optional(db)
    .await
    .map_err(AuthError::Db)?;

    match row {
        Some((uid,)) if uid == claims.sub => Ok(()),
        Some(_) => Err(AuthError::Revoked), // user_id 不一致: token 跨用户复用
        None => Err(AuthError::Revoked),
    }
}

/// 在 refresh 成功后, 把旧 jti 标记 revoked + replaced_by.
///
/// B2 修复: 条件 WHERE revoked_at IS NULL, 任何已经撤销的 jti 不能再次被 rotate (防止重放).
/// 返回 rows_affected — caller 必须 == 1 才算成功. 等于 0 表示并发请求已撤销过 (重放攻击).
pub async fn rotate_refresh(
    db: &PgPool,
    old_jti: Uuid,
    new_jti: Uuid,
) -> Result<bool, sqlx::Error> {
    let r = sqlx::query(
        "UPDATE refresh_tokens
         SET revoked_at = NOW(), replaced_by = $2::uuid
         WHERE jti = $1::uuid AND revoked_at IS NULL",
    )
    .bind(old_jti)
    .bind(new_jti.to_string())
    .execute(db)
    .await?;
    Ok(r.rows_affected() == 1)
}

/// B2 修复: refresh rotation + 新 token 签发 + 旧 jti 撤销, 全部在一个事务里.
///
/// 旧实现的问题:
///   1. main.rs 调 `rotate_refresh(old_jti, Uuid::new_v4())` 生成 replaced_by — 然后又调
///      `create_tokens` 内部又生成新 jti 并 INSERT. replaced_by 跟实际新 jti 不一致, 链断.
///   2. rotate_refresh 没有 `revoked_at IS NULL` 条件, 并发两次都成功 (重放).
///
/// 新实现:
///   1. 事务 begin
///   2. SELECT ... FOR UPDATE 锁住旧 jti 行 (行级锁, 串行化并发 rotate)
///   3. 检查 revoked_at IS NULL + expires_at > NOW() — 否则回滚 + Err
///   4. 生成新 refresh_jti
///   5. 签发 access + refresh token
///   6. INSERT 新 refresh_tokens 行
///   7. UPDATE 旧 jti: revoked_at = NOW(), replaced_by = new_jti — 条件 WHERE revoked_at IS NULL
///   8. COMMIT — 旧 jti 撤销 + 新 jti 持久化 原子
///
/// 失败语义:
///   - 旧 jti 不存在 / 已撤销 / 已过期 → Err(AuthError::Revoked), 业务层返 401
///   - DB 错误 → 事务回滚, 业务层返 500
pub async fn rotate_and_issue(
    db: &PgPool,
    config: &Config,
    claims: &Claims,
    user: &User,
    user_agent: Option<&str>,
    ip: Option<&str>,
) -> Result<(String, String, Uuid), AuthError> {
    let mut tx = db.begin().await.map_err(AuthError::Db)?;

    // 1. 锁 + 校验旧 jti 状态
    let row: Option<(String, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
        "SELECT user_id::text, expires_at FROM refresh_tokens
         WHERE jti = $1::uuid FOR UPDATE",
    )
    .bind(claims.jti.to_string())
    .fetch_optional(&mut *tx)
    .await
    .map_err(AuthError::Db)?;

    let (owner_id, expires_at) = match row {
        Some(r) => r,
        None => return Err(AuthError::Revoked),
    };
    if owner_id != claims.sub {
        return Err(AuthError::Revoked);
    }
    let exp = expires_at.ok_or(AuthError::Revoked)?;
    if exp <= chrono::Utc::now() {
        return Err(AuthError::Revoked);
    }

    // 2. 生成新 jti + 签发新 token (复用 create_tokens 内部逻辑, 但要走事务)
    let now = chrono::Utc::now().timestamp();
    let access_jti = Uuid::new_v4();
    let new_refresh_jti = Uuid::new_v4();

    let access_claims = Claims {
        sub: user.id.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        token_type: TokenType::Access,
        jti: access_jti,
        exp: now + config.jwt_expires_in,
        iat: now,
    };
    let refresh_claims = Claims {
        sub: user.id.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        token_type: TokenType::Refresh,
        jti: new_refresh_jti,
        exp: now + config.refresh_expires_in,
        iat: now,
    };
    let access_token = encode(
        &Header::default(),
        &access_claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(AuthError::Jwt)?;
    let refresh_token = encode(
        &Header::default(),
        &refresh_claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(AuthError::Jwt)?;

    let refresh_expires_at =
        chrono::DateTime::<chrono::Utc>::from_timestamp(now + config.refresh_expires_in, 0)
            .unwrap_or_else(chrono::Utc::now);

    // 3. 写新 refresh_tokens 行
    sqlx::query(
        "INSERT INTO refresh_tokens (jti, user_id, expires_at, user_agent, ip)
         VALUES ($1, $2::uuid, $3, $4, NULLIF($5, '')::inet)",
    )
    .bind(new_refresh_jti)
    .bind(&user.id)
    .bind(refresh_expires_at)
    .bind(user_agent)
    .bind(ip.unwrap_or(""))
    .execute(&mut *tx)
    .await
    .map_err(AuthError::Db)?;

    // 4. 撤销旧 jti — 条件 revoked_at IS NULL 保证只成功一次
    let rotate_r = sqlx::query(
        "UPDATE refresh_tokens
         SET revoked_at = NOW(), replaced_by = $2::uuid
         WHERE jti = $1::uuid AND revoked_at IS NULL",
    )
    .bind(claims.jti.to_string())
    .bind(new_refresh_jti.to_string())
    .execute(&mut *tx)
    .await
    .map_err(AuthError::Db)?;

    // 防御性: rows_affected != 1 说明并发请求在我们锁定时已撤销 (理论上 SELECT FOR UPDATE
    // 已阻挡, 但保留这个检查以便 DB 抛并发异常时能立即发现)
    if rotate_r.rows_affected() != 1 {
        return Err(AuthError::Revoked);
    }

    // 5. 提交
    tx.commit().await.map_err(AuthError::Db)?;

    Ok((access_token, refresh_token, new_refresh_jti))
}

/// "退出全部设备": 撤销某用户全部活跃 refresh token.
pub async fn revoke_all_user_refresh(db: &PgPool, user_id: &str) -> Result<u64, sqlx::Error> {
    let r = sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE user_id = $1::uuid AND revoked_at IS NULL",
    )
    .bind(user_id)
    .execute(db)
    .await?;
    Ok(r.rows_affected())
}

/// 单 token 撤销: 用于 "这台设备退出" 或 "撤销这个被泄露的 token".
pub async fn revoke_refresh(db: &PgPool, jti: Uuid) -> Result<bool, sqlx::Error> {
    let r = sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE jti = $1::uuid AND revoked_at IS NULL",
    )
    .bind(jti.to_string())
    .execute(db)
    .await?;
    Ok(r.rows_affected() > 0)
}

// ─── Axum 集成 ────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[allow(dead_code)] // JWT 库的所有错误统一映射到这里, 具体类型分发留给调用方
    #[error("invalid token")]
    Invalid,
    #[error("wrong token type for endpoint")]
    WrongTokenType,
    #[error("token revoked or expired")]
    Revoked,
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("jwt error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
}

impl AuthError {
    /// 转 HTTP 错误响应, 直接给 axum handler `?` 用.
    pub fn into_http(self) -> (StatusCode, axum::Json<serde_json::Value>) {
        let status = match &self {
            AuthError::Invalid | AuthError::WrongTokenType => StatusCode::UNAUTHORIZED,
            AuthError::Revoked => StatusCode::UNAUTHORIZED,
            AuthError::Jwt(_) => StatusCode::UNAUTHORIZED,
            AuthError::Db(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let msg = match &self {
            AuthError::Db(_) => "internal auth error".to_string(),
            _ => self.to_string(),
        };
        (status, axum::Json(serde_json::json!({"error": msg})))
    }

    /// 旧版 API: 返回 `(StatusCode, serde_json::Value)`, caller 自己 `Json(v)`.
    /// 保留给 extract_user_id 等内部 helper.
    pub fn into_http_value(self) -> (StatusCode, serde_json::Value) {
        let (s, j) = self.into_http();
        (s, j.0)
    }
}

/// Extract user_id from Authorization: Bearer <token> header.
/// 同步、无 DB 查询. 只接受 access token — 业务 API 收到 refresh token 直接 401.
///
/// JWT 签名 + exp 已经由 jsonwebtoken 库保证. 类型严格 (P0#2).
/// "user 是否还存在" 留给 refresh token 的 FK CASCADE 自然处理: 用户被删 → refresh token
/// 行一并删 → 该用户任何 access token 在 15min 后自然过期, 无需每请求再查 DB.
pub fn extract_user_id(
    headers: &axum::http::HeaderMap,
    secret: &str,
) -> Result<(String, String, String), (StatusCode, serde_json::Value)> {
    let token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| {
            (
                axum::http::StatusCode::UNAUTHORIZED,
                serde_json::json!({"error": "missing token"}),
            )
        })?;

    let claims = verify_access_token(token, secret).map_err(|e| e.into_http_value())?;
    Ok((claims.sub, claims.username, claims.role))
}

/// 严格版本, 同时查 DB 确认 user 存在. 用于敏感端点 (e.g. /api/auth/refresh).
#[allow(dead_code)] // 保留供未来敏感端点使用
pub async fn extract_access_user_with_db_check(
    db: &PgPool,
    headers: &axum::http::HeaderMap,
    secret: &str,
) -> Result<(String, String, String), (StatusCode, serde_json::Value)> {
    let (uid, username, role) = extract_user_id(headers, secret)?;
    let exists: Option<(String,)> =
        sqlx::query_as("SELECT id::text FROM users WHERE id = $1::uuid")
            .bind(&uid)
            .fetch_optional(db)
            .await
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    serde_json::json!({"error": "user lookup failed"}),
                )
            })?;
    if exists.is_none() {
        return Err((
            StatusCode::UNAUTHORIZED,
            serde_json::json!({"error": "user not found"}),
        ));
    }
    Ok((uid, username, role))
}

// ─── 密码哈希 ──────────────────────────────────────────────────────────────

pub fn hash_password(password: &str) -> Result<String, bcrypt::BcryptError> {
    bcrypt::hash(password, bcrypt::DEFAULT_COST)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, bcrypt::BcryptError> {
    bcrypt::verify(password, hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> Config {
        Config {
            env: crate::config::AppEnv::Development,
            port: 8080,
            database_url: "postgresql://x".into(),
            jwt_secret: "test-secret-test-secret-test-secret".into(),
            jwt_expires_in: 1800,
            refresh_expires_in: 3600,
            cors_allowed_origins: vec![],
            allow_public_registration: true,
        }
    }

    fn test_user() -> User {
        User {
            id: "00000000-0000-0000-0000-000000000001".into(),
            username: "alice".into(),
            display_name: "Alice".into(),
            role: "member".into(),
        }
    }

    // ── credentials ──

    #[test]
    fn validate_credentials_accepts_normal() {
        assert!(validate_credentials("alice", "hunter22hunter").is_ok());
        assert!(validate_credentials("user.name_1-x", "verylongpassword123").is_ok());
    }

    #[test]
    fn validate_credentials_rejects_short_username() {
        assert!(validate_credentials("ab", "longenoughpassword").is_err());
    }

    #[test]
    fn validate_credentials_rejects_long_username() {
        let long = "a".repeat(33);
        assert!(validate_credentials(&long, "longenoughpassword").is_err());
    }

    #[test]
    fn validate_credentials_rejects_invalid_chars() {
        assert!(validate_credentials("alice@home", "longenoughpassword").is_err());
        assert!(validate_credentials("ali ce", "longenoughpassword").is_err());
        assert!(validate_credentials("ali/ce", "longenoughpassword").is_err());
    }

    #[test]
    fn validate_credentials_rejects_short_password() {
        assert!(validate_credentials("alice", "short").is_err());
    }

    #[test]
    fn validate_credentials_rejects_long_password() {
        let long = "x".repeat(129);
        assert!(validate_credentials("alice", &long).is_err());
    }

    // ── JWT type discrimination (no DB) ──

    /// SPEC §4.2: "测试: access token 不能刷新, refresh token 不能调用业务 API".
    /// 这里只做无 DB 部分的纯单元测试; DB 部分在集成测试里覆盖.
    #[test]
    fn access_and_refresh_tokens_have_different_types() {
        let cfg = test_config();
        // 用远期时间避免 jsonwebtoken 的默认 leeway / ExpiredSignature
        let future = chrono::Utc::now().timestamp() + 3600;
        let claims_access = Claims {
            sub: "u".into(),
            username: "u".into(),
            role: "member".into(),
            token_type: TokenType::Access,
            jti: Uuid::new_v4(),
            exp: future,
            iat: future - 60,
        };
        let claims_refresh = Claims {
            token_type: TokenType::Refresh,
            ..claims_access.clone()
        };

        let access_jwt = encode(
            &Header::default(),
            &claims_access,
            &EncodingKey::from_secret(cfg.jwt_secret.as_bytes()),
        )
        .unwrap();
        let refresh_jwt = encode(
            &Header::default(),
            &claims_refresh,
            &EncodingKey::from_secret(cfg.jwt_secret.as_bytes()),
        )
        .unwrap();

        let parsed_access = verify_token(&access_jwt, &cfg.jwt_secret).unwrap();
        let parsed_refresh = verify_token(&refresh_jwt, &cfg.jwt_secret).unwrap();
        assert_eq!(parsed_access.token_type, TokenType::Access);
        assert_eq!(parsed_refresh.token_type, TokenType::Refresh);

        // 业务 API 收到 refresh token 应被拒
        assert!(matches!(
            verify_access_token(&refresh_jwt, &cfg.jwt_secret),
            Err(AuthError::WrongTokenType)
        ));
        // refresh endpoint 收到 access token 应被拒
        assert!(matches!(
            verify_refresh_token(&access_jwt, &cfg.jwt_secret),
            Err(AuthError::WrongTokenType)
        ));
    }

    #[test]
    fn expired_token_is_rejected() {
        let cfg = test_config();
        let claims = Claims {
            sub: "u".into(),
            username: "u".into(),
            role: "member".into(),
            token_type: TokenType::Access,
            jti: Uuid::new_v4(),
            exp: chrono::Utc::now().timestamp() - 3600, // 1h ago, way past any leeway
            iat: chrono::Utc::now().timestamp() - 7200,
        };
        let jwt = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(cfg.jwt_secret.as_bytes()),
        )
        .unwrap();
        let r = verify_access_token(&jwt, &cfg.jwt_secret);
        assert!(r.is_err());
    }

    #[test]
    fn tampered_signature_is_rejected() {
        let cfg = test_config();
        let future = chrono::Utc::now().timestamp() + 3600;
        let claims = Claims {
            sub: "u".into(),
            username: "u".into(),
            role: "member".into(),
            token_type: TokenType::Access,
            jti: Uuid::new_v4(),
            exp: future,
            iat: future - 60,
        };
        let jwt = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(cfg.jwt_secret.as_bytes()),
        )
        .unwrap();
        // 改最后一个字符
        let mut tampered = jwt;
        let last = tampered.pop().unwrap();
        tampered.push(if last == 'a' { 'b' } else { 'a' });
        assert!(verify_access_token(&tampered, &cfg.jwt_secret).is_err());
    }

    // ── password hash ──

    #[test]
    fn password_hash_round_trip() {
        let h = hash_password("hunter22hunter").unwrap();
        assert!(verify_password("hunter22hunter", &h).unwrap());
        assert!(!verify_password("hunter22hunter!", &h).unwrap());
    }

    // 标记字段已用 (silence dead_code warnings)
    #[test]
    fn test_user_compiles() {
        let _u = test_user();
    }
}
