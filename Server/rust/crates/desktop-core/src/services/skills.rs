//! Skills 管理端点 — 从文件系统读取 ~/.hermes/profiles/<user>/skills/
//!
//! Skills 存储在文件系统而非数据库, 每个 skill 是一个目录包含 SKILL.md

use crate::error::AppError;
use crate::state::AppState;
use axum::{extract::State, response::IntoResponse, Json};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct Skill {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub content: String,
    pub origin: String,  // "user" or "hermes"
    pub path: String,
}

fn get_hermes_home() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".hermes").join("profiles")
}

fn get_user_skills_dir(user_id: &str) -> PathBuf {
    get_hermes_home().join(user_id).join("skills")
}

fn parse_skill_md(content: &str) -> (String, Option<String>) {
    // Parse SKILL.md: first line is # Name, rest is description
    let lines: Vec<&str> = content.lines().collect();
    if let Some(first) = lines.first() {
        let name = first.trim_start_matches('#').trim().to_string();
        let desc = if lines.len() > 1 {
            Some(lines[1..].join("\n").trim().to_string())
        } else {
            None
        };
        (name, desc)
    } else {
        ("Unnamed".to_string(), None)
    }
}

/// GET /api/skills
pub async fn list_skills(
    State(_state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = "4fe3c029-147c-4096-a8c5-d9564e49a13b"; // demo user
    let skills_dir = get_user_skills_dir(user_id);

    let mut skills = Vec::new();

    if skills_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&skills_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let skill_md = path.join("SKILL.md");
                    if skill_md.exists() {
                        if let Ok(content) = std::fs::read_to_string(&skill_md) {
                            let (name, description) = parse_skill_md(&content);
                            let slug = path.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown")
                                .to_string();

                            let origin = if path.to_string_lossy().contains("generated") {
                                "hermes"
                            } else {
                                "user"
                            };

                            skills.push(Skill {
                                name,
                                slug,
                                description,
                                content,
                                origin: origin.to_string(),
                                path: skill_md.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(Json(serde_json::json!({
        "skills": skills,
        "total": skills.len(),
        "user_id": user_id,
    })))
}