//! Schedule 协议类型

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/schedule.ts")]
pub struct ScheduleEvent {
    pub id: String,
    pub title: String,
    pub body: Option<String>,
    pub starts_at: DateTime<Utc>,
    pub location: Option<String>,
    pub source: String,
}
