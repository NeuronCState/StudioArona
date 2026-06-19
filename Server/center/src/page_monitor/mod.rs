//! Page monitor — HTTP API + cron + canonical HTML 比较.
//!
//! 拆为:
//! - canonicalize.rs: 纯函数 (HTML → canonical hash + summary)
//! - handlers.rs:     HTTP handlers (list/create/update/delete/list_events)
//! - cron.rs:         start_cron / run_once / check_one / manual_check

pub mod canonicalize;
pub mod cron;
pub mod handlers;

// 重导出 cron 模块 (start_cron 给 main.rs, manual_check 给路由)
pub use cron::{manual_check, start_cron};

// 重导出 handlers, 让 main.rs 用 page_monitor::list_page_monitors 等原路径
pub use handlers::{
    create_page_monitor, delete_page_monitor, list_page_monitor_events, list_page_monitors,
    update_page_monitor,
};
