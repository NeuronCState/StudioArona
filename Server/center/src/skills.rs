use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{auth::extract_user_id, config::AppEnv, AppState};

// ─── Marketplace (mock) ─────────────────────────────────────────────────────

/// Marketplace "registry" is a static mock until the real registry ships.
/// Real registry / categories / search belong to a separate task (TODO).
///
/// spec §10.1: 接入真实数据源, 或显式 dev-only. 当前实现采用后者:
///   - dev mode: 返回静态 mock (跟之前一样, 不报错)
///   - production mode: 端点返 503 "marketplace not configured", 不暴露 mock
fn marketplace_metadata(slug: &str) -> Value {
    json!({
        "slug": slug,
        "name": slug,
        "description": format!("Marketplace skill `{}` (metadata from local mock)", slug),
        "version": "0.1.0",
        "category": "general",
        "source": "marketplace",
    })
}

/// Mock skill catalog — used by /categories, /trending, /search, /installed.
/// Each entry maps a marketplace slug → display metadata. Categories align
/// with the client-side DOMAIN_ORDER in MarketplaceTab.tsx so client-side
/// keyword filtering has something to match against.
type MockCatalogEntry = (
    &'static str,
    &'static str,
    &'static str,
    &'static [&'static str],
    &'static [&'static str],
    u32,
);
fn mock_catalog() -> &'static [MockCatalogEntry] {
    &[
        // slug, name, category, tags, description keywords, stars
        (
            "frontend-react",
            "Frontend React",
            "development",
            &["react", "frontend", "ui", "web"],
            &["React", "frontend", "组件"],
            1820,
        ),
        (
            "backend-fastapi",
            "Backend FastAPI",
            "development",
            &["python", "backend", "api", "fastapi"],
            &["FastAPI", "Python", "REST"],
            2410,
        ),
        (
            "mobile-flutter",
            "Mobile Flutter",
            "development",
            &["flutter", "mobile", "dart", "ios", "android"],
            &["Flutter", "跨平台"],
            980,
        ),
        (
            "fullstack-nextjs",
            "Full-stack Next.js",
            "development",
            &["nextjs", "react", "fullstack", "ssr"],
            &["Next.js", "SSR"],
            3050,
        ),
        (
            "docker-compose",
            "Docker Compose",
            "devops",
            &["docker", "container", "compose", "devops"],
            &["Docker", "容器"],
            1740,
        ),
        (
            "kubernetes-ops",
            "Kubernetes Ops",
            "devops",
            &["kubernetes", "k8s", "devops", "cloud"],
            &["Kubernetes", "K8s"],
            2210,
        ),
        (
            "terraform-iac",
            "Terraform IaC",
            "devops",
            &["terraform", "iac", "aws", "gcp", "azure"],
            &["Terraform", "基础设施"],
            1560,
        ),
        (
            "ansible-playbooks",
            "Ansible Playbooks",
            "devops",
            &["ansible", "automation", "config"],
            &["Ansible", "自动化"],
            880,
        ),
        (
            "ml-pytorch",
            "ML PyTorch",
            "data-ai",
            &["pytorch", "ml", "deep-learning", "ai"],
            &["PyTorch", "深度学习"],
            3120,
        ),
        (
            "llm-prompt-eng",
            "LLM Prompt Engineering",
            "data-ai",
            &["llm", "prompt", "gpt", "ai", "rag"],
            &["LLM", "Prompt", "RAG"],
            2750,
        ),
        (
            "data-analysis-pandas",
            "Data Analysis Pandas",
            "data-ai",
            &["pandas", "data", "analytics", "python"],
            &["Pandas", "数据分析"],
            1340,
        ),
        (
            "vector-db-rag",
            "Vector DB RAG",
            "data-ai",
            &["rag", "vector", "embedding", "ai"],
            &["RAG", "向量数据库"],
            1920,
        ),
        (
            "design-figma",
            "Design Figma",
            "design",
            &["figma", "design", "ui", "ux"],
            &["Figma", "UI设计"],
            1180,
        ),
        (
            "tailwind-ui",
            "Tailwind UI Kit",
            "design",
            &["tailwind", "css", "design", "ui"],
            &["Tailwind", "UI"],
            2890,
        ),
        (
            "postgres-sql",
            "PostgreSQL SQL",
            "databases",
            &["postgres", "sql", "database", "postgresql"],
            &["PostgreSQL", "SQL"],
            2050,
        ),
        (
            "mongodb-nosql",
            "MongoDB NoSQL",
            "databases",
            &["mongodb", "nosql", "database"],
            &["MongoDB", "NoSQL"],
            1430,
        ),
        (
            "redis-cache",
            "Redis Cache",
            "databases",
            &["redis", "cache", "database"],
            &["Redis", "缓存"],
            1610,
        ),
        (
            "testing-jest",
            "Testing Jest",
            "testing-security",
            &["jest", "testing", "test"],
            &["Jest", "单元测试"],
            1680,
        ),
        (
            "security-audit",
            "Security Audit",
            "testing-security",
            &["security", "audit", "vuln"],
            &["安全", "审计"],
            740,
        ),
        (
            "documentation-mkdocs",
            "Documentation MkDocs",
            "documentation",
            &["docs", "markdown", "documentation"],
            &["MkDocs", "文档"],
            690,
        ),
        (
            "blog-seo",
            "Blog SEO",
            "content-media",
            &["blog", "seo", "content", "article"],
            &["博客", "SEO"],
            520,
        ),
        (
            "video-ffmpeg",
            "Video ffmpeg",
            "content-media",
            &["video", "ffmpeg", "media"],
            &["ffmpeg", "视频处理"],
            980,
        ),
        (
            "project-mgmt",
            "Project Management",
            "business",
            &["project", "management", "planning"],
            &["项目管理", "OKR"],
            410,
        ),
        (
            "cli-productivity",
            "CLI Productivity",
            "tools",
            &["cli", "shell", "bash", "productivity"],
            &["CLI", "Shell"],
            1380,
        ),
        (
            "git-workflow",
            "Git Workflow",
            "tools",
            &["git", "workflow", "version-control"],
            &["Git", "工作流"],
            1850,
        ),
        (
            "automation-n8n",
            "Automation n8n",
            "tools",
            &["automation", "workflow", "n8n"],
            &["自动化", "n8n"],
            1120,
        ),
    ]
}

fn mock_skill_json(slug: &str) -> Option<Value> {
    let catalog = mock_catalog();
    catalog.iter().find(|(s, _, _, _, _, _)| *s == slug).map(
        |(slug, name, category, tags, desc_kws, stars)| {
            let description = format!(
                "关于 {} 的实用技能集: 涵盖 {} 等常见场景, 适合 {} 工程师快速上手。",
                name,
                desc_kws.join("、"),
                category,
            );
            json!({
                "slug": slug,
                "name": name,
                "description": description,
                "description_zh": description,
                "source": "skillsmp",
                "source_url": format!("https://skillsmp.com/skills/{}", slug),
                "detail_url": format!("https://skillsmp.com/skills/{}", slug),
                "author": "skillsmp-community",
                "stars": stars,
                "tags": tags,
                "category": category,
                "updated_at": 1718000000i64,
            })
        },
    )
}

fn all_mock_skills() -> Vec<Value> {
    mock_catalog()
        .iter()
        .map(|(slug, _, _, _, _, _)| {
            mock_skill_json(slug).expect("catalog entry must produce a skill")
        })
        .collect()
}

fn categories_response() -> Value {
    // 跟 client DOMAIN_ORDER 对齐 — 每个 domain 给一组 child_slugs + child_names,
    // 让 client matchCategory() 在子分类名上能匹配上.
    let cats = vec![
        (
            "development",
            "开发",
            &["frontend", "backend", "mobile", "full-stack", "web"][..],
        ),
        (
            "devops",
            "运维",
            &[
                "docker",
                "kubernetes",
                "terraform",
                "ansible",
                "helm",
                "cloud",
            ][..],
        ),
        (
            "data-ai",
            "数据与AI",
            &["ml", "llm", "rag", "data-analysis", "embedding", "vector"][..],
        ),
        (
            "design",
            "设计",
            &["ui", "ux", "figma", "tailwind", "css"][..],
        ),
        (
            "databases",
            "数据库",
            &["postgres", "sql", "mongodb", "nosql", "redis"][..],
        ),
        (
            "testing-security",
            "测试安全",
            &["testing", "security", "audit", "jest"][..],
        ),
        (
            "documentation",
            "文档",
            &["docs", "markdown", "guide", "readme"][..],
        ),
        (
            "content-media",
            "内容媒体",
            &["blog", "video", "audio", "media"][..],
        ),
        (
            "business",
            "商业",
            &["sales", "marketing", "finance", "project-management"][..],
        ),
        (
            "tools",
            "工具",
            &["cli", "git", "automation", "ide", "productivity"][..],
        ),
    ];
    let categories: Vec<Value> = cats
        .iter()
        .map(|(domain, name, children)| {
            json!({
                "domain": domain,
                "domain_name": name,
                "slug": domain,
                "name": name,
                "count": mock_catalog().iter().filter(|(_, _, cat, _, _, _)| cat == domain).count(),
                "child_slugs": children,
                "child_names": children,
            })
        })
        .collect();
    json!({
        "categories": categories,
        "total": categories.len(),
    })
}

// ─── Marketplace listing endpoints ─────────────────────────────────────────

/// GET /api/skills/marketplace/categories
///
/// Returns the static mock taxonomy. The real registry would call into
/// skillsmp / anthropic MCP list_categories with a 24h cache; for now we
/// serve a hard-coded list keyed off the client's DOMAIN_ORDER.
///
/// spec §10.1: marketplace 在 production 模式不可用 (直到接真 registry).
/// dev 模式返 mock; production 返 503 "marketplace not configured".
fn require_dev_marketplace(state: &AppState) -> Result<(), (StatusCode, Json<Value>)> {
    if state.config.env == AppEnv::Production {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "marketplace not configured",
                "reason": "static mock registry is dev-only; production requires real registry backend (skillsmp/anthropic MCP)"
            })),
        ));
    }
    Ok(())
}

pub async fn marketplace_categories(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (_uid, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    require_dev_marketplace(&state)?;
    Ok(Json(categories_response()))
}

/// GET /api/skills/marketplace/trending?window=all|week|month&limit=30
pub async fn marketplace_trending(
    State(state): State<AppState>,
    Query(params): Query<TrendingParams>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (_uid, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    require_dev_marketplace(&state)?;
    let mut skills = all_mock_skills();
    // 按 stars 降序
    skills.sort_by(|a, b| {
        let sa = a.get("stars").and_then(|v| v.as_u64()).unwrap_or(0);
        let sb = b.get("stars").and_then(|v| v.as_u64()).unwrap_or(0);
        sb.cmp(&sa)
    });
    skills.truncate(params.limit.unwrap_or(30));
    Ok(Json(json!({
        "skills": skills,
        "total": skills.len(),
        "cached": true,
    })))
}

#[derive(Deserialize, Default)]
pub struct TrendingParams {
    #[serde(default)]
    #[allow(dead_code)] // 保留以便将来真 registry 接 window=week|month 过滤
    pub window: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

/// GET /api/skills/marketplace/search?q=&category=&page=&limit=&sortBy=
pub async fn marketplace_search(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (_uid, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    require_dev_marketplace(&state)?;
    let q = params.q.unwrap_or_default().to_lowercase();
    let category = params.category.as_deref().unwrap_or("");
    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(20);

    let mut matched: Vec<Value> = all_mock_skills()
        .into_iter()
        .filter(|s| {
            // category 过滤
            if !category.is_empty() {
                let cat = s.get("category").and_then(|v| v.as_str()).unwrap_or("");
                if cat != category {
                    return false;
                }
            }
            // q 过滤 — 命中 name / description / tags / author 任一字段
            if q.is_empty() || q == "skill" {
                return true; // 默认 q 时返回全集, 让空搜索有内容
            }
            let name = s
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let desc = s
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let author = s
                .get("author")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let tags: Vec<String> = s
                .get("tags")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            name.contains(&q)
                || desc.contains(&q)
                || author.contains(&q)
                || tags.iter().any(|t| t.to_lowercase().contains(&q))
        })
        .collect();

    // 排序: sortBy=stars 时按 stars 降序; 否则保留原序
    if params.sort_by.as_deref() == Some("stars") {
        matched.sort_by(|a, b| {
            let sa = a.get("stars").and_then(|v| v.as_u64()).unwrap_or(0);
            let sb = b.get("stars").and_then(|v| v.as_u64()).unwrap_or(0);
            sb.cmp(&sa)
        });
    }

    let total = matched.len();
    let start = (page - 1) * limit;
    let page_slice: Vec<Value> = matched.into_iter().skip(start).take(limit).collect();

    Ok(Json(json!({
        "skills": page_slice,
        "total": total,
        "page": page,
    })))
}

#[derive(Deserialize, Default)]
pub struct SearchParams {
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub page: Option<usize>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(rename = "sortBy")]
    #[serde(default)]
    pub sort_by: Option<String>,
}

/// GET /api/skills/marketplace/installed — 已安装的 marketplace skills (打 installed 标记用)
pub async fn marketplace_installed(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    require_dev_marketplace(&state)?;

    // 从 DB 拉已装的 (slug, name) 对
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT slug, COALESCE(name, slug) FROM skills WHERE user_id = $1::uuid ORDER BY installed_at DESC LIMIT 200",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let slugs: Vec<String> = rows.iter().map(|(s, _)| s.clone()).collect();
    let skills: Vec<Value> = rows
        .iter()
        .map(|(slug, name)| {
            // 已装的如果在 catalog 里就拿 catalog 元数据; 不在就只返回 slug + name (兜底)
            if let Some(mut v) = mock_skill_json(slug) {
                if let Some(obj) = v.as_object_mut() {
                    obj.insert("name".to_string(), json!(name));
                    obj.insert("installed".to_string(), json!(true));
                }
                v
            } else {
                json!({
                    "slug": slug,
                    "name": name,
                    "description": format!("已安装技能: {}", name),
                    "source": "marketplace",
                    "installed": true,
                })
            }
        })
        .collect();

    Ok(Json(json!({
        "skills": skills,
        "slugs": slugs,
        "total": slugs.len(),
    })))
}

// ─── Install ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct InstallRequest {
    pub slug: String,
    /// Optional override; mostly for tests / local imports.
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
}

/// POST /api/skills/marketplace/install
///
/// Inserts a row into `skills` for the calling user. If the row already
/// exists (same slug), the existing row is returned (idempotent install).
///
/// We *always* succeed when the slug is non-empty — the marketplace is a
/// mock registry, so there's no upstream validation step. When the real
/// registry lands, this is where the lookup / fetch happens.
pub async fn install_skill(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<InstallRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;
    require_dev_marketplace(&state)?;

    let slug = input.slug.trim().to_string();
    if slug.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "slug is required"})),
        ));
    }

    // Pull metadata from the mock marketplace; let explicit body fields win.
    let meta = marketplace_metadata(&slug);
    let name = input.name.unwrap_or_else(|| {
        meta.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&slug)
            .to_string()
    });
    let version = input.version.unwrap_or_else(|| {
        meta.get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("0.1.0")
            .to_string()
    });
    let description = input.description.or_else(|| {
        meta.get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    });
    let category = input.category.or_else(|| {
        meta.get("category")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    });

    // Idempotent insert: if (user_id, slug) already exists, keep it and return
    // the existing row instead of erroring.
    let row: (String, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
        "INSERT INTO skills (user_id, slug, name, version, description, category, source)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 'marketplace')
         ON CONFLICT (user_id, slug) DO UPDATE SET slug = EXCLUDED.slug
         RETURNING id::text, installed_at",
    )
    .bind(&user_id)
    .bind(&slug)
    .bind(&name)
    .bind(&version)
    .bind(&description)
    .bind(&category)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    let (id, installed_at) = row;
    tracing::info!(user_id = %user_id, slug = %slug, "skill installed");

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "installed": true,
            "skill": {
                "id": id,
                "slug": slug,
                "name": name,
                "version": version,
                "description": description,
                "category": category,
                "source": "marketplace",
                "installed_at": installed_at,
            }
        })),
    ))
}

// ─── List ──────────────────────────────────────────────────────────────────

/// GET /api/skills/installed — list skills installed by the calling user.
pub async fn list_installed_skills(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            String,
            chrono::DateTime<chrono::Utc>,
        ),
    >(
        "SELECT id::text, slug, name, version, description, category, source, installed_at
         FROM skills WHERE user_id = $1::uuid
         ORDER BY installed_at DESC LIMIT 200",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.0,
                "slug": r.1,
                "name": r.2,
                "version": r.3,
                "description": r.4,
                "category": r.5,
                "source": r.6,
                "installed_at": r.7,
            })
        })
        .collect();

    Ok(Json(json!(items)))
}

// ─── Uninstall ──────────────────────────────────────────────────────────────

/// DELETE /api/skills/:slug — uninstall a skill by slug for the calling user.
pub async fn uninstall_skill(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (user_id, _, _) =
        extract_user_id(&headers, &state.config.jwt_secret).map_err(|(s, v)| (s, Json(v)))?;

    let affected = sqlx::query("DELETE FROM skills WHERE user_id = $1::uuid AND slug = $2")
        .bind(&user_id)
        .bind(&slug)
        .execute(&state.db)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    if affected.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "skill not found"})),
        ));
    }

    tracing::info!(user_id = %user_id, slug = %slug, "skill uninstalled");
    Ok(StatusCode::NO_CONTENT)
}
