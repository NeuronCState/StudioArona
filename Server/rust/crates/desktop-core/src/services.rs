//! 业务服务模块 (Phase 1)
//!
//! 后续拆分:
//!   mod feed;         // RSS 抓取 + 全文抽取
//!   mod schedule;
//!   mod vm;
//!   mod admin;
//!   mod notification;
//!   mod llm;          // 顶替 v2 services/llm_gateway
//!   mod hermes;       // 顶替 v2 services/agent/bridge (Node 部分)
//!   mod perception;   // 顶替 v2 services/perception
//!   mod weather;

pub mod auth;
pub mod me;
pub mod skills;
pub mod memory;
pub mod feeds;
pub mod schedules;

pub use auth::{login, refresh};
pub use me::{get_me, update_me, update_preferences};
pub use skills::list_skills;
pub use memory::{list_memories, create_memory, delete_memory, search_memory};
pub use feeds::{list_feeds, create_feed, delete_feed, list_feed_items};
pub use schedules::{list_schedules, create_schedule, update_schedule, delete_schedule};
