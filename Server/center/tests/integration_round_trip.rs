//! P3#3-f: user_skill + agent_config 完整 round-trip 集成测试.
//!
//! spec §5.1 (Custom Skill 完整同步) + §5.2 (Sonetto Agent 配置同步) + §5.4 (数据隔离).
//!
//! 覆盖:
//! - user_skill create / read / update (含 version 乐观锁 409) / delete 闭环
//! - user_skill_files 附属文件 round-trip (含 content_hash 校验)
//! - 两用户隔离 (A 看不到 B, B 改/删 A 都被拒)
//! - agent_configs upsert / read 闭环 (providers/persona/tools/mcp_servers/settings 5 keys)
//! - 跨用户的 agent_configs 隔离

mod common;
use base64::Engine;
use common::TestContext;
use sha2::{Digest, Sha256};

/// user_skill 创建 → 读 → 改 → 删 round-trip.
#[tokio::test]
async fn user_skill_full_round_trip() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;

    // 计算 content_hash (sha256 of content_md)
    let content_md = "# My Skill\n\nSome content here.";
    let content_hash = {
        let mut h = Sha256::new();
        h.update(content_md.as_bytes());
        format!("{:x}", h.finalize())
    };

    // CREATE
    sqlx::query(
        "INSERT INTO user_skills (user_id, slug, name, content_md, source, version, content_hash)
         VALUES ($1::uuid, $2, $3, $4, 'local', 1, $5)",
    )
    .bind(&alice)
    .bind("my-skill")
    .bind("My Skill")
    .bind(content_md)
    .bind(&content_hash)
    .execute(&ctx.pool)
    .await
    .unwrap();

    // READ - list
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::bigint FROM user_skills WHERE user_id = $1::uuid")
            .bind(&alice)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(count.0, 1);

    // READ - get
    let (slug, name, version, hash): (String, String, i32, String) = sqlx::query_as(
        "SELECT slug, name, version, content_hash FROM user_skills
         WHERE user_id = $1::uuid AND slug = $2",
    )
    .bind(&alice)
    .bind("my-skill")
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(slug, "my-skill");
    assert_eq!(name, "My Skill");
    assert_eq!(version, 1);
    assert_eq!(hash, content_hash);

    // UPDATE - 正确 version → 成功, version 自增
    let affected = sqlx::query(
        "UPDATE user_skills
         SET content_md = $1, content_hash = $2, version = version + 1, updated_at = NOW()
         WHERE user_id = $3::uuid AND slug = $4 AND version = $5",
    )
    .bind("# My Skill v2")
    .bind({
        let mut h = Sha256::new();
        h.update(b"# My Skill v2");
        format!("{:x}", h.finalize())
    })
    .bind(&alice)
    .bind("my-skill")
    .bind(1)
    .execute(&ctx.pool)
    .await
    .unwrap()
    .rows_affected();
    assert_eq!(affected, 1);

    // UPDATE - 用旧 version → 0 行 (handler 409)
    let affected = sqlx::query(
        "UPDATE user_skills
         SET content_md = $1, version = version + 1
         WHERE user_id = $2::uuid AND slug = $3 AND version = $4",
    )
    .bind("# old version update")
    .bind(&alice)
    .bind("my-skill")
    .bind(1) // 还是旧 version
    .execute(&ctx.pool)
    .await
    .unwrap()
    .rows_affected();
    assert_eq!(affected, 0, "用旧 expected_version 应该 0 行 (handler 409)");

    // 验证 version 现在是 2
    let (new_version,): (i32,) =
        sqlx::query_as("SELECT version FROM user_skills WHERE user_id = $1::uuid AND slug = $2")
            .bind(&alice)
            .bind("my-skill")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(new_version, 2);

    // DELETE - 正确 user → 1 行
    let affected = sqlx::query("DELETE FROM user_skills WHERE user_id = $1::uuid AND slug = $2")
        .bind(&alice)
        .bind("my-skill")
        .execute(&ctx.pool)
        .await
        .unwrap()
        .rows_affected();
    assert_eq!(affected, 1);

    // DELETE again → 0 行
    let affected = sqlx::query("DELETE FROM user_skills WHERE user_id = $1::uuid AND slug = $2")
        .bind(&alice)
        .bind("my-skill")
        .execute(&ctx.pool)
        .await
        .unwrap()
        .rows_affected();
    assert_eq!(affected, 0);

    ctx.cleanup().await;
}

/// user_skill_files 附属文件 round-trip + content_hash 校验.
#[tokio::test]
async fn user_skill_files_round_trip_with_hash() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;

    // 先建 skill (FK)
    sqlx::query(
        "INSERT INTO user_skills (user_id, slug, name, content_md, content_hash)
         VALUES ($1::uuid, $2, $3, $4, 'placeholder')",
    )
    .bind(&alice)
    .bind("multi-file-skill")
    .bind("Multi File Skill")
    .bind("# skill")
    .execute(&ctx.pool)
    .await
    .unwrap();

    // 写 2 个附件
    let file1_bytes: &[u8] = b"hello, this is file 1";
    let file2_bytes: &[u8] = b"second file content with binary \x00\x01\x02 data";
    let hash1 = {
        let mut h = Sha256::new();
        h.update(file1_bytes);
        format!("{:x}", h.finalize())
    };
    let hash2 = {
        let mut h = Sha256::new();
        h.update(file2_bytes);
        format!("{:x}", h.finalize())
    };

    sqlx::query(
        "INSERT INTO user_skill_files (user_id, slug, rel_path, mime, size_bytes, content, content_hash)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&alice)
    .bind("multi-file-skill")
    .bind("docs/readme.md")
    .bind("text/markdown")
    .bind(file1_bytes.len() as i64)
    .bind(file1_bytes)
    .bind(&hash1)
    .execute(&ctx.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_skill_files (user_id, slug, rel_path, mime, size_bytes, content, content_hash)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&alice)
    .bind("multi-file-skill")
    .bind("assets/data.bin")
    .bind("application/octet-stream")
    .bind(file2_bytes.len() as i64)
    .bind(file2_bytes)
    .bind(&hash2)
    .execute(&ctx.pool)
    .await
    .unwrap();

    // 读出验证
    let files: Vec<(String, String, i64, Vec<u8>, String)> = sqlx::query_as(
        "SELECT rel_path, mime, size_bytes, content, content_hash FROM user_skill_files
         WHERE user_id = $1::uuid AND slug = $2 ORDER BY rel_path",
    )
    .bind(&alice)
    .bind("multi-file-skill")
    .fetch_all(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(files.len(), 2);

    // 第一个文件 (按 rel_path 排序, assets/ 排在 docs/ 之前)
    let (path2, mime2, size2, content2, hash2_read) = &files[0];
    assert_eq!(path2, "assets/data.bin");
    assert_eq!(mime2, "application/octet-stream");
    assert_eq!(*size2, file2_bytes.len() as i64);
    assert_eq!(content2, &file2_bytes);
    assert_eq!(hash2_read, &hash2);

    // 第二个文件
    let (path1, mime1, size1, content1, hash1_read) = &files[1];
    assert_eq!(path1, "docs/readme.md");
    assert_eq!(mime1, "text/markdown");
    assert_eq!(*size1, file1_bytes.len() as i64);
    assert_eq!(content1, &file1_bytes);
    assert_eq!(hash1_read, &hash1);

    // 删除 skill → CASCADE 删 files
    sqlx::query("DELETE FROM user_skills WHERE user_id = $1::uuid AND slug = $2")
        .bind(&alice)
        .bind("multi-file-skill")
        .execute(&ctx.pool)
        .await
        .unwrap();
    let file_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::bigint FROM user_skill_files WHERE user_id = $1::uuid")
            .bind(&alice)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(file_count.0, 0, "FK ON DELETE CASCADE 应该清掉所有 files");

    ctx.cleanup().await;
}

/// user_skill 两用户隔离 — A 的 skill B 看不到/改不到/删不到.
///
/// PK 是 (user_id, slug), 不同用户可以拥有同名 slug skill.
/// 隔离完全靠 user_id 过滤 — handler 必须用 caller user_id 拼 SQL.
/// 这里模拟"handler 用 caller user_id 过滤"的行为, 验证 Bob 看不到 Alice 的内容.
#[tokio::test]
async fn user_skill_two_users_isolated() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;
    let bob = ctx.create_user("bob").await;

    // Alice 建一个 unique-skill (Bob 不会建同名)
    sqlx::query(
        "INSERT INTO user_skills (user_id, slug, name, content_md, content_hash)
         VALUES ($1::uuid, $2, $3, $4, 'h')",
    )
    .bind(&alice)
    .bind("alice-only-skill")
    .bind("Alice Only Skill")
    .bind("# alice secret")
    .execute(&ctx.pool)
    .await
    .unwrap();

    // Bob 用自己 user_id + Alice 的 slug 查 → 0 行 (隔离正确)
    let bob_reads: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM user_skills
         WHERE user_id = $1::uuid AND slug = $2",
    )
    .bind(&bob)
    .bind("alice-only-skill")
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(
        bob_reads.0, 0,
        "Bob 用自己 user_id 查 Alice 的 skill → 0 行"
    );

    // Bob 用自己 user_id 试图 UPDATE Alice 的 → 0 行
    let bob_updates: u64 = sqlx::query(
        "UPDATE user_skills SET name = 'pwned'
         WHERE user_id = $1::uuid AND slug = $2",
    )
    .bind(&bob)
    .bind("alice-only-skill")
    .execute(&ctx.pool)
    .await
    .unwrap()
    .rows_affected();
    assert_eq!(bob_updates, 0, "Bob 试图 UPDATE Alice 的 skill → 0 行");

    // Bob 用自己 user_id 试图 DELETE Alice 的 → 0 行
    let bob_deletes: u64 =
        sqlx::query("DELETE FROM user_skills WHERE user_id = $1::uuid AND slug = $2")
            .bind(&bob)
            .bind("alice-only-skill")
            .execute(&ctx.pool)
            .await
            .unwrap()
            .rows_affected();
    assert_eq!(bob_deletes, 0, "Bob 试图 DELETE Alice 的 skill → 0 行");

    // Alice 的行没被改, 名字保持
    let (alice_name,): (String,) =
        sqlx::query_as("SELECT name FROM user_skills WHERE user_id = $1::uuid AND slug = $2")
            .bind(&alice)
            .bind("alice-only-skill")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(alice_name, "Alice Only Skill", "Alice 的名字应保持不变");

    // Alice 仍能读自己的
    let alice_reads: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM user_skills
         WHERE user_id = $1::uuid AND slug = $2",
    )
    .bind(&alice)
    .bind("alice-only-skill")
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(alice_reads.0, 1, "Alice 仍能看到自己的 skill");

    // Bob 也能用 (user_id, slug) 重复 (PK 允许) 建同名 slug 的 skill — 但只属于 Bob
    sqlx::query(
        "INSERT INTO user_skills (user_id, slug, name, content_md, content_hash)
         VALUES ($1::uuid, $2, $3, $4, 'h')",
    )
    .bind(&bob)
    .bind("alice-only-skill")
    .bind("Bob's version")
    .bind("# bob's content")
    .execute(&ctx.pool)
    .await
    .unwrap();
    let (bob_name,): (String,) =
        sqlx::query_as("SELECT name FROM user_skills WHERE user_id = $1::uuid AND slug = $2")
            .bind(&bob)
            .bind("alice-only-skill")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(bob_name, "Bob's version");
    let (alice_name_2,): (String,) =
        sqlx::query_as("SELECT name FROM user_skills WHERE user_id = $1::uuid AND slug = $2")
            .bind(&alice)
            .bind("alice-only-skill")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(
        alice_name_2, "Alice Only Skill",
        "Bob 建同名 skill 不影响 Alice"
    );

    ctx.cleanup().await;
}

/// agent_configs round-trip: 5 个 config_key 都可读写, 带 version 乐观锁.
#[tokio::test]
async fn agent_configs_round_trip_with_version() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;

    // 5 个允许的 config_key
    let keys = ["providers", "persona", "tools", "mcp_servers", "settings"];
    for key in keys {
        sqlx::query(
            "INSERT INTO agent_configs (user_id, config_key, value) VALUES ($1::uuid, $2, '{}'::jsonb)",
        )
        .bind(&alice)
        .bind(key)
        .execute(&ctx.pool)
        .await
        .unwrap();
    }

    // READ - 5 个都在
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::bigint FROM agent_configs WHERE user_id = $1::uuid")
            .bind(&alice)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(count.0, 5);

    // UPDATE - 用 version 乐观锁
    let (version,): (i32,) = sqlx::query_as(
        "SELECT version FROM agent_configs WHERE user_id = $1::uuid AND config_key = $2",
    )
    .bind(&alice)
    .bind("providers")
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(version, 1);

    // 正确 version
    let affected = sqlx::query(
        "UPDATE agent_configs SET value = $1::jsonb, version = version + 1, updated_at = NOW()
         WHERE user_id = $2::uuid AND config_key = $3 AND version = $4",
    )
    .bind(r#"{"openai": {"api_key_set": true}}"#)
    .bind(&alice)
    .bind("providers")
    .bind(1)
    .execute(&ctx.pool)
    .await
    .unwrap()
    .rows_affected();
    assert_eq!(affected, 1);

    // 旧 version → 0 行
    let affected = sqlx::query(
        "UPDATE agent_configs SET value = '{}'::jsonb
         WHERE user_id = $1::uuid AND config_key = $2 AND version = $3",
    )
    .bind(&alice)
    .bind("providers")
    .bind(1) // 旧
    .execute(&ctx.pool)
    .await
    .unwrap()
    .rows_affected();
    assert_eq!(affected, 0);

    // 验证 version 现在是 2 + value 是更新后的
    let (new_version, value): (i32, serde_json::Value) = sqlx::query_as(
        "SELECT version, value FROM agent_configs WHERE user_id = $1::uuid AND config_key = $2",
    )
    .bind(&alice)
    .bind("providers")
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(new_version, 2);
    assert_eq!(value["openai"]["api_key_set"], serde_json::json!(true));

    // CHECK constraint: 不允许的 config_key 被拒
    let bad_key_result = sqlx::query(
        "INSERT INTO agent_configs (user_id, config_key, value) VALUES ($1::uuid, 'bad_key', '{}'::jsonb)",
    )
    .bind(&alice)
    .execute(&ctx.pool)
    .await;
    assert!(
        bad_key_result.is_err(),
        "config_key CHECK 应该拒绝 'bad_key'"
    );

    ctx.cleanup().await;
}

/// agent_configs 两用户隔离.
#[tokio::test]
async fn agent_configs_two_users_isolated() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;
    let bob = ctx.create_user("bob").await;

    // Alice 写 providers
    sqlx::query(
        "INSERT INTO agent_configs (user_id, config_key, value) VALUES ($1::uuid, 'providers', '{\"alice\":true}'::jsonb)",
    )
    .bind(&alice)
    .execute(&ctx.pool)
    .await
    .unwrap();

    // Bob 查自己的 → 0 行
    let bob_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::bigint FROM agent_configs WHERE user_id = $1::uuid")
            .bind(&bob)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(bob_count.0, 0);

    // Bob 也写自己的 providers (PK 允许, 不同的 user_id)
    sqlx::query(
        "INSERT INTO agent_configs (user_id, config_key, value) VALUES ($1::uuid, 'providers', '{\"bob\":true}'::jsonb)",
    )
    .bind(&bob)
    .execute(&ctx.pool)
    .await
    .unwrap();

    // 各自读自己的 → 不同的 value
    let (alice_value,): (serde_json::Value,) = sqlx::query_as(
        "SELECT value FROM agent_configs WHERE user_id = $1::uuid AND config_key = 'providers'",
    )
    .bind(&alice)
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    let (bob_value,): (serde_json::Value,) = sqlx::query_as(
        "SELECT value FROM agent_configs WHERE user_id = $1::uuid AND config_key = 'providers'",
    )
    .bind(&bob)
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(alice_value["alice"], serde_json::json!(true));
    assert_eq!(bob_value["bob"], serde_json::json!(true));

    ctx.cleanup().await;
}

/// agent_secrets: ciphertext + nonce + content_hash 写入 + 读出.
#[tokio::test]
async fn agent_secrets_ciphertext_round_trip() {
    let ctx = TestContext::new().await;
    let alice = ctx.create_user("alice").await;

    // 模拟"加密后" (生产用 AES-GCM, 这里只测 schema 完整性).
    // 注: schema 里 ciphertext/nonce 是 TEXT (base64), 不是 BYTEA.
    let ciphertext = b"fake-aes-gcm-ciphertext-bytes\x00\x01\x02";
    let nonce = b"unique-nonce-12b";
    // 转成 base64 模拟真实存储
    let ciphertext_b64 = base64::engine::general_purpose::STANDARD.encode(ciphertext);
    let nonce_b64 = base64::engine::general_purpose::STANDARD.encode(nonce);
    let key_version = 1;
    let size_bytes = ciphertext.len() as i32;

    sqlx::query(
        "INSERT INTO agent_secrets (user_id, secret_key, ciphertext, nonce, key_version, size_bytes)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)",
    )
    .bind(&alice)
    .bind("openai_api_key")
    .bind(&ciphertext_b64)
    .bind(&nonce_b64)
    .bind(key_version)
    .bind(size_bytes)
    .execute(&ctx.pool)
    .await
    .unwrap();

    // 读出
    let (read_ct, read_nonce, read_kv, read_size): (String, String, i32, i32) = sqlx::query_as(
        "SELECT ciphertext, nonce, key_version, size_bytes FROM agent_secrets
         WHERE user_id = $1::uuid AND secret_key = $2",
    )
    .bind(&alice)
    .bind("openai_api_key")
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(read_ct, ciphertext_b64);
    assert_eq!(read_nonce, nonce_b64);
    assert_eq!(read_kv, key_version);
    assert_eq!(read_size, size_bytes);

    // 同一 user 重复 secret_key → UNIQUE 拒绝
    let dup_result = sqlx::query(
        "INSERT INTO agent_secrets (user_id, secret_key, ciphertext, nonce, key_version, size_bytes)
         VALUES ($1::uuid, 'openai_api_key', 'x', 'y', 1, 1)",
    )
    .bind(&alice)
    .execute(&ctx.pool)
    .await;
    assert!(
        dup_result.is_err(),
        "(user_id, secret_key) UNIQUE 应该拒绝重复"
    );

    // 跨用户同名 secret_key 允许
    let bob = ctx.create_user("bob").await;
    sqlx::query(
        "INSERT INTO agent_secrets (user_id, secret_key, ciphertext, nonce, key_version, size_bytes)
         VALUES ($1::uuid, 'openai_api_key', 'bobs-ct', 'bobs-nonce', 1, 8)",
    )
    .bind(&bob)
    .execute(&ctx.pool)
    .await
    .unwrap();
    // Alice 仍只有 1 条
    let alice_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::bigint FROM agent_secrets WHERE user_id = $1::uuid")
            .bind(&alice)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(alice_count.0, 1);

    ctx.cleanup().await;
}
