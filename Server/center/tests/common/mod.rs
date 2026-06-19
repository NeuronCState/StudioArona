//! P3#3: 集成测试 harness — 真实 PG, 每个测试一个独立 database (uuid 后缀).
//!
//! 用法:
//! ```ignore
//! let ctx = TestContext::new().await;
//! let user_a = ctx.create_user("alice").await;
//! let user_b = ctx.create_user("bob").await;
//! // ... 跑测试
//! ctx.cleanup().await; // drop database
//! ```
//!
//! 要求: docker compose 起的 PG 在 127.0.0.1:5432 (默认).

use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

pub const DEFAULT_PG_ADMIN_URL: &str = "postgresql://javis:javis@127.0.0.1:5432/postgres";
pub const DEFAULT_PG_BASE_URL: &str = "postgresql://javis:javis@127.0.0.1:5432/";

/// 一个测试上下文: 1 个独立 PG database + 1 个 sqlx::PgPool, 跑完所有 migration.
pub struct TestContext {
    pub db_name: String,
    pub pool: PgPool,
}

impl TestContext {
    pub async fn new() -> Self {
        Self::new_with_url(DEFAULT_PG_ADMIN_URL).await
    }

    pub async fn new_with_url(admin_url: &str) -> Self {
        let db_name = format!("arona_test_{}", Uuid::new_v4().simple());
        let admin = PgPoolOptions::new()
            .max_connections(2)
            .connect(admin_url)
            .await
            .expect("connect to admin PG (check docker compose is up)");

        // CREATE DATABASE 不能在事务里, 用 raw query
        sqlx::query(&format!("CREATE DATABASE {}", db_name))
            .execute(&admin)
            .await
            .expect("create test database");

        admin.close().await;

        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(&format!("{}{}", DEFAULT_PG_BASE_URL, db_name))
            .await
            .expect("connect to test database");

        // 跑所有 migration (复用 main.rs 的同一路径)
        sqlx::migrate!("../infra/db/versions")
            .run(&pool)
            .await
            .expect("run migrations on test database");

        Self { db_name, pool }
    }

    /// 直接 INSERT 一个用户, 返 user_id (uuid 字符串).
    /// bcrypt 跳过 — 测试用 user record 时直接拿 user_id 即可, 不走 auth.
    #[allow(dead_code)] // 部分 integration test 不需要直接建 user, 用 HTTP register
    pub async fn create_user(&self, username: &str) -> String {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO users (id, username, display_name, password_hash, role)
             VALUES ($1::uuid, $2, $2, '$2b$10$testtesttesttesttesttesttesttesttesttesttesttest', 'member')",
        )
        .bind(&id)
        .bind(username)
        .execute(&self.pool)
        .await
        .expect("insert test user");
        id
    }

    /// 测完 drop database — 不留垃圾.
    pub async fn cleanup(self) {
        // 关 pool 才能 drop database
        self.pool.close().await;
        // 用 admin 连接 drop
        let admin = PgPoolOptions::new()
            .max_connections(2)
            .connect(DEFAULT_PG_ADMIN_URL)
            .await
            .expect("reconnect admin to drop test db");
        // force disconnect remaining sessions
        let _ = sqlx::query(&format!(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{}'",
            self.db_name
        ))
        .execute(&admin)
        .await;
        sqlx::query(&format!("DROP DATABASE IF EXISTS {}", self.db_name))
            .execute(&admin)
            .await
            .expect("drop test database");
        admin.close().await;
    }
}
