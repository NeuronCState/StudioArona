//! 跨语言共享类型 (Rust ↔ TypeScript)
//!
//! 用 `ts-rs` 在 Rust 端定义, 自动生成 TS 类型给前端用.
//! Phase 1: 定义跟 v2 api-gateway 端点对应的 request/response.
//! Phase 2: 加 specta 输出 .d.ts 文件, 前端 import.
//!
//! 详细: `docs/v3-monorepo-migration.md` (阶段 3: 抽 API 契约)

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub mod auth;
pub mod user;
pub mod skill;
pub mod schedule;
pub mod message;

pub use auth::*;
pub use user::*;
pub use skill::*;
pub use schedule::*;
pub use message::*;
