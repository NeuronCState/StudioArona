//! RSS / Atom feed management + cron + safe fetch + persist.
//!
//! 端点 (10):
//!   GET    /api/feeds                列出当前用户的 feeds
//!   POST   /api/feeds                新建 feed (user_id 强制 ownership)
//!   PATCH  /api/feeds/:id            更新 (限 owner)
//!   DELETE /api/feeds/:id            删除 (限 owner)
//!   GET    /api/feeds/:id/items      列出 feed items (限 owner)
//!   POST   /api/feeds/:id/refresh    手动拉一次 (走和 cron 同一业务函数)
//!
//! cron:
//!   start_cron 每 15min 跑一次 (env RSS_CRON_INTERVAL_SECS 可调)
//!   同一 feed 新增 N 条 → 合并成 1 条 notification (避免 spam)
//!   通知标题 = "<feed 标题> 有 N 条新内容", body 包含前 3 条标题
//!   失败 / 跳过不影响其他 feed

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::time::Duration;

use crate::{
    auth::extract_user_id, cron_tracker::CronTracker, events, notifications, safe_fetch, AppState,
};
use futures::StreamExt;

const CRON_NAME: &str = "rss";

// ─── Feed CRUD ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct FeedInput {
    pub url: String,
    pub title: Option<String>,
    pub source: Option<String>,
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_priority() -> String {
    "normal".to_string()
}

fn default_enabled() -> bool {
    true
}

/// POST /api/feeds
pub async fn create_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<FeedInput>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let auth = extract_user_id(&headers, &state.config.jwt_secret);
    let (user_id, _, _) = match auth {
        Ok(t) => t,
        Err((s, v)) => return Err((s, Json(v))),
    };

    if input.url.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "url is required"})),
        ));
    }

    let row: (String, DateTime<Utc>) = sqlx::query_as(
        "INSERT INTO feeds (user_id, url, title, source, priority, enabled)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         RETURNING id::text, created_at",
    )
    .bind(&user_id)
    .bind(input.url.trim())
    .bind(&input.title)
    .bind(&input.source)
    .bind(&input.priority)
    .bind(input.enabled)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("duplicate") || msg.contains("unique") {
            (
                StatusCode::CONFLICT,
                Json(json!({"error": "feed url already exists"})),
            )
        } else if msg.contains("check") {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "priority must be low|normal|high"})),
            )
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "feed create failed"})),
            )
        }
    })?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id": row.0,
            "url": input.url,
            "title": input.title,
            "source": input.source,
            "priority": input.priority,
            "enabled": input.enabled,
            "created_at": row.1,
        })),
    ))
}

/// PATCH /api/feeds/:id
pub async fn update_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<FeedInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let auth = extract_user_id(&headers, &state.config.jwt_secret);
    let (user_id, _, _) = match auth {
        Ok(t) => t,
        Err((s, v)) => return Err((s, Json(v))),
    };

    let affected = sqlx::query(
        "UPDATE feeds SET url = $1, title = $2, source = $3, priority = $4, enabled = $5
         WHERE id = $6::uuid AND user_id = $7::uuid",
    )
    .bind(input.url.trim())
    .bind(&input.title)
    .bind(&input.source)
    .bind(&input.priority)
    .bind(input.enabled)
    .bind(&id)
    .bind(&user_id)
    .execute(&state.db)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "feed update failed"})),
        )
    })?;

    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "feed not found"})),
        ));
    }

    Ok(Json(json!({
        "id": id,
        "url": input.url,
        "title": input.title,
        "source": input.source,
        "priority": input.priority,
        "enabled": input.enabled,
    })))
}

/// DELETE /api/feeds/:id
pub async fn delete_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    let affected = sqlx::query("DELETE FROM feeds WHERE id = $1::uuid AND user_id = $2::uuid")
        .bind(&id)
        .bind(&user_id)
        .execute(&state.db)
        .await
        .map_err(|_e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "feed delete failed"})),
            )
        })?;
    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "feed not found"})),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ─── Read endpoints ────────────────────────────────────────────────────────

/// GET /api/feeds
pub async fn list_feeds(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let auth = extract_user_id(&headers, &state.config.jwt_secret);
    let (user_id, _, _) = match auth {
        Ok(t) => t,
        Err((s, v)) => return Err((s, Json(v))),
    };

    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            Option<String>,
            Option<String>,
            String,
            bool,
            DateTime<Utc>,
        ),
    >(
        "SELECT id::text, url, title, source, priority, enabled, created_at
         FROM feeds WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 200",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "feed list failed"})),
        )
    })?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.0,
                "url": r.1,
                "title": r.2,
                "source": r.3,
                "priority": r.4,
                "enabled": r.5,
                "created_at": r.6,
            })
        })
        .collect();

    Ok(Json(json!(items)))
}

/// GET /api/feeds/:id/items
pub async fn list_feed_items(
    State(state): State<AppState>,
    Path(feed_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let auth = extract_user_id(&headers, &state.config.jwt_secret);
    let (user_id, _, _) = match auth {
        Ok(t) => t,
        Err((s, v)) => return Err((s, Json(v))),
    };
    if uuid::Uuid::parse_str(&feed_id).is_err() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "feed not found"})),
        ));
    }
    // Ownership
    let owned: Option<(String,)> =
        sqlx::query_as("SELECT id::text FROM feeds WHERE id = $1::uuid AND user_id = $2::uuid")
            .bind(&feed_id)
            .bind(&user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|_e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "feed lookup failed"})),
                )
            })?;
    if owned.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "feed not found"})),
        ));
    }

    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, Option<DateTime<Utc>>, bool, DateTime<Utc>, Option<String>)>(
        "SELECT id::text, feed_id::text, title, link, summary, author, published_at, starred, created_at, guid
         FROM feed_items WHERE feed_id = $1::uuid
         ORDER BY COALESCE(published_at, created_at) DESC LIMIT 200",
    )
    .bind(&feed_id)
    .fetch_all(&state.db)
    .await
    .map_err(|_e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "items lookup failed"}))))?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.0,
                "feed_id": r.1,
                "title": r.2,
                "link": r.3,
                "summary": r.4,
                "author": r.5,
                "published_at": r.6,
                "read_at": Value::Null,
                "starred": r.7,
                "created_at": r.8,
                "guid": r.9,
            })
        })
        .collect();

    Ok(Json(json!(items)))
}

// ─── Parsed item shape ─────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ParsedItem {
    pub title: String,
    pub link: Option<String>,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub guid: Option<String>,
    pub dedupe_key: String,
}

#[derive(Debug)]
pub struct FetchResult {
    pub items: Vec<ParsedItem>,
    pub channel_title: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)] // 诊断字段: 未来可暴露给客户端 (rss/atom)
pub enum FeedFormat {
    Rss2,
    Atom,
}

/// 计算 dedupe_key (spec §6.2: 没有 link 也必须有稳定去重键).
///
/// 优先级: link > guid > sha256(title || published_at)
pub fn compute_dedupe_key(
    link: Option<&str>,
    guid: Option<&str>,
    title: &str,
    published_at: Option<DateTime<Utc>>,
) -> String {
    if let Some(l) = link {
        if !l.is_empty() {
            return format!("link:{}", l);
        }
    }
    if let Some(g) = guid {
        if !g.is_empty() {
            return format!("guid:{}", g);
        }
    }
    // fallback: title + published_at
    let mut h = Sha256::new();
    h.update(b"title-pub:");
    h.update(title.as_bytes());
    h.update(b"|");
    if let Some(p) = published_at {
        h.update(p.to_rfc3339().as_bytes());
    } else {
        h.update(b"<no-date>");
    }
    format!("hash:{}", hex_encode(&h.finalize()))
}

fn hex_encode(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        write!(s, "{:02x}", b).unwrap();
    }
    s
}

// ─── fetch_feed: RSS 2.0 + Atom ────────────────────────────────────────────

pub async fn fetch_feed(url: &str) -> anyhow::Result<FetchResult> {
    safe_fetch::validate_public_url(url)?;
    let body = safe_fetch::fetch_with_limit(
        safe_fetch::DEFAULT_TIMEOUT,
        "Studio-Arona/3.0 RSS Bot",
        url,
        safe_fetch::RSS_BODY_LIMIT,
    )
    .await?;

    // 嗅探: <rss ...> → RSS 2.0; <feed xmlns="http://www.w3.org/2005/Atom"> → Atom
    let head = String::from_utf8_lossy(&body[..body.len().min(2048)]);
    let head_lower = head.to_ascii_lowercase();
    if head_lower.contains("<feed") && head_lower.contains("atom") {
        parse_atom(&body).await
    } else {
        parse_rss2(&body).await
    }
}

async fn parse_rss2(body: &[u8]) -> anyhow::Result<FetchResult> {
    let channel = rss::Channel::read_from(body)?;
    let channel_title = {
        let t = channel.title.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    };
    let mut out = Vec::with_capacity(channel.items.len());
    for item in channel.items {
        let title = item
            .title
            .as_deref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "(untitled)".to_string());
        let link = item
            .link
            .as_deref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let summary = item
            .description
            .as_deref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let author = item
            .author
            .as_deref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let published_at = item
            .pub_date
            .as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc2822(s).ok())
            .map(|dt| dt.with_timezone(&Utc));
        let guid = item
            .guid
            .as_ref()
            .map(|g| g.value.trim().to_string())
            .filter(|s| !s.is_empty());
        let dedupe_key = compute_dedupe_key(link.as_deref(), guid.as_deref(), &title, published_at);
        out.push(ParsedItem {
            title,
            link,
            summary,
            author,
            published_at,
            guid,
            dedupe_key,
        });
    }
    let _ = FeedFormat::Rss2; // type marker (dead_code OK)
    Ok(FetchResult {
        items: out,
        channel_title,
    })
}

async fn parse_atom(body: &[u8]) -> anyhow::Result<FetchResult> {
    let feed = atom_syndication::Feed::read_from(body)?;
    let channel_title = {
        let t = feed.title.value.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    };
    let _ = FeedFormat::Atom; // type marker (dead_code OK)
    let mut out = Vec::with_capacity(feed.entries.len());
    for entry in feed.entries {
        let title = if entry.title.value.trim().is_empty() {
            "(untitled)".to_string()
        } else {
            entry.title.value.trim().to_string()
        };
        // Atom link: 选第一个 rel="alternate" (或第一个 link)
        let link = entry
            .links
            .iter()
            .find(|l| l.rel == "alternate" || l.rel.is_empty())
            .map(|l| l.href.clone())
            .filter(|s| !s.is_empty());
        let summary = entry
            .summary
            .as_ref()
            .map(|s| s.value.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                entry
                    .content
                    .as_ref()
                    .and_then(|c| c.value.clone())
                    .map(|v| v.trim().to_string())
                    .filter(|s| !s.is_empty())
            });
        let author = entry
            .authors
            .first()
            .map(|p| p.name.trim().to_string())
            .filter(|s| !s.is_empty());
        // FixedDateTime is DateTime<FixedOffset>; .with_timezone(&Utc) gives DateTime<Utc>.
        let published_at = entry
            .published
            .map(|d| d.with_timezone(&Utc))
            .or_else(|| Some(entry.updated.with_timezone(&Utc)));
        let guid = entry.id.trim().to_string().into_opt();
        let dedupe_key = compute_dedupe_key(link.as_deref(), guid.as_deref(), &title, published_at);
        out.push(ParsedItem {
            title,
            link,
            summary,
            author,
            published_at,
            guid,
            dedupe_key,
        });
    }
    Ok(FetchResult {
        items: out,
        channel_title,
    })
}

// helper: turn String → Option<String> when non-empty
trait IntoOpt {
    fn into_opt(self) -> Option<String>;
}
impl IntoOpt for String {
    fn into_opt(self) -> Option<String> {
        if self.is_empty() {
            None
        } else {
            Some(self)
        }
    }
}

// ─── persist_items: 返新增条目 (供 summary 用) ─────────────────────────────

/// H4 修复: 接受事务句柄, 让 items insert + baseline + notification 在同一事务.
/// 旧实现吞掉 item insert 错误 (rss.rs:585), 单个 item 失败导致后续 baseline/notification
/// 仍执行但 item 缺失 — 下次抓取因 dedupe_key 命中不再产生新通知, 永久漏.
///
/// 新实现: 任一 INSERT 失败 → Err 传出 → caller 整个事务回滚, 下次 tick 重新抓
/// 重新处理 (item 会再被发现, 不会因 dedupe 漏).
pub async fn persist_items_in_tx<'c>(
    tx: &mut sqlx::Transaction<'c, sqlx::Postgres>,
    feed_id: &str,
    items: &[ParsedItem],
) -> anyhow::Result<Vec<PersistedItem>> {
    let mut inserted: Vec<PersistedItem> = Vec::new();
    for it in items {
        let pub_str = it.published_at.as_ref().map(|d| d.to_rfc3339());
        let res: Result<Option<(String, DateTime<Utc>)>, sqlx::Error> = sqlx::query_as(
            "INSERT INTO feed_items (feed_id, title, link, summary, author, published_at, guid, dedupe_key)
             VALUES ($1::uuid, $2, $3, $4, $5, $6::timestamptz, $7, $8)
             ON CONFLICT (feed_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
             RETURNING id::text, COALESCE(published_at, created_at)",
        )
        .bind(feed_id)
        .bind(&it.title)
        .bind(&it.link)
        .bind(&it.summary)
        .bind(&it.author)
        .bind(pub_str)
        .bind(&it.guid)
        .bind(&it.dedupe_key)
        .fetch_optional(&mut **tx)
        .await;
        match res {
            Ok(Some((id, ts))) => {
                inserted.push(PersistedItem {
                    id,
                    feed_id: feed_id.to_string(),
                    title: it.title.clone(),
                    link: it.link.clone(),
                    summary: it.summary.clone(),
                    published_at: ts,
                });
            }
            Ok(None) => { /* ON CONFLICT 命中 (重复 guid), 跳过 */ }
            Err(e) => {
                // H4: 不再吞 — Err 传出, caller 整笔事务回滚.
                return Err(anyhow::anyhow!(
                    "feed_item insert failed (feed_id={}, title={:?}): {e}",
                    feed_id,
                    it.title
                ));
            }
        }
    }
    Ok(inserted)
}

/// 旧 wrapper — 保留给 tests/外部直接调, 内部开新事务.
pub async fn persist_items(
    db: &PgPool,
    feed_id: &str,
    items: &[ParsedItem],
) -> anyhow::Result<Vec<PersistedItem>> {
    let mut tx = db.begin().await?;
    let result = persist_items_in_tx(&mut tx, feed_id, items).await?;
    tx.commit().await?;
    Ok(result)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PersistedItem {
    pub id: String,
    pub feed_id: String,
    pub title: String,
    pub link: Option<String>,
    pub summary: Option<String>,
    pub published_at: DateTime<Utc>,
}

// ─── 统一处理函数: cron 和 manual refresh 都走这条 ────────────────────────

pub struct ProcessOutcome {
    pub fetched: usize,
    pub inserted: Vec<PersistedItem>,
}

/// 拉一次 + 持久化 + (有新增则) 发合并通知 + 发事件.
/// 失败: 记录后跳过, 不影响其他 feed.
///
/// H4 修复: items insert + baseline update + notification create 在同一事务内.
/// 旧实现三处分别吞错 (rss.rs:585 吞 item insert, 666 吞 baseline, 702 吞 notif),
/// 导致 item 已写 + baseline 已立 + notif 失败 → 下次抓取因 dedupe 命中不再产生
/// 新通知, 永久漏.
pub async fn process_one(
    state: &AppState,
    feed_id: &str,
    user_id: &str,
    url: &str,
) -> anyhow::Result<ProcessOutcome> {
    let FetchResult {
        items,
        channel_title,
    } = fetch_feed(url).await?;

    process_fetched_items(state, feed_id, user_id, url, &items, channel_title).await
}

/// H6 (本轮): 抽出 `process_fetched_items` 作为共享核心 — 之前的 `process_one_with_items`
/// 跟 `process_one` 事务逻辑几乎一致 (item INSERT + baseline UPDATE + notification +
/// commit), 只是少了 fetch + SSRF guard. 两份实现很容易在以后的迭代里漂移 (一处加新
/// 逻辑, 另一处忘改), 这次把核心抽出来, 生产入口 (`process_one`) 和测试都走同一条路径.
/// SSRF guard / fetch 在 `process_one` 之前已覆盖, 这里不再重复.
pub async fn process_fetched_items(
    state: &AppState,
    feed_id: &str,
    user_id: &str,
    url: &str,
    items: &[ParsedItem],
    channel_title: Option<String>,
) -> anyhow::Result<ProcessOutcome> {
    // 起事务 — 整个 process_fetched_items 在一个 tx 里
    let mut tx = state.db.begin().await?;

    // 1) 写 items (任一失败 → Err 传出, 整笔回滚)
    let inserted = persist_items_in_tx(&mut tx, feed_id, items).await?;

    // 2) Backfill feed.title (one HTTP fetch — no extra round trip). 同事务.
    if let Some(title) = &channel_title {
        sqlx::query(
            "UPDATE feeds SET title = COALESCE(title, $1) WHERE id = $2::uuid AND title IS NULL",
        )
        .bind(title)
        .bind(feed_id)
        .execute(&mut *tx)
        .await?;
    }

    // F1 修复: RSS 首次抓取 baseline.
    // feeds.last_checked_at IS NULL = 首次抓取 → 不发通知不发事件, 然后把 baseline
    // 立起来. 下次 tick 正常通知.
    let is_first_fetch: bool =
        sqlx::query_scalar("SELECT last_checked_at IS NULL FROM feeds WHERE id = $1::uuid")
            .bind(feed_id)
            .fetch_optional(&mut *tx)
            .await
            .unwrap_or(Some(true)) // feed 没了 — 仍按首次处理, 不通知
            .unwrap_or(true);

    // 3) baseline 更新 (同事务)
    sqlx::query(
        "UPDATE feeds
         SET last_checked_at = NOW(),
             last_checked_items_count = $2
         WHERE id = $1::uuid",
    )
    .bind(feed_id)
    .bind(items.len() as i32)
    .execute(&mut *tx)
    .await?;

    if is_first_fetch {
        tracing::info!(
            feed_id = %feed_id,
            user_id = %user_id,
            fetched = items.len(),
            inserted = inserted.len(),
            "RSS first fetch: baseline established, no notification"
        );
        tx.commit().await?;
        return Ok(ProcessOutcome {
            fetched: items.len(),
            inserted,
        });
    }

    // 4) 写 notification + outbox (同事务). 已新增条目才发通知, 没新增就跳过.
    if !inserted.is_empty() {
        let feed_title: Option<String> =
            sqlx::query_scalar("SELECT title FROM feeds WHERE id = $1::uuid")
                .bind(feed_id)
                .fetch_optional(&mut *tx)
                .await?;
        let display_name = feed_title.unwrap_or_else(|| url.to_string());
        let title = format!("{} 有 {} 条新内容", display_name, inserted.len());
        let body = build_summary_body(&display_name, &inserted);

        notifications::create_and_publish_in_tx(&mut tx, user_id, &title, Some(&body), "info")
            .await?;
    }

    // 5) 提交
    tx.commit().await?;

    // 6) 事务外发 SSE event (in-process broadcast, 失败不致命)
    if !inserted.is_empty() {
        state.event_bus.publish(events::AppEvent::RssNewItems {
            feed_id: feed_id.to_string(),
            user_id: user_id.to_string(),
            count: inserted.len(),
            top_titles: inserted.iter().take(3).map(|i| i.title.clone()).collect(),
        });
    }

    Ok(ProcessOutcome {
        fetched: items.len(),
        inserted,
    })
}

fn build_summary_body(feed_name: &str, items: &[PersistedItem]) -> String {
    let mut s = format!("信息源: {}\n\n新增内容:\n", feed_name);
    for (i, it) in items.iter().take(3).enumerate() {
        s.push_str(&format!(
            "{}. {}{}\n",
            i + 1,
            it.title,
            it.link
                .as_ref()
                .map(|l| format!("\n   {}", l))
                .unwrap_or_default()
        ));
    }
    if items.len() > 3 {
        s.push_str(&format!("\n... 另 {} 条", items.len() - 3));
    }
    s
}

/// POST /api/feeds/:id/refresh
pub async fn refresh_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let row: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT url, title FROM feeds WHERE id = $1::uuid AND user_id = $2::uuid")
            .bind(&id)
            .bind(&user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|_e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "feed lookup failed"})),
                )
            })?;
    let (url, _existing_title) = row.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "feed not found"})),
        )
    })?;

    match process_one(&state, &id, &user_id, &url).await {
        Ok(outcome) => Ok(Json(json!({
            "fetched": outcome.fetched,
            "inserted": outcome.inserted.len(),
            "items": outcome.inserted,
        }))),
        Err(e) => Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": format!("fetch failed: {e}")})),
        )),
    }
}

// ─── Cron ──────────────────────────────────────────────────────────────────

#[allow(dead_code)] // 保留: 单 db 版本 (start_cron_state 是 active 版本, 给未来降级用)
pub fn start_cron(db: PgPool, tracker: CronTracker) {
    // spec §6.1: 默认 15min
    let interval_secs: u64 = std::env::var("RSS_CRON_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(15 * 60);

    tokio::spawn(async move {
        tracing::info!(interval_secs, "rss cron started");
        let mut tick = tokio::time::interval(Duration::from_secs(interval_secs));
        tick.tick().await; // consume immediate
        loop {
            tick.tick().await;
            tracker.record_tick(CRON_NAME);
            match run_once(&db).await {
                Ok(()) => tracker.record_ok(CRON_NAME),
                Err(e) => {
                    let msg = format!("{e:#}");
                    tracing::error!(error = %msg, "rss cron tick failed");
                    tracker.record_error(CRON_NAME, &msg);
                }
            }
        }
    });
}

/// 跑一轮: 拉所有 enabled feeds, 顺序处理 (P2#1 才上并发).
#[allow(dead_code)] // 保留: 单 db 入口, 给单元测试 + 未来 P2#1 调用
pub async fn run_once(db: &PgPool) -> anyhow::Result<()> {
    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id::text, user_id::text, url FROM feeds WHERE enabled = TRUE")
            .fetch_all(db)
            .await?;

    if rows.is_empty() {
        tracing::debug!("rss cron: no enabled feeds");
        return Ok(());
    }

    // 这里我们没拿到 AppState (cron 是 spawn 出来的, 只拿了 db clone).
    // 拿 AppState 才能 publish event + create notification.
    // 解法: 把 state 一起 clone 进 cron. 见 start_cron_state 版本.
    tracing::warn!("rss run_once called without AppState; use start_cron_state for full pipeline");
    Ok(())
}

/// 完整版 cron (带 AppState, 真正接通知/SSE 链路).
pub fn start_cron_state(state: AppState, tracker: CronTracker) {
    let interval_secs: u64 = std::env::var("RSS_CRON_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(15 * 60);

    tokio::spawn(async move {
        tracing::info!(interval_secs, "rss cron (full) started");
        let mut tick = tokio::time::interval(Duration::from_secs(interval_secs));
        tick.tick().await;
        loop {
            tick.tick().await;
            tracker.record_tick(CRON_NAME);
            match run_once_full(&state).await {
                Ok(()) => tracker.record_ok(CRON_NAME),
                Err(e) => {
                    let msg = format!("{e:#}");
                    tracing::error!(error = %msg, "rss cron (full) tick failed");
                    tracker.record_error(CRON_NAME, &msg);
                }
            }
        }
    });
}

async fn run_once_full(state: &AppState) -> anyhow::Result<()> {
    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id::text, user_id::text, url FROM feeds WHERE enabled = TRUE")
            .fetch_all(&state.db)
            .await?;

    if rows.is_empty() {
        tracing::debug!(instance_id = %state.instance_id, "rss cron: no enabled feeds");
        return Ok(());
    }
    tracing::info!(
        instance_id = %state.instance_id,
        count = rows.len(),
        "rss cron: processing feeds"
    );

    // P2#1: 有界并发 — Semaphore + buffer_unordered, 默认 8 并发.
    // env RSS_CRON_CONCURRENCY 可调, 50+ feed 也能在 15min 内全部完成.
    let concurrency: usize = std::env::var("RSS_CRON_CONCURRENCY")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8)
        .max(1);
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(concurrency));

    let futures = rows.into_iter().map(|(feed_id, user_id, url)| {
        let state = state.clone();
        let sem = sem.clone();
        async move {
            let _permit = match sem.acquire_owned().await {
                Ok(p) => p,
                Err(_) => return (feed_id, Err(anyhow::anyhow!("semaphore closed"))),
            };
            let r = process_one(&state, &feed_id, &user_id, &url).await;
            (feed_id, r)
        }
    });

    let mut stream = futures::stream::iter(futures).buffer_unordered(concurrency);

    let mut total_inserted = 0usize;
    let mut failed = 0usize;
    while let Some((feed_id, r)) = stream.next().await {
        match r {
            Ok(outcome) => {
                total_inserted += outcome.inserted.len();
                tracing::debug!(
                    feed_id = %feed_id,
                    fetched = outcome.fetched,
                    inserted = outcome.inserted.len(),
                    "feed processed"
                );
            }
            Err(e) => {
                failed += 1;
                tracing::warn!(feed_id = %feed_id, error = %e, "feed fetch failed");
            }
        }
    }
    tracing::info!(total_inserted, failed, "rss cron: tick summary");
    Ok(())
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedupe_key_prefers_link() {
        let k = compute_dedupe_key(Some("https://x/y"), Some("g-1"), "T", None);
        assert_eq!(k, "link:https://x/y");
    }

    #[test]
    fn dedupe_key_uses_guid_when_no_link() {
        let k = compute_dedupe_key(None, Some("g-1"), "T", None);
        assert_eq!(k, "guid:g-1");
    }

    #[test]
    fn dedupe_key_uses_hash_when_neither() {
        let k = compute_dedupe_key(None, None, "Title", None);
        assert!(k.starts_with("hash:"));
        assert_eq!(k.len(), 5 + 64); // "hash:" + 64 hex chars
    }

    #[test]
    fn dedupe_key_stable_across_calls() {
        let k1 = compute_dedupe_key(None, None, "Title", None);
        let k2 = compute_dedupe_key(None, None, "Title", None);
        assert_eq!(k1, k2);
    }

    #[test]
    fn dedupe_key_changes_with_pub_date() {
        let ts1 = DateTime::parse_from_rfc3339("2026-06-18T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let ts2 = DateTime::parse_from_rfc3339("2026-06-18T11:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let k1 = compute_dedupe_key(None, None, "Title", Some(ts1));
        let k2 = compute_dedupe_key(None, None, "Title", Some(ts2));
        assert_ne!(k1, k2);
    }

    #[test]
    fn empty_link_falls_through_to_guid() {
        let k = compute_dedupe_key(Some(""), Some("g-1"), "T", None);
        assert_eq!(k, "guid:g-1");
    }

    #[test]
    fn build_summary_body_lists_top_3() {
        let items = vec![
            PersistedItem {
                id: "1".into(),
                feed_id: "f".into(),
                title: "First".into(),
                link: Some("https://x/1".into()),
                summary: None,
                published_at: Utc::now(),
            },
            PersistedItem {
                id: "2".into(),
                feed_id: "f".into(),
                title: "Second".into(),
                link: Some("https://x/2".into()),
                summary: None,
                published_at: Utc::now(),
            },
            PersistedItem {
                id: "3".into(),
                feed_id: "f".into(),
                title: "Third".into(),
                link: Some("https://x/3".into()),
                summary: None,
                published_at: Utc::now(),
            },
            PersistedItem {
                id: "4".into(),
                feed_id: "f".into(),
                title: "Fourth".into(),
                link: None,
                summary: None,
                published_at: Utc::now(),
            },
        ];
        let body = build_summary_body("MyFeed", &items);
        assert!(body.contains("First"));
        assert!(body.contains("Second"));
        assert!(body.contains("Third"));
        assert!(body.contains("另 1 条"));
    }
}
