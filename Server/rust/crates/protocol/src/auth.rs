//! Auth 协议类型 — 跟前端 apps/web/src/stores/auth.ts 同步

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::UserPublic;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/auth.ts")]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/auth.ts")]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user: UserPublic,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/auth.ts")]
pub struct RefreshRequest {
    pub refresh_token: String,
}
