//! Page monitor cron + manual check — 共用 check_one 核心.
//!
//! - check_one: 单 monitor 一次检查 (fetch + canonicalize + 写库 + publish)
//! - run_once:  cron loop 调, 拉所有到期的 monitor 跑 check_one
//! - manual_check: POST /api/page-monitors/:id/check, 立即单次检查

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::{json, Value};
use std::time::Duration;

use crate::{
    auth::extract_user_id, cron_tracker::CronTracker, events, notifications, safe_fetch, AppState,
};
use futures::StreamExt;

use super::canonicalize::{canonicalize, Canonical};

pub const CRON_NAME: &str = "page_monitor";

/// P2#1: 单条 monitor 在 cron 拉取中的列: (id, user_id, url, last_hash, check_interval_min, label, css_selector).
type MonitorRow = (String, String, String, Option<String>, i32, String, String);

/// Per-monitor check result, 暴露给 handler 用 (manual_check 透传给前端).
#[derive(Debug, serde::Serialize)]
pub struct CheckOutcome {
    pub changed: bool,
    pub first_seen: bool,
    pub summary: Option<String>,
    pub hash: String,
}

/// 单个 monitor 的一次检查. 共用于 cron loop + 手动触发 endpoint.
async fn check_one(
    state: &AppState,
    monitor_id: &str,
    user_id: &str,
    url: &str,
    last_hash: Option<&str>,
    label: &str,
    css_selector: &str,
) -> anyhow::Result<CheckOutcome> {
    if let Err(e) = safe_fetch::validate_public_url(url) {
        anyhow::bail!("SSRF guard rejected url: {e}");
    }
    let body = safe_fetch::fetch_with_limit(
        safe_fetch::DEFAULT_TIMEOUT,
        "Studio-Arona/3.0 Page Monitor",
        url,
        safe_fetch::PAGE_MONITOR_BODY_LIMIT,
    )
    .await?;
    let html_str = String::from_utf8_lossy(&body);
    check_one_with_html(
        state,
        monitor_id,
        user_id,
        url,
        last_hash,
        label,
        css_selector,
        &html_str,
    )
    .await
}

/// H2 测试 helper: 跳过 HTTP fetch, 直接用给定 html 跑 check_one 的核心逻辑.
/// 真实 url 仍走 SSRF 校验 (确保测试也守 SSRF 门).
/// H2 测试 helper: 跳过 HTTP fetch, 直接用给定 html 跑 check_one 的核心逻辑.
/// url 仍走 SSRF 校验 (确保测试也守 SSRF 门).
#[allow(clippy::too_many_arguments)] // 测试 helper, 8 参数便于一次传完
pub async fn check_one_with_html(
    state: &AppState,
    monitor_id: &str,
    user_id: &str,
    url: &str,
    last_hash: Option<&str>,
    label: &str,
    css_selector: &str,
    html: &str,
) -> anyhow::Result<CheckOutcome> {
    // 注: 这个 helper 给测试用, 跳过 SSRF 校验 (html 已知, URL 只用于通知 body).
    // 真实路径 (`check_one`) 仍走 validate_public_url + fetch_with_limit.
    let Canonical {
        hash,
        normalized_text,
    } = canonicalize(html, css_selector);

    let changed = last_hash.is_some_and(|old| old != hash);
    let first_seen = last_hash.is_none();

    if changed {
        // P1#4: 真变化摘要 — 拉上版 canonical text, 算 diff, 尝试 LLM, 落 fallback.
        let previous_content: Option<String> =
            sqlx::query_scalar("SELECT previous_content FROM page_monitors WHERE id = $1::uuid")
                .bind(monitor_id)
                .fetch_optional(&state.db)
                .await
                .unwrap_or(None);
        let old_text = previous_content.as_deref().unwrap_or("");
        let (diff, summary_text, mode) =
            crate::page_monitor::canonicalize::summarize_change(old_text, &normalized_text).await;
        let mode_str = match mode {
            crate::page_monitor::canonicalize::DiffMode::Llm => "llm",
            crate::page_monitor::canonicalize::DiffMode::Fallback => "fallback",
        };
        let llm_used = mode == crate::page_monitor::canonicalize::DiffMode::Llm;

        // 通知 body 用 diff.headline (always populated) + summary_text (LLM or headline).
        let body_for_notif = format!(
            "{}\n{}",
            diff.headline,
            summary_text.as_deref().unwrap_or("")
        );

        // B1 + H2 修复:
        //   - 事务内: event INSERT + notification outbox + last_hash UPDATE 原子.
        //   - event 表不再有 (monitor_id, content_hash) UNIQUE. 每次真实状态转换
        //     (last_hash → new_hash) 都插一行, 形成 transition log.
        //   - 关键: 每次都推进 last_hash + last_checked_at — 即使 hash 之前见过
        //     (A→B→A→B 的第二次 B), 仍推进 last_hash = B, 下次 tick
        //     last_hash == current → !changed (不再重复通知).
        //   - 旧实现: ON CONFLICT 命中时不更新 last_hash, 导致每次 tick 都判定
        //     changed, 永远重复通知.
        let mut tx = state.db.begin().await?;

        let (event_id,): (String,) = sqlx::query_as(
            "INSERT INTO page_monitor_events
                (monitor_id, title, link, summary, content_hash, summary_mode, diff_summary, llm_used)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id::text",
        )
        .bind(monitor_id)
        .bind(format!("{label} 页面发生变化"))
        .bind(url)
        .bind(&body_for_notif)
        .bind(&hash)
        .bind(mode_str)
        .bind(&diff.headline)
        .bind(llm_used)
        .fetch_one(&mut *tx)
        .await?;

        // 写 notification + outbox 同事务.
        let notif_id = notifications::create_and_publish_in_tx(
            &mut tx,
            user_id,
            &format!("{label} 有新变化"),
            Some(&body_for_notif),
            "info",
        )
        .await?;

        // 推进 checkpoint (last_hash + last_checked_at). 事务成功 → 推进; 失败 → 回滚.
        sqlx::query(
            "UPDATE page_monitors
             SET last_hash = $1,
                 previous_content = $2,
                 last_checked_at = NOW(),
                 last_changed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3::uuid",
        )
        .bind(&hash)
        .bind(&normalized_text)
        .bind(monitor_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        // 事务 commit 成功后才发 SSE event (in-process broadcast, 失败不致命).
        state
            .event_bus
            .publish(events::AppEvent::PageMonitorChange {
                event_id: event_id.clone(),
                monitor_id: monitor_id.to_string(),
                user_id: user_id.to_string(),
                label: label.to_string(),
                url: url.to_string(),
                summary: Some(body_for_notif.clone()),
            });
        let _ = notif_id;

        Ok(CheckOutcome {
            changed: true,
            first_seen,
            summary: Some(body_for_notif),
            hash,
        })
    } else {
        // 内容未变 — 仅推进 last_checked_at, 不动 last_hash / previous_content.
        // 用单条 UPDATE 而不是事务, 不需要原子性 (没有多步写入).
        sqlx::query(
            "UPDATE page_monitors
             SET last_hash = $1,
                 previous_content = COALESCE($2, previous_content),
                 last_checked_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3::uuid",
        )
        .bind(&hash)
        .bind(&normalized_text)
        .bind(monitor_id)
        .execute(&state.db)
        .await?;

        Ok(CheckOutcome {
            changed: false,
            first_seen,
            summary: None,
            hash,
        })
    }
}

pub fn start_cron(state: AppState, tracker: CronTracker) {
    let interval_secs: u64 = std::env::var("PAGE_MONITOR_CRON_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(15 * 60);

    tokio::spawn(async move {
        tracing::info!(interval_secs, "page monitor cron started");
        let mut tick = tokio::time::interval(Duration::from_secs(interval_secs));
        tick.tick().await;
        loop {
            tick.tick().await;
            tracker.record_tick(CRON_NAME);
            match run_once(&state).await {
                Ok(()) => tracker.record_ok(CRON_NAME),
                Err(e) => {
                    let msg = format!("{e:#}");
                    tracing::error!(error = %msg, "page monitor cron tick failed");
                    tracker.record_error(CRON_NAME, &msg);
                }
            }
        }
    });
}

/// P2#1: 单批拉取上限 — 一次 claim batch_size 个 monitor 跑并发.
/// env PAGE_MONITOR_CRON_BATCH_SIZE 可调 (默认 50, 与历史 hard cap 一致).
/// 单 tick 内分页循环, 拉到空就退出 — 避免 1000+ monitor 一次 tick 拖太久.
const DEFAULT_BATCH_SIZE: i64 = 50;
/// P2#1: claim 窗口 — 拉到 monitor 后, 10 min 内不会被其他 instance 重复领取.
/// 进程崩溃时 lease 自动过期, 下个 tick 会被重领.
const CLAIM_WINDOW_MIN: i64 = 10;

async fn run_once(state: &AppState) -> anyhow::Result<()> {
    let db = &state.db;
    let concurrency: usize = std::env::var("PAGE_MONITOR_CRON_CONCURRENCY")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8)
        .max(1);
    let batch_size: i64 = std::env::var("PAGE_MONITOR_CRON_BATCH_SIZE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_BATCH_SIZE)
        .clamp(1, 1000);

    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(concurrency));

    let mut total_changed = 0usize;
    let mut total_failed = 0usize;
    let mut total_processed = 0usize;
    let mut batch_no = 0usize;
    // P2#1: 分页循环 — 一次 tick 处理多批, 拉到空就退出.
    // - 避免 1000+ monitor 单 tick 拖太久
    // - 每批内部 8 并发 (PAGE_MONITOR_CRON_CONCURRENCY)
    // - 单批用 SKIP LOCKED 领取, claim_until = NOW() + 10min
    // - 处理完释放 claim (claimed_until = NULL), 让下个 tick 立即可领
    loop {
        batch_no += 1;
        // P2#1: 在事务内 SELECT … FOR UPDATE SKIP LOCKED + UPDATE claimed_until,
        // 锁在该事务提交时释放, claim_until 仍生效, 防止并发重复领取.
        let mut tx = db.begin().await?;
        let rows: Vec<MonitorRow> = sqlx::query_as(
            "SELECT id::text, user_id::text, url, last_hash, check_interval_min, label, css_selector
             FROM page_monitors
             WHERE enabled = TRUE
               AND (last_checked_at IS NULL
                    OR last_checked_at <= NOW() - (check_interval_min || ' minutes')::interval)
               AND (claimed_until IS NULL OR claimed_until <= NOW())
             ORDER BY COALESCE(last_checked_at, 'epoch'::timestamptz) ASC
             LIMIT $1
             FOR UPDATE SKIP LOCKED",
        )
        .bind(batch_size)
        .fetch_all(&mut *tx)
        .await?;
        if rows.is_empty() {
            tx.commit().await?;
            break;
        }
        let ids: Vec<String> = rows.iter().map(|(id, ..)| id.clone()).collect();
        sqlx::query(
            "UPDATE page_monitors
             SET claimed_until = NOW() + ($1 || ' minutes')::interval,
                 claimed_by = $2
             WHERE id = ANY($3::uuid[])",
        )
        .bind(CLAIM_WINDOW_MIN)
        .bind(&state.instance_id)
        .bind(&ids)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        tracing::info!(
            instance_id = %state.instance_id,
            batch = batch_no,
            claimed = rows.len(),
            "page monitor cron: batch claimed"
        );

        // 并发处理本批
        let futures = rows.into_iter().map(
            |(monitor_id, user_id, url, last_hash, _interval, label, css_selector)| {
                let state = state.clone();
                let sem = sem.clone();
                let last_hash = last_hash.clone();
                async move {
                    let _permit = match sem.acquire_owned().await {
                        Ok(p) => p,
                        Err(_) => return (monitor_id, Err(anyhow::anyhow!("semaphore closed"))),
                    };
                    let r = check_one(
                        &state,
                        &monitor_id,
                        &user_id,
                        &url,
                        last_hash.as_deref(),
                        &label,
                        &css_selector,
                    )
                    .await;
                    // F2 修复: 失败退避 — 失败时把 claimed_until 推到 5min 后, 本 tick 余下
                    // 批次不再 claim 这条 (WHERE claimed_until <= NOW() 过滤掉), 避免对同一个
                    // 出问题的目标站点连续请求 / 阻塞其他 monitor.
                    // 成功 → 立即释放, 下次 tick 正常 claim.
                    let release_result = match &r {
                        Ok(_) => sqlx::query(
                            "UPDATE page_monitors SET claimed_until = NULL WHERE id = $1::uuid",
                        )
                        .bind(&monitor_id)
                        .execute(&state.db)
                        .await,
                        Err(_) => sqlx::query(
                            "UPDATE page_monitors
                             SET claimed_until = NOW() + INTERVAL '5 minutes',
                                 last_error = $2
                             WHERE id = $1::uuid",
                        )
                        .bind(&monitor_id)
                        .bind(format!("{:?}", r.as_ref().err()))
                        .execute(&state.db)
                        .await,
                    };
                    if let Err(e) = release_result {
                        tracing::warn!(monitor_id = %monitor_id, error = %e, "claim release failed");
                    }
                    (monitor_id, r)
                }
            },
        );

        let mut stream = futures::stream::iter(futures).buffer_unordered(concurrency);

        let mut batch_changed = 0usize;
        let mut batch_failed = 0usize;
        while let Some((monitor_id, r)) = stream.next().await {
            total_processed += 1;
            match r {
                Ok(outcome) => {
                    tracing::info!(
                        monitor_id = %monitor_id,
                        changed = outcome.changed,
                        first_seen = outcome.first_seen,
                        "page monitor checked"
                    );
                    if outcome.changed {
                        batch_changed += 1;
                    }
                }
                Err(e) => {
                    batch_failed += 1;
                    tracing::warn!(monitor_id = %monitor_id, error = %e, "page monitor check failed");
                }
            }
        }
        total_changed += batch_changed;
        total_failed += batch_failed;

        // 安全护栏: 一次 tick 处理太多 (拉满 + 又拉满) 说明 cron 间隔太短或单 monitor 太慢,
        // 强制 break 让下个 tick 接力, 避免一个 tick 跑 1 小时.
        if batch_no >= 20 {
            tracing::warn!(
                instance_id = %state.instance_id,
                batch_no,
                "page monitor cron: hit batch cap (20), defer rest to next tick"
            );
            break;
        }
    }

    if total_processed == 0 {
        tracing::debug!(instance_id = %state.instance_id, "page monitor cron: no due monitors");
    } else {
        tracing::info!(
            instance_id = %state.instance_id,
            batches = batch_no.saturating_sub(1),
            changed = total_changed,
            failed = total_failed,
            processed = total_processed,
            "page monitor cron: tick summary"
        );
    }
    Ok(())
}

/// POST /api/page-monitors/:id/check — 立即检查一次 (不等 cron).
pub async fn manual_check(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    if uuid::Uuid::parse_str(&id).is_err() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "page monitor not found"})),
        ));
    }

    type ManualCheckRow = (String, String, String, Option<String>, String, String, bool);
    let row: Option<ManualCheckRow> = sqlx::query_as::<_, ManualCheckRow>(
        "SELECT id::text, user_id::text, url, last_hash, label, css_selector, enabled
             FROM page_monitors WHERE id = $1::uuid AND user_id = $2::uuid",
    )
    .bind(&id)
    .bind(&user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    let (_id, _uid, url, last_hash, label, css_selector, _enabled) = row.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "page monitor not found"})),
        )
    })?;

    match check_one(
        &state,
        &id,
        &user_id,
        &url,
        last_hash.as_deref(),
        &label,
        &css_selector,
    )
    .await
    {
        Ok(outcome) => Ok(Json(json!({
            "changed": outcome.changed,
            "first_seen": outcome.first_seen,
            "summary": outcome.summary,
            "hash": outcome.hash,
        }))),
        Err(e) => {
            let msg = format!("{e:#}");
            tracing::warn!(monitor_id = %id, error = %msg, "manual check failed");
            Err((StatusCode::BAD_GATEWAY, Json(json!({"error": msg}))))
        }
    }
}
