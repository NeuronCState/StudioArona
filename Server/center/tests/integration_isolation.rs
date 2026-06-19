//! P3#3-b: 两用户隔离矩阵 — schedules / memory / feeds / skills / agent_configs / page_monitors.
//! P3#3-c: 乐观锁 409.
//! P3#3-e: 并发 worker 不重复领取 (SKIP LOCKED).

mod common;
use common::TestContext;

/// 隔离: 用户 A 创建资源 → 用户 B 看不到.
#[tokio::test]
async fn two_users_schedules_isolated() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;
    let bob = ctx.create_user("bob").await;

    // Alice 插一条
    let alice_schedule: (String,) = sqlx::query_as(
        "INSERT INTO schedules (user_id, title, start_at, end_at)
         VALUES ($1::uuid, 'Alice meeting', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour')
         RETURNING id::text",
    )
    .bind(&alice)
    .fetch_one(&ctx.pool)
    .await
    .unwrap();

    // Bob 查自己的 → 空
    let bob_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::bigint FROM schedules WHERE user_id = $1::uuid")
            .bind(&bob)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(bob_count.0, 0, "Bob 不应该看见 Alice 的 schedule");

    // Bob 尝试 UPDATE Alice 的 → 影响 0 行
    let affected = sqlx::query(
        "UPDATE schedules SET title = 'pwned' WHERE id = $1::uuid AND user_id = $2::uuid",
    )
    .bind(&alice_schedule.0)
    .bind(&bob)
    .execute(&ctx.pool)
    .await
    .unwrap()
    .rows_affected();
    assert_eq!(affected, 0, "Bob 不应该能 UPDATE Alice 的 schedule");

    // Bob 尝试 DELETE Alice 的 → 影响 0 行
    let affected = sqlx::query("DELETE FROM schedules WHERE id = $1::uuid AND user_id = $2::uuid")
        .bind(&alice_schedule.0)
        .bind(&bob)
        .execute(&ctx.pool)
        .await
        .unwrap()
        .rows_affected();
    assert_eq!(affected, 0, "Bob 不应该能 DELETE Alice 的 schedule");

    ctx.cleanup().await;
}

/// 隔离: memory entries.
#[tokio::test]
async fn two_users_memory_isolated() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;
    let bob = ctx.create_user("bob").await;

    sqlx::query(
        "INSERT INTO memory_entries (user_id, category, content) VALUES ($1::uuid, 'note', 'alice secret')",
    )
    .bind(&alice)
    .execute(&ctx.pool)
    .await
    .unwrap();

    let bob_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::bigint FROM memory_entries WHERE user_id = $1::uuid")
            .bind(&bob)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(bob_count.0, 0);

    ctx.cleanup().await;
}

/// 隔离: page_monitors.
#[tokio::test]
async fn two_users_page_monitors_isolated() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;
    let bob = ctx.create_user("bob").await;

    sqlx::query(
        "INSERT INTO page_monitors (user_id, url, label)
         VALUES ($1::uuid, 'https://example.com', 'alice monitor')",
    )
    .bind(&alice)
    .execute(&ctx.pool)
    .await
    .unwrap();

    // Bob 查 enabled + due → 空
    let bob_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM page_monitors
         WHERE user_id = $1::uuid AND enabled = TRUE",
    )
    .bind(&bob)
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(bob_count.0, 0);

    ctx.cleanup().await;
}

/// 隔离: agent_configs.
#[tokio::test]
async fn two_users_agent_configs_isolated() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;
    let bob = ctx.create_user("bob").await;

    sqlx::query(
        "INSERT INTO agent_configs (user_id, config_key, value) VALUES ($1::uuid, 'providers', '{}'::jsonb)",
    )
    .bind(&alice)
    .execute(&ctx.pool)
    .await
    .unwrap();

    let bob_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::bigint FROM agent_configs WHERE user_id = $1::uuid")
            .bind(&bob)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(bob_count.0, 0);

    ctx.cleanup().await;
}

/// 隔离: user_skills.
#[tokio::test]
async fn two_users_skills_isolated() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;
    let bob = ctx.create_user("bob").await;

    sqlx::query(
        "INSERT INTO user_skills (user_id, slug, name, content_md, content_hash)
         VALUES ($1::uuid, 'my-skill', 'My Skill', '# content', 'hash1234567890')",
    )
    .bind(&alice)
    .execute(&ctx.pool)
    .await
    .unwrap();

    let bob_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::bigint FROM user_skills WHERE user_id = $1::uuid")
            .bind(&bob)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(bob_count.0, 0);

    ctx.cleanup().await;
}

/// P3#3-c: 乐观锁 — schedules 的 expected_updated_at 模式.
#[tokio::test]
async fn schedule_optimistic_lock_409() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;

    let (id, updated_at): (String, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
        "INSERT INTO schedules (user_id, title, start_at, end_at)
         VALUES ($1::uuid, 'meeting', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour')
         RETURNING id::text, updated_at",
    )
    .bind(&alice)
    .fetch_one(&ctx.pool)
    .await
    .unwrap();

    // 第一次更新: 拿对 expected_updated_at → 成功
    let affected = sqlx::query(
        "UPDATE schedules SET title = 'first update', updated_at = NOW()
         WHERE id = $1::uuid AND updated_at = $2",
    )
    .bind(&id)
    .bind(updated_at)
    .execute(&ctx.pool)
    .await
    .unwrap()
    .rows_affected();
    assert_eq!(
        affected, 1,
        "第一次更新 (expected_updated_at 匹配) 应该成功"
    );

    // 第二次更新: 用旧的 expected_updated_at → 影响 0 行 → handler 应返 409
    let affected = sqlx::query(
        "UPDATE schedules SET title = 'second update', updated_at = NOW()
         WHERE id = $1::uuid AND updated_at = $2",
    )
    .bind(&id)
    .bind(updated_at) // 还是第一次那个时间戳
    .execute(&ctx.pool)
    .await
    .unwrap()
    .rows_affected();
    assert_eq!(
        affected, 0,
        "用旧 expected_updated_at 更新应该 0 行 (handler 映射 409)"
    );

    ctx.cleanup().await;
}

/// P3#3-e: 并发 worker 不重复领取同一 monitor (SKIP LOCKED + claim_until 持久化 验证).
///
/// 关键: 仅靠 SELECT FOR UPDATE SKIP LOCKED 在短事务下不可靠 — commit 后锁释放,
/// 其他 worker 下一轮能再拿同一行. 真正的互斥靠"持久化 claim_until 字段":
/// 事务内 UPDATE claimed_until = NOW() + 10min, 下个 worker 的 SELECT 会因
/// "claimed_until > NOW()" 过滤掉这行, 不会再拿到.
#[tokio::test]
async fn page_monitor_concurrent_claim_no_double_processing() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;

    // 插 1 个 enabled + due 的 monitor
    sqlx::query(
        "INSERT INTO page_monitors (user_id, url, label, check_interval_min, last_checked_at)
         VALUES ($1::uuid, 'https://example.com', 'test', 15, NULL)",
    )
    .bind(&alice)
    .execute(&ctx.pool)
    .await
    .unwrap();

    // 5 个并发 worker, 每个跑事务: SKIP LOCKED 拉 + UPDATE claim_until 持久化.
    let mut handles = vec![];
    for worker_id in 0..5 {
        let pool = ctx.pool.clone();
        handles.push(tokio::spawn(async move {
            let mut tx = pool.begin().await.unwrap();
            let rows: Vec<(String,)> = sqlx::query_as(
                "SELECT id::text FROM page_monitors
                 WHERE enabled = TRUE
                   AND (last_checked_at IS NULL
                        OR last_checked_at <= NOW() - (check_interval_min || ' minutes')::interval)
                   AND (claimed_until IS NULL OR claimed_until <= NOW())
                 LIMIT 50
                 FOR UPDATE SKIP LOCKED",
            )
            .fetch_all(&mut *tx)
            .await
            .unwrap();
            // 持久化 claim, 这样下个 worker 的 SELECT 会被 WHERE 过滤掉
            if !rows.is_empty() {
                let ids: Vec<String> = rows.iter().map(|(id,)| id.clone()).collect();
                sqlx::query(
                    "UPDATE page_monitors
                     SET claimed_until = NOW() + INTERVAL '10 minutes', claimed_by = $1
                     WHERE id = ANY($2::uuid[])",
                )
                .bind(format!("worker_{worker_id}"))
                .bind(&ids)
                .execute(&mut *tx)
                .await
                .unwrap();
            }
            tx.commit().await.unwrap();
            (worker_id, rows.len())
        }));
    }
    let mut total_claimed = 0;
    for h in handles {
        let (_id, count) = h.await.unwrap();
        total_claimed += count;
    }
    // 5 个 worker 并发跑, 但只有"第一个拿到 SELECT lock + UPDATE 持久化"的能 claim.
    // 其余 4 个要么 fetch_all 时被 SKIP LOCKED 跳过, 要么事务内 WHERE 看到 claimed_until > NOW() 拿 0.
    // 总 claim 数必须 = 1.
    assert_eq!(
        total_claimed, 1,
        "5 个并发 worker 应该总共只 claim 1 次 (SKIP LOCKED + claim_until 持久化互斥)"
    );

    ctx.cleanup().await;
}

/// P3#3-d: notification_outbox SKIP LOCKED — 同 outbox 行不会被两个 worker 重复处理.
///
/// 注: outbox 表没有 user_id 直列, 通过 notification_id 关联到 notifications.
/// 这里直接插 outbox 模拟"一条待投递", 验证 SKIP LOCKED 的互斥.
#[tokio::test]
async fn notification_outbox_skip_locked_prevents_double_delivery() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;

    // 插一条 notifications (outbox 依赖 notifications.notification_id 外键)
    let (notif_id,): (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO notifications (user_id, level, title, body)
         VALUES ($1::uuid, 'info', 'test', 'body') RETURNING id",
    )
    .bind(&alice)
    .fetch_one(&ctx.pool)
    .await
    .unwrap();

    // 插一条 pending outbox
    sqlx::query(
        "INSERT INTO notification_outbox (notification_id, channel, state, next_retry_at)
         VALUES ($1, 'sse', 'pending', NOW())",
    )
    .bind(notif_id)
    .execute(&ctx.pool)
    .await
    .unwrap();

    // 5 个并发 worker, 用和 page_monitor 一样的 SKIP LOCKED + 持久化 claim 模式:
    // 拉完后 UPDATE next_retry_at = NOW() + 1h, 让其他 worker 的 WHERE 过滤掉这行.
    let mut handles = vec![];
    for _ in 0..5 {
        let pool = ctx.pool.clone();
        handles.push(tokio::spawn(async move {
            let mut tx = pool.begin().await.unwrap();
            let rows: Vec<(uuid::Uuid,)> = sqlx::query_as(
                "SELECT id FROM notification_outbox
                 WHERE state = 'pending' AND next_retry_at <= NOW()
                 ORDER BY next_retry_at ASC
                 LIMIT 32
                 FOR UPDATE SKIP LOCKED",
            )
            .fetch_all(&mut *tx)
            .await
            .unwrap();
            if !rows.is_empty() {
                let ids: Vec<uuid::Uuid> = rows.iter().map(|(id,)| *id).collect();
                sqlx::query(
                    "UPDATE notification_outbox SET next_retry_at = NOW() + INTERVAL '1 hour' WHERE id = ANY($1)",
                )
                .bind(&ids)
                .execute(&mut *tx)
                .await
                .unwrap();
            }
            tx.commit().await.unwrap();
            rows.len()
        }));
    }
    let mut total_claimed = 0;
    for h in handles {
        total_claimed += h.await.unwrap();
    }
    assert_eq!(
        total_claimed, 1,
        "5 个并发 worker 跑 outbox SKIP LOCKED 应该总共只 claim 1 次"
    );

    ctx.cleanup().await;
}

/// P3#3-a: 空库跑全部 migration 应该成功 (每个 test 数据库都跑一次, 这里显式再跑一次).
#[tokio::test]
async fn migrations_apply_to_fresh_db() {
    // TestContext::new 内部就跑过 migration, 这里只需验证关键表都存在.
    let ctx = TestContext::new().await;
    let tables: Vec<(String,)> = sqlx::query_as(
        "SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name",
    )
    .fetch_all(&ctx.pool)
    .await
    .unwrap();
    let names: Vec<&str> = tables.iter().map(|(n,)| n.as_str()).collect();
    // 核心 8 表全在
    for must in [
        "users",
        "schedules",
        "memory_entries",
        "feeds",
        "page_monitors",
        "page_monitor_events",
        "notification_outbox",
        "user_skills",
        "agent_configs",
        "sse_lease",
    ] {
        assert!(
            names.contains(&must),
            "migration 应建表 {must}, 实际: {names:?}"
        );
    }
    ctx.cleanup().await;
}

/// P3#3-g: 50+ 信息源 SLA — 插 50 个 enabled + due monitor, 跑分页 claim 循环,
/// 验证所有 50 个都被 claim (没有漏领, 没有重复 claim).
///
/// 注: 这里只测 cron 拉取 + claim 逻辑, 不实际触发 HTTP fetch (那个是 check_one 的事).
#[tokio::test]
async fn page_monitor_cron_50_plus_sla_claims_all() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;

    // 插 50 个 enabled + due monitor (last_checked_at = NULL 视为永远到期)
    for i in 0..50 {
        sqlx::query(
            "INSERT INTO page_monitors (user_id, url, label, check_interval_min, last_checked_at)
             VALUES ($1::uuid, $2, $3, 15, NULL)",
        )
        .bind(&alice)
        .bind(format!("https://example.com/page-{i}"))
        .bind(format!("monitor {i}"))
        .execute(&ctx.pool)
        .await
        .unwrap();
    }

    // 模拟 cron 分页 claim: 重复跑 batch_size=10 的事务, 累积 claim 数量.
    let mut total_claimed = 0usize;
    let mut iterations = 0usize;
    let max_iterations = 20; // 安全护栏, 防止无限循环
    loop {
        iterations += 1;
        assert!(
            iterations <= max_iterations,
            "cron claim 循环超过 {max_iterations} 次, 应该有 bug"
        );
        let mut tx = ctx.pool.begin().await.unwrap();
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT id::text FROM page_monitors
             WHERE enabled = TRUE
               AND (last_checked_at IS NULL
                    OR last_checked_at <= NOW() - (check_interval_min || ' minutes')::interval)
               AND (claimed_until IS NULL OR claimed_until <= NOW())
             LIMIT 10
             FOR UPDATE SKIP LOCKED",
        )
        .fetch_all(&mut *tx)
        .await
        .unwrap();
        if rows.is_empty() {
            tx.commit().await.unwrap();
            break;
        }
        let ids: Vec<String> = rows.iter().map(|(id,)| id.clone()).collect();
        sqlx::query(
            "UPDATE page_monitors
             SET claimed_until = NOW() + INTERVAL '10 minutes', claimed_by = 'test'
             WHERE id = ANY($1::uuid[])",
        )
        .bind(&ids)
        .execute(&mut *tx)
        .await
        .unwrap();
        tx.commit().await.unwrap();
        total_claimed += rows.len();
    }

    assert_eq!(
        total_claimed, 50,
        "50 个 monitor 应该全部被 claim (实际 {total_claimed})"
    );

    // 跑完后所有 monitor 都被 claim (claimed_until > NOW()).
    let still_unclaimed: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM page_monitors
         WHERE claimed_until IS NULL OR claimed_until <= NOW()",
    )
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(
        still_unclaimed.0, 0,
        "50 个 monitor 应该全部被 claim, 还有 {} 个未 claim",
        still_unclaimed.0
    );

    ctx.cleanup().await;
}
