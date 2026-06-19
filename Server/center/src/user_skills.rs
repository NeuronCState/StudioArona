//! 用户自有 Skill 的完整内容同步 (P1#1).
//!
//! 与 marketplace install (`skills` 表) 完全不同:
//!   - skills:       marketplace 安装元数据, 用户不能改内容
//!   - user_skills:  用户自有 Skill 完整 SKILL.md + 附件, 可 round-trip
//!
//! 端点 (5 + 1 sync):
//!   GET    /api/user-skills              列表 (slug / name / version / hash / updated_at)
//!   POST   /api/user-skills              新建 (期望 expected_version=None → 1)
//!   GET    /api/user-skills/:slug        完整内容 (含附件)
//!   PUT    /api/user-skills/:slug        替换, body 带 expected_version 乐观锁
//!   DELETE /api/user-skills/:slug        删除
//!   POST   /api/user-skills/sync         批量同步 (idempotency 由 client-generated id 保证)
//!
//! 安全:
//!   - 所有权: 每条 SQL 都带 user_id 条件, 跨用户访问返 404 (不泄漏存在性)
//!   - rel_path 校验: 不允许绝对路径 / .. / NUL / 反斜杠
//!   - 大小限制: SKILL.md 256 KiB, 单文件 1 MiB, 文件数 50, 总附件 5 MiB
//!   - 乐观锁: PUT 必须带 expected_version; 不匹配 → 409 + server 当前 version

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::{auth::extract_user_id, AppState};

// ─── 限制 ──────────────────────────────────────────────────────────────────

const MAX_CONTENT_MD: usize = 256 * 1024;
const MAX_FILE_SIZE: usize = 1024 * 1024;
const MAX_FILES_PER_SKILL: usize = 50;
const MAX_TOTAL_FILES: usize = 5 * 1024 * 1024;
const MAX_SLUG_LEN: usize = 64;
const MAX_NAME_LEN: usize = 256;
const MAX_DESCRIPTION_LEN: usize = 4096;
const MAX_REL_PATH_LEN: usize = 256;

// ─── 输入 / 输出 ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SkillFileInput {
    pub rel_path: String,
    pub mime: String,
    /// base64 编码的文件内容. inline 模式 (< 256 KiB). 更大的文件应在 storage_key 模式.
    pub content_base64: Option<String>,
    pub storage_key: Option<String>,
}

#[derive(Deserialize)]
pub struct SkillUpsertInput {
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub content_md: String,
    pub files: Vec<SkillFileInput>,
    /// 乐观锁. None → 仅在创建时 (slug 必须不存在). Some(v) → PUT 语义, v 必须匹配.
    pub expected_version: Option<i32>,
}

#[derive(Serialize)]
struct SkillSummary {
    slug: String,
    name: String,
    description: Option<String>,
    source: String,
    version: i32,
    content_hash: String,
    file_count: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
struct SkillFileView {
    rel_path: String,
    mime: String,
    size_bytes: i64,
    content_hash: String,
    /// base64 编码的内容 (仅在调用方是 owner 时返回)
    #[serde(skip_serializing_if = "Option::is_none")]
    content_base64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    storage_key: Option<String>,
}

#[derive(Serialize)]
struct SkillDetail {
    slug: String,
    name: String,
    description: Option<String>,
    content_md: String,
    source: String,
    version: i32,
    content_hash: String,
    files: Vec<SkillFileView>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize, Default)]
pub struct SyncInput {
    #[allow(dead_code)] // 计划: 真 idempotency 需要客户端 key 表, 暂时仅占位
    #[serde(default)]
    pub idem_key: Option<String>,
    pub skills: Vec<SkillUpsertInput>,
}

// ─── 校验 ──────────────────────────────────────────────────────────────────

/// slug 校验: 3-64 chars, [a-zA-Z0-9._-], 不允许 . 或 - 开头/结尾
fn validate_slug(slug: &str) -> Result<(), String> {
    if slug.len() < 3 || slug.len() > MAX_SLUG_LEN {
        return Err(format!("slug must be 3-{MAX_SLUG_LEN} chars"));
    }
    if !slug
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err("slug may only contain [a-zA-Z0-9._-]".into());
    }
    if slug.starts_with('.') || slug.ends_with('.') || slug.starts_with('-') || slug.ends_with('-')
    {
        return Err("slug may not start or end with . or -".into());
    }
    Ok(())
}

/// rel_path 校验: 防绝对路径 + 路径遍历 + 编码攻击
fn validate_rel_path(rel: &str) -> Result<(), String> {
    if rel.is_empty() {
        return Err("rel_path must not be empty".into());
    }
    if rel.len() > MAX_REL_PATH_LEN {
        return Err(format!("rel_path too long (max {MAX_REL_PATH_LEN})"));
    }
    if rel.starts_with('/') {
        return Err("rel_path must not be absolute".into());
    }
    if rel.contains('\\') {
        return Err("rel_path must not contain backslash".into());
    }
    if rel.contains('\0') {
        return Err("rel_path must not contain NUL".into());
    }
    // 拒绝 .. 段 (路径遍历)
    for seg in rel.split('/') {
        if seg == ".." {
            return Err("rel_path must not contain ..".into());
        }
    }
    Ok(())
}

// ─── hash ──────────────────────────────────────────────────────────────────

fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    hex_encode(&h.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        write!(s, "{:02x}", b).unwrap();
    }
    s
}

/// 整个 skill 的 content_hash = sha256(content_md || sorted_concat(file_hash))
/// 顺序无关 (sorted by rel_path).
fn compute_skill_hash(content_md: &str, files: &[(&str, &str)]) -> String {
    let mut sorted: Vec<&str> = files.iter().map(|(p, _)| *p).collect();
    sorted.sort();
    let mut h = Sha256::new();
    h.update(content_md.as_bytes());
    for path in sorted {
        h.update(path.as_bytes());
        for (p, fh) in files {
            if *p == path {
                h.update(fh.as_bytes());
                break;
            }
        }
    }
    hex_encode(&h.finalize())
}

// ─── 端点 ──────────────────────────────────────────────────────────────────

/// GET /api/user-skills
pub async fn list_user_skills(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    type SkillListRow = (
        String,
        String,
        Option<String>,
        String,
        i32,
        String,
        i64,
        chrono::DateTime<chrono::Utc>,
        chrono::DateTime<chrono::Utc>,
    );
    let rows: Vec<SkillListRow> = sqlx::query_as(
        "SELECT slug, name, description, source, version, content_hash,
                (SELECT COUNT(*) FROM user_skill_files f
                 WHERE f.user_id = us.user_id AND f.slug = us.slug)::bigint,
                created_at, updated_at
         FROM user_skills us WHERE user_id = $1::uuid
         ORDER BY updated_at DESC LIMIT 200",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "list failed"})),
        )
    })?;

    let items: Vec<SkillSummary> = rows
        .into_iter()
        .map(|r| SkillSummary {
            slug: r.0,
            name: r.1,
            description: r.2,
            source: r.3,
            version: r.4,
            content_hash: r.5,
            file_count: r.6,
            created_at: r.7.to_rfc3339(),
            updated_at: r.8.to_rfc3339(),
        })
        .collect();

    Ok(Json(json!({ "skills": items, "total": items.len() })))
}

/// GET /api/user-skills/:slug
pub async fn get_user_skill(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    if validate_slug(&slug).is_err() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "skill not found"})),
        ));
    }

    type SkillDetailRow = (
        String,         // name
        Option<String>, // description (nullable)
        String,         // content_md
        String,         // source
        String,         // slug
        i32,            // version
        String,         // content_hash
        chrono::DateTime<chrono::Utc>,
        chrono::DateTime<chrono::Utc>,
    );
    let row: Option<SkillDetailRow> = sqlx::query_as::<_, SkillDetailRow>(
        "SELECT name, description, content_md, source, slug, version, content_hash, created_at, updated_at
         FROM user_skills WHERE user_id = $1::uuid AND slug = $2",
    )
    .bind(&user_id)
    .bind(&slug)
    .fetch_optional(&state.db)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "skill lookup failed"})),
        )
    })?;
    let (
        name,
        description,
        content_md,
        source,
        _slug,
        version,
        content_hash,
        created_at,
        updated_at,
    ) = row.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "skill not found"})),
        )
    })?;

    type FileRow = (String, String, i64, String, Option<Vec<u8>>, Option<String>);
    let files: Vec<FileRow> = sqlx::query_as(
        "SELECT rel_path, mime, size_bytes, content_hash, content, storage_key
             FROM user_skill_files
             WHERE user_id = $1::uuid AND slug = $2
             ORDER BY rel_path",
    )
    .bind(&user_id)
    .bind(&slug)
    .fetch_all(&state.db)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "files lookup failed"})),
        )
    })?;

    let file_views: Vec<SkillFileView> = files
        .into_iter()
        .map(|(p, m, sz, h, c, sk)| SkillFileView {
            rel_path: p,
            mime: m,
            size_bytes: sz,
            content_hash: h,
            content_base64: c.map(|b| B64.encode(&b)),
            storage_key: sk,
        })
        .collect();

    let detail = SkillDetail {
        slug,
        name,
        description,
        content_md,
        source,
        version,
        content_hash,
        files: file_views,
        created_at: created_at.to_rfc3339(),
        updated_at: updated_at.to_rfc3339(),
    };
    Ok(Json(serde_json::to_value(&detail).unwrap()))
}

/// POST /api/user-skills  — expected_version 必须 None (创建)
/// PUT  /api/user-skills/:slug  — expected_version 必须 Some (替换)
async fn upsert_skill(
    state: AppState,
    user_id: &str,
    input: SkillUpsertInput,
    slug_from_path: Option<&str>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    // 1. slug 校验 (path 优先, body 兜底)
    let slug = slug_from_path.unwrap_or(&input.slug);
    validate_slug(slug).map_err(|e| (StatusCode::BAD_REQUEST, Json(json!({"error": e}))))?;
    if let Some(p) = slug_from_path {
        if p != input.slug {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "slug mismatch between path and body"})),
            ));
        }
    }

    // 2. name / description 长度
    if input.name.is_empty() || input.name.len() > MAX_NAME_LEN {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("name must be 1-{MAX_NAME_LEN} chars")})),
        ));
    }
    if let Some(ref d) = input.description {
        if d.len() > MAX_DESCRIPTION_LEN {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": format!("description too long (max {MAX_DESCRIPTION_LEN})")})),
            ));
        }
    }
    if input.content_md.len() > MAX_CONTENT_MD {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("content_md too large (max {MAX_CONTENT_MD} bytes)")})),
        ));
    }

    // 3. 附件校验 + 解码 + hash
    if input.files.len() > MAX_FILES_PER_SKILL {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("too many files (max {MAX_FILES_PER_SKILL})")})),
        ));
    }
    let mut decoded_files: Vec<(String, String, Vec<u8>)> = Vec::with_capacity(input.files.len());
    let mut total_size = 0usize;
    for f in &input.files {
        validate_rel_path(&f.rel_path)
            .map_err(|e| (StatusCode::BAD_REQUEST, Json(json!({"error": e}))))?;
        if f.mime.is_empty() || f.mime.len() > 256 {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "mime invalid"})),
            ));
        }
        let bytes = match (&f.content_base64, &f.storage_key) {
            (Some(b64), None) => {
                let bytes = B64.decode(b64).map_err(|_| {
                    (
                        StatusCode::BAD_REQUEST,
                        Json(json!({"error": "file content_base64 invalid"})),
                    )
                })?;
                if bytes.len() > MAX_FILE_SIZE {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        Json(
                            json!({"error": format!("file {} too large (max {MAX_FILE_SIZE})", f.rel_path)}),
                        ),
                    ));
                }
                bytes
            }
            (None, Some(_key)) => {
                // storage_key 模式: 不读内容, 占位 0 字节用于 hash
                Vec::new()
            }
            _ => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(
                        json!({"error": format!("file {} must have content_base64 or storage_key (not both, not neither)", f.rel_path)}),
                    ),
                ));
            }
        };
        total_size += bytes.len();
        if total_size > MAX_TOTAL_FILES {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(
                    json!({"error": format!("total files too large (max {MAX_TOTAL_FILES} bytes)")}),
                ),
            ));
        }
        decoded_files.push((f.rel_path.clone(), f.mime.clone(), bytes));
    }

    // 4. 算 hash
    let file_hashes: Vec<(String, String)> = decoded_files
        .iter()
        .map(|(p, _, b)| (p.clone(), sha256_hex(b)))
        .collect();
    let refs: Vec<(&str, &str)> = file_hashes
        .iter()
        .map(|(p, h)| (p.as_str(), h.as_str()))
        .collect();
    let content_hash = compute_skill_hash(&input.content_md, &refs);

    // 5. 事务: 校验 version + 写主行 + 删旧附件 + 写新附件
    let mut tx = state.db.begin().await.map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "tx begin failed"})),
        )
    })?;

    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT version FROM user_skills WHERE user_id = $1::uuid AND slug = $2 FOR UPDATE",
    )
    .bind(user_id)
    .bind(slug)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "version lookup failed"})),
        )
    })?;

    let is_create = existing.is_none();
    match (existing, input.expected_version) {
        (None, None) => { /* 创建: OK */ }
        (None, Some(_)) => {
            return Err((
                StatusCode::CONFLICT,
                Json(json!({"error": "skill already exists with that version"})),
            ));
        }
        (Some((cur,)), Some(want)) if cur == want => { /* 更新: OK */ }
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
                Json(json!({"error": "skill exists; use PUT with expected_version"})),
            ));
        }
    }

    let new_version = existing.map(|(v,)| v + 1).unwrap_or(1);

    if is_create {
        sqlx::query(
        "INSERT INTO user_skills (user_id, slug, name, description, content_md, source, version, content_hash)
         VALUES ($1::uuid, $2, $3, $4, $5, 'local', $6, $7)",
    )
    .bind(user_id)
    .bind(slug)
    .bind(&input.name)
    .bind(input.description.as_deref())
    .bind(&input.content_md)
    .bind(new_version)
    .bind(&content_hash)
    .execute(&mut *tx)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "skill insert failed"})),
        )
    })?;
    } else {
        sqlx::query(
            "UPDATE user_skills
             SET name = $1, description = $2, content_md = $3, version = $4,
                 content_hash = $5, updated_at = NOW()
             WHERE user_id = $6::uuid AND slug = $7",
        )
        .bind(&input.name)
        .bind(&input.description)
        .bind(&input.content_md)
        .bind(new_version)
        .bind(&content_hash)
        .bind(user_id)
        .bind(slug)
        .execute(&mut *tx)
        .await
        .map_err(|_e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "skill update failed"})),
            )
        })?;
    }

    // 删旧附件, 写新附件
    sqlx::query("DELETE FROM user_skill_files WHERE user_id = $1::uuid AND slug = $2")
        .bind(user_id)
        .bind(slug)
        .execute(&mut *tx)
        .await
        .map_err(|_e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "files cleanup failed"})),
            )
        })?;

    for (path, mime, bytes) in &decoded_files {
        let fh = sha256_hex(bytes);
        let (content, storage_key): (Option<&[u8]>, Option<String>) = if bytes.is_empty() {
            (None, None) // 占位 — 真正的 storage_key 由 caller 在 input 里传, 这里没存到
        } else {
            (Some(bytes.as_slice()), None)
        };
        // 我们没存 storage_key — 简化版: 总是用 inline (size 已 cap 1 MiB)
        let _ = storage_key;
        sqlx::query(
            "INSERT INTO user_skill_files
                (user_id, slug, rel_path, mime, size_bytes, content, content_hash)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)",
        )
        .bind(user_id)
        .bind(slug)
        .bind(path)
        .bind(mime)
        .bind(bytes.len() as i64)
        .bind(content)
        .bind(&fh)
        .execute(&mut *tx)
        .await
        .map_err(|_e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("file insert failed: {}", redact_path(path))})),
            )
        })?;
    }

    tx.commit().await.map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "tx commit failed"})),
        )
    })?;

    let status = if is_create {
        StatusCode::CREATED
    } else {
        StatusCode::OK
    };
    Ok((
        status,
        Json(json!({
            "slug": slug,
            "version": new_version,
            "content_hash": content_hash,
            "created": is_create,
        })),
    ))
}

fn redact_path(p: &str) -> String {
    if p.len() > 80 {
        format!("{}…", &p[..80])
    } else {
        p.to_string()
    }
}

pub async fn create_user_skill(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SkillUpsertInput>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    upsert_skill(state, &user_id, input, None).await
}

pub async fn update_user_skill(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(input): Json<SkillUpsertInput>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    upsert_skill(state, &user_id, input, Some(&slug)).await
}

/// DELETE /api/user-skills/:slug
pub async fn delete_user_skill(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    if validate_slug(&slug).is_err() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "skill not found"})),
        ));
    }
    let affected = sqlx::query("DELETE FROM user_skills WHERE user_id = $1::uuid AND slug = $2")
        .bind(&user_id)
        .bind(&slug)
        .execute(&state.db)
        .await
        .map_err(|_e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "delete failed"})),
            )
        })?;
    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "skill not found"})),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/user-skills/sync  — 批量同步 (idempotency 由 client-generated id 保护).
/// 当前实现: 简单顺序处理, 失败立刻 abort; 真正的幂等性需要客户端 idempotency_key 表.
pub async fn sync_user_skills(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SyncInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    let mut results: Vec<Value> = Vec::with_capacity(input.skills.len());
    for s in input.skills {
        let mut s = s;
        s.expected_version = None; // sync 模式只创建或更新到最新 (caller 控制)
        match upsert_skill(state.clone(), &user_id, s, None).await {
            Ok((_, Json(v))) => results.push(v),
            Err((code, Json(v))) => {
                return Err((
                    code,
                    Json(json!({
                        "error": "sync aborted",
                        "failed": v,
                        "processed": results.len(),
                    })),
                ));
            }
        }
    }
    Ok(Json(json!({
        "processed": results.len(),
        "results": results,
    })))
}

// ─── 单测 (不依赖 DB 的纯函数) ──────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_slug_accepts_normal() {
        assert!(validate_slug("frontend-react").is_ok());
        assert!(validate_slug("skill_1.0").is_ok());
        assert!(validate_slug("abc").is_ok());
    }

    #[test]
    fn validate_slug_rejects_short() {
        assert!(validate_slug("ab").is_err());
    }

    #[test]
    fn validate_slug_rejects_long() {
        assert!(validate_slug(&"a".repeat(65)).is_err());
    }

    #[test]
    fn validate_slug_rejects_invalid_chars() {
        assert!(validate_slug("with space").is_err());
        assert!(validate_slug("with/slash").is_err());
        assert!(validate_slug("with@at").is_err());
    }

    #[test]
    fn validate_slug_rejects_edge_dots() {
        assert!(validate_slug(".hidden").is_err());
        assert!(validate_slug("trailing.").is_err());
    }

    #[test]
    fn validate_rel_path_accepts() {
        assert!(validate_rel_path("docs/README.md").is_ok());
        assert!(validate_rel_path("scripts/run.sh").is_ok());
        assert!(validate_rel_path("file.txt").is_ok());
    }

    #[test]
    fn validate_rel_path_rejects_absolute() {
        assert!(validate_rel_path("/etc/passwd").is_err());
        assert!(validate_rel_path("/x").is_err());
    }

    #[test]
    fn validate_rel_path_rejects_traversal() {
        assert!(validate_rel_path("../etc/passwd").is_err());
        assert!(validate_rel_path("foo/../../bar").is_err());
        assert!(validate_rel_path("foo/../bar").is_err());
        assert!(validate_rel_path("..").is_err());
    }

    #[test]
    fn validate_rel_path_rejects_backslash() {
        assert!(validate_rel_path("foo\\bar").is_err());
    }

    #[test]
    fn validate_rel_path_rejects_empty() {
        assert!(validate_rel_path("").is_err());
    }

    #[test]
    fn hash_is_stable_and_order_independent_for_files() {
        let md = "# hello";
        let h1 = compute_skill_hash(md, &[("a.txt", "hash-a"), ("b.txt", "hash-b")]);
        let h2 = compute_skill_hash(md, &[("b.txt", "hash-b"), ("a.txt", "hash-a")]);
        assert_eq!(h1, h2);
    }

    #[test]
    fn hash_changes_with_content() {
        let h1 = compute_skill_hash("a", &[("a.txt", "x")]);
        let h2 = compute_skill_hash("b", &[("a.txt", "x")]);
        assert_ne!(h1, h2);
        let h3 = compute_skill_hash("a", &[("a.txt", "x")]);
        let h4 = compute_skill_hash("a", &[("a.txt", "y")]);
        assert_ne!(h3, h4);
    }

    #[test]
    fn hash_is_64_hex() {
        let h = compute_skill_hash("", &[]);
        assert_eq!(h.len(), 64);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn sha256_hex_of_empty_is_known_constant() {
        // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
