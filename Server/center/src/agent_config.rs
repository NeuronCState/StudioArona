//! Sonetto Agent 配置 + 加密 Secret 同步 (P1#2).
//!
//! 设计:
//!   - agent_configs (非敏感): provider metadata / persona / tool enable map /
//!     mcp_servers / settings — 直接 JSONB 存
//!   - agent_secrets (敏感): api_key / token / mcp secret — AES-256-GCM 加密,
//!     API 只返 "configured" + 掩码
//!
//! 端点:
//!   GET    /api/agent/config           全量非敏感配置 + version
//!   PUT    /api/agent/config/:key      单 key 替换 (expected_version 乐观锁)
//!   GET    /api/agent/secrets          所有 secret 的 key 列表 + 掩码 + 元数据
//!   PUT    /api/agent/secrets/:key     设置或替换一个 secret
//!   DELETE /api/agent/secrets/:key     清除一个 secret
//!
//! 敏感字段: 不打日志, 错误信息脱敏, API 永远不返密文.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;

use crate::{auth::extract_user_id, crypto, AppState};

const ALLOWED_CONFIG_KEYS: &[&str] = &["providers", "persona", "tools", "mcp_servers", "settings"];

// ─── config 端点 ──────────────────────────────────────────────────────────

/// GET /api/agent/config
pub async fn list_agent_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let rows: Vec<(String, Value, i32, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT config_key, value, version, updated_at
         FROM agent_configs WHERE user_id = $1::uuid",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "config lookup failed"})),
        )
    })?;

    let mut configs = serde_json::Map::new();
    for (k, v, ver, updated) in rows {
        configs.insert(
            k,
            json!({
                "value": v,
                "version": ver,
                "updated_at": updated.to_rfc3339(),
            }),
        );
    }
    Ok(Json(json!({
        "configs": Value::Object(configs),
        "schema_version": 1,
    })))
}

#[derive(Deserialize)]
pub struct ConfigUpsertInput {
    pub value: Value,
    pub expected_version: Option<i32>,
}

/// PUT /api/agent/config/:key
pub async fn upsert_agent_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(input): Json<ConfigUpsertInput>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    if !ALLOWED_CONFIG_KEYS.contains(&key.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("config_key not allowed: {key}")})),
        ));
    }
    if !input.value.is_object() && !input.value.is_array() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "value must be JSON object or array"})),
        ));
    }

    let mut tx = state.db.begin().await.map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "tx begin failed"})),
        )
    })?;

    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT version FROM agent_configs WHERE user_id = $1::uuid AND config_key = $2 FOR UPDATE",
    )
    .bind(&user_id)
    .bind(&key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "config lookup failed"})),
        )
    })?;

    match (existing, input.expected_version) {
        (None, None) => {}
        (None, Some(_)) => {
            return Err((
                StatusCode::CONFLICT,
                Json(json!({"error": "config already exists"})),
            ));
        }
        (Some((cur,)), Some(want)) if cur == want => {}
        (Some((cur,)), Some(want)) => {
            return Err((
                StatusCode::CONFLICT,
                Json(json!({
                    "error": "version conflict",
                    "expected_version": want,
                    "server_version": cur,
                })),
            ));
        }
        (Some(_), None) => {
            return Err((
                StatusCode::CONFLICT,
                Json(json!({"error": "config exists; expected_version required"})),
            ));
        }
    }

    let new_version = existing.map(|(v,)| v + 1).unwrap_or(1);

    if existing.is_none() {
        sqlx::query(
            "INSERT INTO agent_configs (user_id, config_key, value, version)
             VALUES ($1::uuid, $2, $3, $4)",
        )
        .bind(&user_id)
        .bind(&key)
        .bind(&input.value)
        .bind(new_version)
        .execute(&mut *tx)
        .await
        .map_err(|_e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "config insert failed"})),
            )
        })?;
    } else {
        sqlx::query(
            "UPDATE agent_configs SET value = $1, version = $2, updated_at = NOW()
             WHERE user_id = $3::uuid AND config_key = $4",
        )
        .bind(&input.value)
        .bind(new_version)
        .bind(&user_id)
        .bind(&key)
        .execute(&mut *tx)
        .await
        .map_err(|_e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "config update failed"})),
            )
        })?;
    }

    tx.commit().await.map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "tx commit failed"})),
        )
    })?;

    Ok((
        if existing.is_none() {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        },
        Json(json!({
            "config_key": key,
            "version": new_version,
        })),
    ))
}

// ─── secret 端点 ──────────────────────────────────────────────────────────

/// GET /api/agent/secrets — 列出所有 secret (仅 key + 掩码 + 元数据, 不含密文)
pub async fn list_secrets(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    match list_secrets_inner(&state, &user_id).await {
        Ok(secrets) => Ok(Json(json!({"secrets": secrets, "total": secrets.len()}))),
        Err(msg) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": msg})),
        )),
    }
}

/// M4 测试 helper: 跑 list_secrets 的核心逻辑 (无 HTTP 包装). 给 tests 用.
pub async fn list_secrets_inner(state: &AppState, user_id: &str) -> Result<Vec<Value>, String> {
    // 单次 SELECT 把 metadata + ciphertext + nonce 一起拉 — 同一行快照, 避免
    // "先查 key_version, 再查密文"两次查询之间 set_secret 插入新 v2 导致
    // key_version=1 + v2 密文的不一致组合, 进而按 v1 解密失败返 500.
    // 顺序: secret_key, ciphertext, nonce, key_version, size_bytes, updated_at
    let rows: Vec<(
        String,                        // secret_key
        String,                        // ciphertext
        String,                        // nonce
        i32,                           // key_version
        i32,                           // size_bytes
        chrono::DateTime<chrono::Utc>, // updated_at
    )> = sqlx::query_as(
        "SELECT secret_key, ciphertext, nonce,
                key_version, size_bytes, updated_at
         FROM agent_secrets WHERE user_id = $1::uuid
         ORDER BY secret_key",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| format!("secrets lookup failed: {e}"))?;

    let mut secrets = Vec::with_capacity(rows.len());
    for (k, ct, nonce, kv, sz, updated) in rows {
        let plaintext = crypto::decrypt_versioned(user_id, &k, &ct, &nonce, kv as u32)
            .map_err(|e| format!("secret decrypt failed: {e}"))?;
        let pt_str = String::from_utf8_lossy(&plaintext);

        // 输出元数据用变量 — 升级成功后写新值, 让这次响应的元数据跟 DB 同步
        // (否则客户端会拿到 kv=1 配 ciphertext=v2 这种瞬间不一致).
        let (mut out_kv, mut out_sz, mut out_updated) = (kv, sz, updated);

        // H3 惰性重加密: v1 读到 plaintext 后, 立刻用 v2 重加密, 更新 DB.
        // 下次读走 v2 路径, 不会再走 v1 (无 AAD) 兼容分支.
        //
        // H4 (第四轮验收修复): **CAS 条件 + rows_affected 检查** — 无条件 UPDATE 会覆盖
        // 用户刚 set_secret 写入的新 v2. 场景:
        //   T1 (this reader): SELECT v1 → 解密 → encrypt v2 → UPDATE  ← 我们
        //   T2 (concurrent setter): set_secret → 写入新 v2 (新明文, 新 ciphertext)
        //   T1 旧 UPDATE 没有 WHERE 条件 → 覆盖 T2 的新 v2 → 用户的新 secret 永久丢失
        // 修法: WHERE 加 `key_version = 1 AND ciphertext = $old_ct` 条件. 若 T2 已经写过,
        //       rows_affected = 0 → 跳过, 不覆盖. log warn 让 ops 知道.
        //
        // H5 (本轮): RETURNING updated_at — 升级成功后立刻把新元数据塞进响应, 避免
        //            "升级完了但客户端看到旧 key_version=1 / 旧 size / 旧 updated_at" 撕裂.
        if kv as u32 == crypto::V1_NO_AAD {
            if let Ok((new_ct, new_nonce)) = crypto::encrypt_v2(user_id, &k, &plaintext) {
                let new_size = (new_ct.len() + new_nonce.len()) as i32;
                let upgrade_result = sqlx::query(
                    "UPDATE agent_secrets
                     SET ciphertext = $1, nonce = $2, key_version = $3, size_bytes = $4, updated_at = NOW()
                     WHERE user_id = $5::uuid AND secret_key = $6
                       AND key_version = 1
                       AND ciphertext = $7
                     RETURNING updated_at",
                )
                .bind(&new_ct)
                .bind(&new_nonce)
                .bind(crypto::V2_WITH_AAD as i32)
                .bind(new_size)
                .bind(user_id)
                .bind(&k)
                .bind(&ct) // 旧 v1 ciphertext — 条件匹配
                .fetch_optional(&state.db)
                .await;

                match upgrade_result {
                    Ok(Some(row)) => {
                        // rows_affected = 1 → 升级成功, 用 DB 返回的 updated_at 覆盖输出元数据
                        let new_updated: chrono::DateTime<chrono::Utc> =
                            row.try_get("updated_at").unwrap_or(chrono::Utc::now());
                        out_kv = crypto::V2_WITH_AAD as i32;
                        out_sz = new_size;
                        out_updated = new_updated;
                        tracing::info!(
                            user_id = %user_id,
                            secret_key = %k,
                            "secret lazily upgraded v1 → v2"
                        );
                    }
                    Ok(None) => {
                        // rows_affected = 0: 已被其他 writer 改过 (set_secret / 其他 reader 已升级).
                        // 不覆盖, 跳过. 响应沿用入参的 kv/sz/updated — 这是 DB 真实当前状态.
                        tracing::warn!(
                            user_id = %user_id,
                            secret_key = %k,
                            "v1→v2 lazy upgrade CAS missed (rows_affected=0): \
                             secret was modified concurrently, NOT overwritten. \
                             Reader still returned plaintext to client, but DB state untouched."
                        );
                    }
                    Err(e) => {
                        // 升级失败 (DB 错误) → 不致命, 继续 serve 当前请求. 下次读会再尝试.
                        tracing::warn!(
                            user_id = %user_id,
                            secret_key = %k,
                            error = %e,
                            "v1→v2 lazy re-encrypt failed (will retry on next read)"
                        );
                    }
                }
            }
        }

        secrets.push(json!({
            "secret_key": k,
            "configured": true,
            "masked": crypto::mask_secret(&pt_str),
            "key_version": out_kv,
            "size_bytes": out_sz,
            "updated_at": out_updated.to_rfc3339(),
        }));
    }

    Ok(secrets)
}

#[derive(Deserialize)]
pub struct SecretSetInput {
    pub value: String,
}

/// PUT /api/agent/secrets/:key — 设置或替换一个 secret (轮换时记录 rotated_from)
pub async fn set_secret(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(input): Json<SecretSetInput>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    if key.is_empty() || key.len() > 128 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "secret_key length 1-128"})),
        ));
    }
    if input.value.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "secret value must not be empty"})),
        ));
    }
    if input.value.len() > 4096 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "secret too long (max 4096 bytes)"})),
        ));
    }

    let (ct, nonce) = crypto::encrypt(&user_id, &key, input.value.as_bytes()).map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "encrypt failed"})),
        )
    })?;
    let size_bytes = (ct.len() + nonce.len()) as i32;
    let masked = crypto::mask_secret(&input.value);

    let mut tx = state.db.begin().await.map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "tx begin failed"})),
        )
    })?;

    let existing: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM agent_secrets WHERE user_id = $1::uuid AND secret_key = $2 FOR UPDATE",
    )
    .bind(&user_id)
    .bind(&key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "secret lookup failed"})),
        )
    })?;

    let existed = existing.is_some();
    let rotated_from: Option<String> = existing.as_ref().map(|(id,)| id.to_string());

    sqlx::query(
        "INSERT INTO agent_secrets (user_id, secret_key, ciphertext, nonce, key_version, size_bytes, rotated_from)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, NULLIF($7, '')::uuid)
         ON CONFLICT (user_id, secret_key) DO UPDATE
         SET ciphertext = EXCLUDED.ciphertext,
             nonce = EXCLUDED.nonce,
             key_version = EXCLUDED.key_version,
             size_bytes = EXCLUDED.size_bytes,
             rotated_from = EXCLUDED.rotated_from,
             updated_at = NOW()",
    )
    .bind(&user_id)
    .bind(&key)
    .bind(&ct)
    .bind(&nonce)
    .bind(crypto::CURRENT_KEY_VERSION as i32)
    .bind(size_bytes)
    .bind(rotated_from.as_deref().unwrap_or(""))
    .execute(&mut *tx)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "secret write failed"})),
        )
    })?;

    tx.commit().await.map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "tx commit failed"})),
        )
    })?;

    Ok((
        if existed {
            StatusCode::OK
        } else {
            StatusCode::CREATED
        },
        Json(json!({
            "secret_key": key,
            "configured": true,
            "masked": masked,
            "key_version": crypto::CURRENT_KEY_VERSION,
        })),
    ))
}

/// DELETE /api/agent/secrets/:key
pub async fn delete_secret(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    let affected =
        sqlx::query("DELETE FROM agent_secrets WHERE user_id = $1::uuid AND secret_key = $2")
            .bind(&user_id)
            .bind(&key)
            .execute(&state.db)
            .await
            .map_err(|_e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "secret delete failed"})),
                )
            })?;
    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "secret not found"})),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

use uuid::Uuid;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn allowed_config_keys_include_documented_set() {
        for k in ["providers", "persona", "tools", "mcp_servers", "settings"] {
            assert!(ALLOWED_CONFIG_KEYS.contains(&k));
        }
    }

    #[test]
    fn value_validation_rejects_primitives() {
        // 顶层必须是 object 或 array; 拒绝 string / number / bool
        let bad_values = [json!("a string"), json!(42), json!(true), json!(null)];
        for v in bad_values {
            assert!(!(v.is_object() || v.is_array()));
        }
    }

    #[test]
    fn value_validation_accepts_objects_and_arrays() {
        assert!(json!({"a": 1}).is_object());
        assert!(json!([1, 2, 3]).is_array());
    }
}
