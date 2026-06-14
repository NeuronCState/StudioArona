//! Generic API 消息 (错误 / 分页)

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/message.ts")]
pub struct ApiError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/message.ts")]
pub struct Paginated<T> {
    pub items: Vec<T>,
    pub total: i32,
    pub page: i32,
    pub limit: i32,
}
