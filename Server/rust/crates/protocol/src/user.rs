//! User 协议类型

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/user.ts")]
pub struct UserPublic {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/user.ts")]
pub struct UserPreference {
    pub user_id: String,
    pub key: String,
    pub value: serde_json::Value,
}
