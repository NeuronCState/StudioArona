use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::time::Duration;

use crate::{auth::extract_user_id, AppState};

// ─── Feed CRUD (S1a contract) ──────────────────────────────────────────────
//
// list_feeds / list_feed_items live in the next section; this block owns
// write-side CRUD on the `feeds` table. All write paths enforce per-user
// ownership: 404 if the feed is missing OR owned by someone else.

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

/// POST /api/feeds — create a feed owned by the caller.
pub async fn create_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<FeedInput>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    if input.url.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "url is required"})),
        ));
    }

    let row: (String, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
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
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": msg})))
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

/// PATCH /api/feeds/:id — update a feed the caller owns.
pub async fn update_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<FeedInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

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
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "feed not found or not owned"})),
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

/// DELETE /api/feeds/:id — remove a feed the caller owns.
pub async fn delete_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let affected = sqlx::query("DELETE FROM feeds WHERE id = $1::uuid AND user_id = $2::uuid")
        .bind(&id)
        .bind(&user_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "feed not found or not owned"})),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ─── Read endpoints ────────────────────────────────────────────────────────

/// GET /api/feeds — list feeds visible to the caller.
///
/// Reads from the `feeds` table. We don't filter by `user_id` here because the
/// S1a contract returns the union view across all rows so the HomePage tile
/// can show the full RSS mosaic. Per-user ownership is enforced on write paths
/// and on `list_feed_items`.
pub async fn list_feeds(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _user_id = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, String, bool, chrono::DateTime<chrono::Utc>)>(
        "SELECT id::text, url, title, source, priority, enabled, created_at FROM feeds ORDER BY created_at DESC LIMIT 100"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let items: Vec<_> = rows.into_iter().map(|r| json!({
        "id": r.0,
        "url": r.1,
        "title": r.2,
        "source": r.3,
        "priority": r.4,
        "enabled": r.5,
        "created_at": r.6,
    })).collect();

    Ok(Json(json!(items)))
}

/// GET /api/feeds/:id/items — list parsed feed items for a single feed.
///
/// Enforces ownership: 404 if the feed doesn't exist OR isn't owned by the
/// caller. Returns items newest-first (LIMIT 200 to keep payloads sane).
///
/// This is the S1a contract name (`list_feed_items`); the implementation is
/// the same as the S1c-suggested `get_feed_items`. Keeping one name keeps
/// main.rs simple.
pub async fn list_feed_items(
    State(state): State<AppState>,
    Path(feed_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) = extract_user_id(&headers, &state.config.jwt_secret)
        .map_err(|(s, v)| (s, Json(v)))?;

    if uuid::Uuid::parse_str(&feed_id).is_err() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "feed not found"})),
        ));
    }

    // Ownership check
    let owned: Option<(String,)> = sqlx::query_as(
        "SELECT id::text FROM feeds WHERE id = $1::uuid AND user_id = $2::uuid",
    )
    .bind(&feed_id)
    .bind(&user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if owned.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "feed not found"})),
        ));
    }

    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, Option<chrono::DateTime<chrono::Utc>>, bool, chrono::DateTime<chrono::Utc>)>(
        "SELECT id::text, feed_id::text, title, link, summary, author, published_at, starred, created_at
         FROM feed_items WHERE feed_id = $1::uuid
         ORDER BY COALESCE(published_at, created_at) DESC LIMIT 200",
    )
    .bind(&feed_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let items: Vec<_> = rows.into_iter().map(|r| json!({
        "id": r.0,
        "feed_id": r.1,
        "title": r.2,
        "link": r.3,
        "summary": r.4,
        "author": r.5,
        "published_at": r.6,
        "read_at": Value::Null,   // column exists in schema but we don't read it here
        "starred": r.7,
        "created_at": r.8,
    })).collect();

    Ok(Json(json!(items)))
}

// ─── RSS fetch + parse ─────────────────────────────────────────────────────

/// Parsed item shape returned from `fetch_feed`. Mirrors the schema columns in
/// `feed_items` (snake_case). Caller decides what to persist.
#[derive(Debug, Clone)]
pub struct ParsedItem {
    pub title: String,
    pub link: Option<String>,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Fetch a single RSS URL and parse it into normalized items.
///
/// Network + parse failures return `Err` with a printable message; callers
/// (the cron loop) log and skip rather than panic.
pub async fn fetch_feed(url: &str) -> anyhow::Result<Vec<ParsedItem>> {
    let body = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("Studio-Arona/3.0 RSS Bot")
        .build()?
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    let channel = rss::Channel::read_from(&body[..])?;
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
            .map(|dt| dt.with_timezone(&chrono::Utc));

        out.push(ParsedItem {
            title,
            link,
            summary,
            author,
            published_at,
        });
    }
    Ok(out)
}

/// Insert a parsed batch into `feed_items`, dedup'd by (feed_id, link).
///
/// The schema has no UNIQUE on (feed_id, link), so we check first then insert.
/// Failures of individual rows are logged but don't abort the batch.
pub async fn persist_items(
    db: &PgPool,
    feed_id: &str,
    items: &[ParsedItem],
) -> anyhow::Result<usize> {
    let mut inserted = 0usize;
    for it in items {
        if let Some(link) = &it.link {
            let exists: Option<(String,)> = sqlx::query_as(
                "SELECT id::text FROM feed_items WHERE feed_id = $1::uuid AND link = $2 LIMIT 1",
            )
            .bind(feed_id)
            .bind(link)
            .fetch_optional(db)
            .await?;
            if exists.is_some() {
                continue;
            }
        }

        let pub_str = it.published_at.as_ref().map(|d| d.to_rfc3339());
        let res = sqlx::query(
            "INSERT INTO feed_items (feed_id, title, link, summary, author, published_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6::timestamptz)",
        )
        .bind(feed_id)
        .bind(&it.title)
        .bind(&it.link)
        .bind(&it.summary)
        .bind(&it.author)
        .bind(pub_str)
        .execute(db)
        .await;

        match res {
            Ok(_) => inserted += 1,
            Err(e) => {
                tracing::warn!(
                    feed_id = %feed_id,
                    title = %it.title,
                    error = %e,
                    "rss insert failed (skipping item)"
                );
            }
        }
    }
    Ok(inserted)
}

// ─── Cron ──────────────────────────────────────────────────────────────────

/// Background RSS fetch loop. Spawned once from `main`.
///
/// Runs every 5 minutes; on each tick it grabs all enabled feeds, fetches each
/// URL, persists new items, and updates `feeds.title` from the channel if the
/// feed row didn't have one yet. The loop is resilient to DB errors: any
/// single failure logs and continues.
///
/// Interval can be overridden with `RSS_CRON_INTERVAL_SECS` (useful for
/// smoke-testing the cron path during development). Default = 300s (5min).
///
/// Stops when the process exits (the tokio runtime goes away with axum).
pub fn start_cron(db: PgPool) {
    let interval_secs: u64 = std::env::var("RSS_CRON_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5 * 60);

    tokio::spawn(async move {
        tracing::info!(interval_secs, "rss cron started");
        let mut tick = tokio::time::interval(Duration::from_secs(interval_secs));
        // First tick fires immediately; we don't want to fetch twice at startup,
        // so consume the immediate tick first.
        tick.tick().await;

        loop {
            tick.tick().await;
            if let Err(e) = run_once(&db).await {
                tracing::error!(error = %e, "rss cron tick failed");
            }
        }
    });
}

async fn run_once(db: &PgPool) -> anyhow::Result<()> {
    let rows = sqlx::query_as::<_, (String, String, Option<String>)>(
        "SELECT id::text, url, title FROM feeds WHERE enabled = TRUE",
    )
    .fetch_all(db)
    .await?;

    if rows.is_empty() {
        tracing::debug!("rss cron: no enabled feeds");
        return Ok(());
    }

    tracing::info!(count = rows.len(), "rss cron: fetching feeds");

    for (feed_id, url, existing_title) in rows {
        match fetch_feed(&url).await {
            Ok(items) => {
                let inserted = match persist_items(db, &feed_id, &items).await {
                    Ok(n) => n,
                    Err(e) => {
                        tracing::warn!(feed_id = %feed_id, error = %e, "rss persist failed");
                        0
                    }
                };

                // Backfill feed.title from the channel if the row didn't have
                // one and the feed actually returned content. We re-fetch the
                // body once more here because we already consumed the bytes in
                // fetch_feed; cheaper to parse the cached channel title out of
                // the first item's link domain, but for now a second hit on the
                // RSS endpoint is acceptable (cron only fires every 5min).
                if existing_title.is_none() {
                    let client = match reqwest::Client::builder()
                        .timeout(Duration::from_secs(15))
                        .build()
                    {
                        Ok(c) => c,
                        Err(e) => {
                            tracing::warn!(feed_id = %feed_id, error = %e, "backfill client build failed");
                            continue;
                        }
                    };
                    match client.get(&url).send().await {
                        Ok(r) => match r.bytes().await {
                            Ok(body) => {
                                if let Ok(channel) = rss::Channel::read_from(&body[..]) {
                                    let title = channel.title.trim();
                                    if !title.is_empty() {
                                        let _ = sqlx::query(
                                            "UPDATE feeds SET title = $1 WHERE id = $2::uuid",
                                        )
                                        .bind(title)
                                        .bind(&feed_id)
                                        .execute(db)
                                        .await;
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::debug!(feed_id = %feed_id, error = %e, "backfill body read failed");
                            }
                        },
                        Err(e) => {
                            tracing::debug!(feed_id = %feed_id, error = %e, "backfill request failed");
                        }
                    }
                }

                tracing::info!(
                    feed_id = %feed_id,
                    url = %url,
                    items = items.len(),
                    inserted,
                    "rss feed fetched"
                );
            }
            Err(e) => {
                tracing::warn!(feed_id = %feed_id, url = %url, error = %e, "rss fetch failed");
            }
        }
    }
    Ok(())
}
