//! Skill 协议类型

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/skill.ts")]
pub struct SkillMarketplaceItem {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub description_zh: String,
    pub source: String,
    pub source_url: String,
    pub detail_url: String,
    pub author: String,
    pub stars: i32,
    pub tags: Vec<String>,
    pub category: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/skill.ts")]
pub struct SkillSearchResponse {
    pub skills: Vec<SkillMarketplaceItem>,
    pub total: i32,
    pub page: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../Client/web/src/lib/api/types/skill.ts")]
pub struct SkillTrendingResponse {
    pub skills: Vec<SkillMarketplaceItem>,
    pub total: i32,
    pub source: String,
    pub cached: bool,
}
