//! 通知 HTTP handlers — list / unread-count / mark read.
//!
//! 写入路径: 各业务模块 (page_monitor, 未来 email/IM) 在变更时直接 INSERT INTO notifications
//! 然后通过 events::EventBus 推一条 AppEvent::NotificationCreated.
//!
//! Schema: notifications.read_at TIMESTAMPTZ (NULL = 未读). 用 (read_at IS NOT NULL) AS read 暴露给前端.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::{auth::extract_user_id, events, AppState};

pub async fn list_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            Option<String>,
            String,
            bool,
            chrono::DateTime<chrono::Utc>,
        ),
    >(
        "SELECT id::text, title, body, level, (read_at IS NOT NULL) AS read, created_at
         FROM notifications
         WHERE user_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 100",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.0,
                "title": r.1,
                "body": r.2,
                "level": r.3,
                "read": r.4,
                "created_at": r.5,
            })
        })
        .collect();

    Ok(Json(json!({
        "items": items,
        "unread_count": items.iter().filter(|i| !i["read"].as_bool().unwrap_or(false)).count(),
    })))
}

pub async fn unread_count(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM notifications WHERE user_id = $1::uuid AND read_at IS NULL",
    )
    .bind(&user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!({"unread_count": count})))
}

pub async fn mark_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let affected = sqlx::query(
        "UPDATE notifications SET read_at = NOW()
         WHERE id = $1::uuid AND user_id = $2::uuid AND read_at IS NULL",
    )
    .bind(&id)
    .bind(&user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "notification not found"})),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn mark_all_read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let result = sqlx::query(
        "UPDATE notifications SET read_at = NOW()
         WHERE user_id = $1::uuid AND read_at IS NULL",
    )
    .bind(&user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!({"updated": result.rows_affected()})))
}

/// 业务侧调用的写入助手. 写库 + publish 事件 (SSE 推到前端).
///
/// Email fallback (P1#6): 用户离线 (>10min last_seen) + 配置了 email + notify_by_email=true
/// → 发邮件. 1h throttle 防 spam. SMTP 未配时静默跳过.
pub async fn create_and_publish(
    state: &AppState,
    user_id: &str,
    title: &str,
    body: Option<&str>,
    level: &str,
) -> Result<String, sqlx::Error> {
    create_and_publish_with_outbox(state, user_id, title, body, level).await
}

/// 同 `create_and_publish`, 多写一 `notification_outbox` 行, 给后台 worker 重试.
pub async fn create_and_publish_with_outbox(
    state: &AppState,
    user_id: &str,
    title: &str,
    body: Option<&str>,
    level: &str,
) -> Result<String, sqlx::Error> {
    let mut tx = state.db.begin().await?;
    let id = create_and_publish_in_tx(&mut tx, user_id, title, body, level).await?;
    tx.commit().await?;

    let now = chrono::Utc::now().to_rfc3339();
    state
        .event_bus
        .publish(events::AppEvent::NotificationCreated {
            id: id.clone(),
            user_id: user_id.to_string(),
            title: title.to_string(),
            body: body.map(|s| s.to_string()),
            level: level.to_string(),
            created_at: now,
        });

    Ok(id)
}

/// B1: 事务版 create_and_publish — caller 提供 tx, 在事务里写 notification + 两行 outbox.
/// 不在事务内 publish SSE event (caller 事务 commit 后自己 publish).
///
/// 用法 (e.g. page_monitor_event + notification + checkpoint 必须同事务):
/// ```ignore
/// let mut tx = state.db.begin().await?;
/// let event_id = sqlx::query_as::<_,(String,)>("INSERT INTO page_monitor_events ...").fetch_one(&mut *tx).await?;
/// let notif_id = notifications::create_and_publish_in_tx(&mut tx, user_id, title, body, level).await?;
/// sqlx::query("UPDATE page_monitors SET last_hash = ...").execute(&mut *tx).await?;
/// tx.commit().await?;
/// // 事务外 publish SSE
/// state.event_bus.publish(...);
/// ```
pub async fn create_and_publish_in_tx<'c>(
    tx: &mut sqlx::Transaction<'c, sqlx::Postgres>,
    user_id: &str,
    title: &str,
    body: Option<&str>,
    level: &str,
) -> Result<String, sqlx::Error> {
    let id: (String,) = sqlx::query_as(
        "INSERT INTO notifications (user_id, title, body, level)
         VALUES ($1::uuid, $2, $3, $4)
         RETURNING id::text",
    )
    .bind(user_id)
    .bind(title)
    .bind(body)
    .bind(level)
    .fetch_one(&mut **tx)
    .await?;

    // SSE channel — 标 sent (事务 commit 后 caller 会 publish, 业务上等价已投递).
    sqlx::query(
        "INSERT INTO notification_outbox (notification_id, channel, state, next_retry_at)
         VALUES ($1::uuid, 'sse', 'sent', NOW())",
    )
    .bind(&id.0)
    .execute(&mut **tx)
    .await?;

    // Email channel — pending, 留给 outbox worker 真发.
    // B5: 不再用 tokio::spawn fire-and-forget — worker 必须真发, 失败可重试.
    sqlx::query(
        "INSERT INTO notification_outbox (notification_id, channel, state, next_retry_at)
         VALUES ($1::uuid, 'email', 'pending', NOW())",
    )
    .bind(&id.0)
    .execute(&mut **tx)
    .await?;

    Ok(id.0)
}

/// 检查用户是否离线 (>10min last_seen), 是则尝试发邮件.
/// email 配置缺失 / 用户没设 email / notify_by_email=false / 已 throttle → 跳过.
///
/// 注: B5 修复后, 这个函数不再被直接调用 — 邮件发送走 outbox worker.
/// 保留为 legacy helper 给可能的外部直接调用 (e.g. admin 工具脚本).
#[allow(dead_code)]
async fn email_fallback(
    state: &AppState,
    user_id: &str,
    title: &str,
    body: Option<&str>,
    level: &str,
) -> anyhow::Result<()> {
    // 没配 SMTP 直接跳过, 不报错
    if !state.smtp_config.enabled {
        return Ok(());
    }

    // 查用户 email + 偏好 + 离线时长
    let row: Option<(Option<String>, bool, Option<chrono::DateTime<chrono::Utc>>)> =
        sqlx::query_as(
            "SELECT u.email, u.notify_by_email, p.last_seen
             FROM users u
             LEFT JOIN presence p ON p.user_id = u.id
             WHERE u.id = $1::uuid",
        )
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?;

    let (email_opt, notify_by_email, last_seen) = match row {
        Some(r) => r,
        None => return Ok(()),
    };

    let email = match email_opt {
        Some(e) if !e.is_empty() => e,
        _ => {
            tracing::debug!(user_id, "user has no email, skip");
            return Ok(());
        }
    };
    if !notify_by_email {
        tracing::debug!(user_id, "user opted out of email notify");
        return Ok(());
    }
    // P1#5: 多设备在线判断 — 优先用 sse_lease (spec §7.1 要求 "邮件发送前检查有效在线租约")
    //         任意 device 有活跃 lease → 视为在线
    let online_by_lease = crate::events::is_user_online(&state.db, user_id).await;
    if online_by_lease {
        tracing::debug!(user_id, "user has active SSE lease, skip email");
        return Ok(());
    }
    // 兜底: 看 presence.last_seen (旧路径, 没有 SSE 也用这个)
    let offline_by_presence = match last_seen {
        Some(t) => (chrono::Utc::now() - t).num_minutes() > 10,
        None => true,
    };
    if !offline_by_presence {
        tracing::debug!(user_id, "user online by presence, skip email");
        return Ok(());
    }

    match crate::email::try_send(state, user_id, &email, level, title, body).await {
        Ok(true) => tracing::info!(user_id, "email fallback sent"),
        Ok(false) => tracing::debug!(user_id, "email throttled or skipped"),
        Err(e) => tracing::warn!(user_id, error = %e, "email fallback send failed"),
    }
    Ok(())
}

// ─── Outbox worker (P1#3 + spec §6.4) ─────────────────────────────────────

const OUTBOX_CRON_NAME: &str = "notification_outbox";

/// 后台 worker: 每 30s 拉一次 pending outbox 行, 尝试投递, 指数退避.
/// 注: 当前 email 已经在 create_and_publish 里 fire-and-forget, 所以 outbox 主要用作
///      (1) 状态审计 (2) 失败重试 (3) 多实例 worker 协调 (FOR UPDATE SKIP LOCKED 在 P2).
pub fn start_outbox_worker(state: AppState, tracker: crate::cron_tracker::CronTracker) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(30));
        tick.tick().await; // skip immediate
        loop {
            tick.tick().await;
            tracker.record_tick(OUTBOX_CRON_NAME);
            match run_outbox_tick(&state).await {
                Ok(n) => {
                    if n > 0 {
                        tracing::debug!(processed = n, "outbox tick processed");
                    }
                    tracker.record_ok(OUTBOX_CRON_NAME);
                }
                Err(e) => {
                    let msg = format!("{e:#}");
                    tracing::warn!(error = %msg, "outbox tick failed");
                    tracker.record_error(OUTBOX_CRON_NAME, &msg);
                }
            }
        }
    });
}

/// Worker 跑一轮 outbox tick (H1/H4 集成测试用).
/// 公开给 tests 调 — 走完整 SMTP 流程 + 限流 + 前置检查.
pub async fn run_outbox_tick(state: &AppState) -> anyhow::Result<usize> {
    // P2#1 / P3#3-d: SKIP LOCKED + 持久化 claim 模式.
    // 事务内 SELECT FOR UPDATE SKIP LOCKED + UPDATE next_retry_at 推到未来,
    // commit 后其他 worker 的 WHERE next_retry_at <= NOW() 看不到这些行.
    // 真正的 deliver 在事务外跑, 跑完再 UPDATE final state.
    let rows: Vec<(uuid::Uuid, String, i32)> = {
        let mut tx = state.db.begin().await?;
        let rows: Vec<(uuid::Uuid, String, i32)> = sqlx::query_as(
            "SELECT id, channel, attempts FROM notification_outbox
             WHERE state = 'pending' AND next_retry_at <= NOW()
             ORDER BY next_retry_at ASC
             LIMIT 32
             FOR UPDATE SKIP LOCKED",
        )
        .fetch_all(&mut *tx)
        .await?;
        if !rows.is_empty() {
            // 推到 5min 后 (单实例下保证 tick 期间不被重领; 失败时由 deliver_one 重设).
            sqlx::query(
                "UPDATE notification_outbox SET next_retry_at = NOW() + INTERVAL '5 minutes' WHERE id = ANY($1)",
            )
            .bind(rows.iter().map(|(id, ..)| *id).collect::<Vec<_>>())
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        rows
    };

    let mut processed = 0;
    for (outbox_id, channel, attempts) in rows {
        match deliver_one(state, outbox_id, &channel, attempts).await {
            Ok(()) => processed += 1,
            Err(e) => {
                tracing::warn!(outbox_id = %outbox_id, channel = %channel, error = %e, "outbox deliver failed");
            }
        }
    }
    Ok(processed)
}

/// H1 helper: 把 outbox 行标 skipped (终态) + 写 last_error reason + 累加 attempts.
async fn mark_email_skipped(
    db: &PgPool,
    outbox_id: uuid::Uuid,
    attempts: i32,
    reason: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE notification_outbox
         SET state = 'skipped', attempts = $1, last_error = $2, sent_at = NOW()
         WHERE id = $3",
    )
    .bind(attempts)
    .bind(reason)
    .bind(outbox_id)
    .execute(db)
    .await?;
    tracing::debug!(outbox_id = %outbox_id, attempts, reason, "email skipped");
    Ok(())
}

async fn deliver_one(
    state: &AppState,
    outbox_id: uuid::Uuid,
    channel: &str,
    attempts: i32,
) -> anyhow::Result<()> {
    let new_attempts = attempts + 1;

    match channel {
        // SSE: 已经在 create_and_publish 时通过 event_bus.publish() 推到内存 broadcast.
        // 这里只 mark sent, 不做实际投递.
        "sse" => {
            sqlx::query(
                "UPDATE notification_outbox
                 SET state = 'sent', attempts = $1, sent_at = NOW(), last_error = NULL
                 WHERE id = $2",
            )
            .bind(new_attempts)
            .bind(outbox_id)
            .execute(&state.db)
            .await?;
        }
        // B5 修复 + H1 修复: Email channel 必须真发 SMTP, 投递前重新评估所有
        // 决策条件 (notify_by_email / email_verified / SSE lease), 区分 Delivered /
        // Skipped / RetryableFailure 终态. 失败 schedule retry.
        "email" => {
            // 读 notification (title/body) + user (email, notify_by_email, email_verified).
            // 这里再次 join 是因为 worker 跑的时候, 用户可能改了 preferences — 不能
            // 用 outbox 创建时的快照判断 "该不该发".
            let row: Option<(String, Option<String>, String, String, bool, bool)> = sqlx::query_as(
                "SELECT n.user_id::text, u.email, n.title, n.body,
                        u.notify_by_email, u.email_verified
                 FROM notification_outbox o
                 JOIN notifications n ON n.id = o.notification_id
                 JOIN users u ON u.id = n.user_id
                 WHERE o.id = $1",
            )
            .bind(outbox_id)
            .fetch_optional(&state.db)
            .await?;

            let (user_id, email_opt, title, body, notify_by_email, email_verified) = match row {
                Some(r) => r,
                None => {
                    // notification / user 已被删 → 标 skipped (无 source, 没法投递)
                    sqlx::query(
                        "UPDATE notification_outbox
                         SET state = 'skipped', attempts = $1, last_error = 'source gone',
                             sent_at = NOW()
                         WHERE id = $2",
                    )
                    .bind(new_attempts)
                    .bind(outbox_id)
                    .execute(&state.db)
                    .await?;
                    return Ok(());
                }
            };

            // 达到重试上限 → 标 failed (spec §7.2 "永久失败应进入可观察的 failed 状态")
            const MAX_ATTEMPTS: i32 = 5;
            if new_attempts > MAX_ATTEMPTS {
                sqlx::query(
                    "UPDATE notification_outbox
                     SET state = 'failed', attempts = $1, last_error = $2
                     WHERE id = $3",
                )
                .bind(new_attempts)
                .bind(format!("max attempts ({MAX_ATTEMPTS}) exceeded"))
                .bind(outbox_id)
                .execute(&state.db)
                .await?;
                tracing::warn!(
                    outbox_id = %outbox_id,
                    user_id = %user_id,
                    title = %title,
                    "email delivery permanently failed (max attempts)"
                );
                return Ok(());
            }

            // H1: 投递前 pre-check 链 — 任一不满足 → skipped (终态, 不再 retry).
            // 这些条件在 outbox 创建时 (create_and_publish) 也检查过, 但 worker 必须
            // 重新评估, 因为用户可能在中间改了 preferences.
            // 顺序: cheap → expensive.
            let email_to = match email_opt {
                Some(e) if !e.is_empty() => e,
                _ => {
                    return mark_email_skipped(
                        &state.db,
                        outbox_id,
                        new_attempts,
                        "no email configured",
                    )
                    .await;
                }
            };
            if !email_verified {
                return mark_email_skipped(
                    &state.db,
                    outbox_id,
                    new_attempts,
                    "email not verified",
                )
                .await;
            }
            if !notify_by_email {
                return mark_email_skipped(&state.db, outbox_id, new_attempts, "user opted out")
                    .await;
            }
            // SSE lease 存在 → 用户在线, 不发邮件 (spec §7.1 "邮件发送前检查有效在线租约").
            // 注意: 这是 P1#5 多设备支持 — 一个设备断不会覆盖另一个, 但 ANY device
            // 有 lease 仍视为在线.
            if crate::events::is_user_online(&state.db, &user_id).await {
                return mark_email_skipped(
                    &state.db,
                    outbox_id,
                    new_attempts,
                    "user online (active SSE lease)",
                )
                .await;
            }

            // 限流: 同一 user_id 1h 内已有 sent/skipped 邮件记录 → 跳过.
            // 走 outbox.sent_at 而不是 notifications 表 (H1: 否则自指 throttle).
            if crate::email::is_throttled(&state.db, &user_id).await {
                return mark_email_skipped(
                    &state.db,
                    outbox_id,
                    new_attempts,
                    "throttled (1h window)",
                )
                .await;
            }

            // H1: SMTP 配置缺失 → 视为 skipped (终态), 跟 try_send 内部 cfg.enabled 路径一致.
            // 老实现: cfg.enabled=false 时 try_send 返 Ok(false) → 上层 mark sent, 但实际
            // 啥也没发. 这次明确: SMTP 没配就直接 skipped, 不要再 retry 5 次.
            if !state.smtp_config.enabled {
                return mark_email_skipped(
                    &state.db,
                    outbox_id,
                    new_attempts,
                    "smtp not configured",
                )
                .await;
            }

            // 真发 SMTP
            let body_opt: Option<&str> = if body.is_empty() {
                None
            } else {
                Some(body.as_str())
            };
            match crate::email::try_send(state, &user_id, &email_to, "info", &title, body_opt).await
            {
                Ok(_sent) => {
                    // Delivered (SMTP 真发了) 或 skipped-by-SMTP (config 缺失 / verified
                    // 不通过 — 但这些在前面已 catch, 这里只剩 "真发" 路径). 1h 限流通过
                    // throttle (next_retry_at) 也算 Delivered (SMTP 接受).
                    sqlx::query(
                        "UPDATE notification_outbox
                         SET state = 'sent', attempts = $1, sent_at = NOW(), last_error = NULL
                         WHERE id = $2",
                    )
                    .bind(new_attempts)
                    .bind(outbox_id)
                    .execute(&state.db)
                    .await?;
                }
                Err(e) => {
                    // 真发失败 — 指数退避重试
                    let clamped = new_attempts.clamp(0, 6) as u32;
                    let mins = 2_i64.saturating_pow(clamped);
                    let next_retry_secs = mins * 60;
                    sqlx::query(
                        "UPDATE notification_outbox
                         SET state = 'pending', attempts = $1, last_error = $2,
                             next_retry_at = NOW() + ($3 || ' seconds')::interval
                         WHERE id = $4",
                    )
                    .bind(new_attempts)
                    .bind(&e)
                    .bind(next_retry_secs.to_string())
                    .bind(outbox_id)
                    .execute(&state.db)
                    .await?;
                    tracing::warn!(
                        outbox_id = %outbox_id,
                        user_id = %user_id,
                        attempts = new_attempts,
                        error = %e,
                        "email send failed, scheduled retry"
                    );
                }
            }
        }
        other => {
            tracing::warn!(channel = %other, outbox_id = %outbox_id, "unknown outbox channel, marking sent");
            sqlx::query(
                "UPDATE notification_outbox
                 SET state = 'sent', attempts = $1, last_error = 'unknown channel'
                 WHERE id = $2",
            )
            .bind(new_attempts)
            .bind(outbox_id)
            .execute(&state.db)
            .await?;
        }
    }
    Ok(())
}
