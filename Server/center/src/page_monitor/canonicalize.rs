//! HTML canonicalization — 抽取目标区域 + 去噪声 + SHA-256.
//!
//! 独立模块, 给 cron / manual_check 复用.
//! 纯函数 + Lazy<Regex> 缓存, 零 I/O, 易测.

use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use sha2::{Digest, Sha256};

pub fn validate_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

pub fn content_hash(input: &str) -> String {
    // SHA-256 hex (DefaultHasher 不保证跨 rustc 版本稳定, 不适合作为持久化 hash)
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    format!("{:x}", h.finalize())
}

/// 噪声元素 + 注释的预编译正则.
static NOISE_TAGS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?is)<(?:script|style|noscript|nav|footer|header|aside|form|svg|iframe)\b[^>]*>.*?</(?:script|style|noscript|nav|footer|header|aside|form|svg|iframe)>",
    )
    .expect("noise tag regex")
});
static HTML_COMMENT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?s)<!--.*?-->").expect("html comment regex"));
/// F3 修复: 不要再 `\s+` 压平所有空白, 保留换行结构让 diff_lines 能算行级 diff.
/// 改用 `multi-space → single-space`, 保留 `\n`, 这样 summarize_change 拿到的 old/new
/// 仍有行结构 (而不是"一整行"), headline "新增/删除/修改 X 行" 有意义.
static MULTI_SPACE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[ \t]+").expect("multi-space regex"));
static MULTI_NEWLINE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\n{3,}").expect("multi-newline regex"));

/// 清洗 HTML: 移除噪声元素 + 注释, 规范化空白 (保留换行).
fn strip_noise(html: &str) -> String {
    let no_comments = HTML_COMMENT.replace_all(html, " ");
    NOISE_TAGS.replace_all(&no_comments, " ").into_owned()
}

/// 用 css_selector 从已清洗的 HTML 里抽取正文. selector 解析失败时 fallback 到 body.
/// 保留换行结构 (不再 join(" ") 把整段压扁).
fn extract_target_text(html: &str, css_selector: &str) -> String {
    let doc = Html::parse_document(html);
    let sel_str = if css_selector.trim().is_empty() {
        "body"
    } else {
        css_selector
    };
    let sel = match Selector::parse(sel_str) {
        Ok(s) => s,
        Err(_) => match Selector::parse("body") {
            Ok(s) => s,
            Err(_) => return html.to_string(),
        },
    };
    let mut parts: Vec<String> = Vec::new();
    for el in doc.select(&sel) {
        // scraper 0.20 的 text() 返回 Iterator<&str> — 用 collect + "\n" 拼接保留元素内换行
        let mut buf = String::new();
        for (i, t) in el.text().enumerate() {
            if i > 0 {
                buf.push('\n');
            }
            buf.push_str(t);
        }
        if !buf.trim().is_empty() {
            parts.push(buf);
        }
    }
    if parts.is_empty() {
        // selector 没匹配到 — 退化到整页 text (少见)
        let mut buf = String::new();
        for (i, t) in doc.root_element().text().enumerate() {
            if i > 0 {
                buf.push('\n');
            }
            buf.push_str(t);
        }
        buf
    } else {
        // 元素之间用双换行隔开 (段落感)
        parts.join("\n\n")
    }
}

/// 从原始 HTML 计算稳定的"canonical" hash + 用于展示的 normalized text.
/// 保留换行结构 — diff_lines 需要这个.
pub struct Canonical {
    pub hash: String,
    pub normalized_text: String,
}

pub fn canonicalize(raw_html: &str, css_selector: &str) -> Canonical {
    let stripped = strip_noise(raw_html);
    let target_text = extract_target_text(&stripped, css_selector);
    // 折叠多个空格/tab 为单个, 但保留 \n. 折叠连续多换行为双换行 (段落分隔).
    let s1 = MULTI_SPACE.replace_all(&target_text, " ");
    let s2 = MULTI_NEWLINE.replace_all(&s1, "\n\n");
    let normalized = s2.trim().to_string();
    let hash = content_hash(&normalized);
    Canonical {
        hash,
        normalized_text: normalized,
    }
}

/// 从 canonical text 生成展示用的摘要 (前 ~200 字符).
/// 仅作为 fallback 路径的备用接口, 主路径走 summarize_change → diff_lines.
#[allow(dead_code)]
pub fn summarize_canonical(text: &str) -> String {
    const PREVIEW_CHARS: usize = 200;
    if text.is_empty() {
        return "页面内容发生变化，但正文为空或无法抽取文本。".to_string();
    }
    let snippet: String = text.chars().take(PREVIEW_CHARS).collect();
    if text.chars().count() > PREVIEW_CHARS {
        format!("检测到页面内容变化。当前页面摘要: {snippet}…")
    } else {
        format!("检测到页面内容变化。当前页面摘要: {snippet}")
    }
}

// ─── 真正的变化摘要 (P1#4) ─────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffSummary {
    pub added: usize,
    pub removed: usize,
    pub modified: usize,
    /// 简短文本: "新增 N 行, 删除 M 行, 修改 K 行 + 前几行示例"
    pub headline: String,
    pub added_preview: Vec<String>,
    pub removed_preview: Vec<String>,
    pub mode: DiffMode,
}

#[derive(Debug, Clone, Copy, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiffMode {
    /// 确定性 line-level diff (永远可用)
    Fallback,
    /// 调用了 LLM (impl 详情见 try_llm_summarize, 当前未实现真实调用 → 永远 fallback)
    Llm,
}

/// 行级 LCS 差分: 返回 (added, removed, modified, preview lines).
///
/// 算法: 简单 set-based diff (O(n+m)). 对 50KB+ 的正文也很快. 不追求 Myers/Patience,
///       这种 diff 摘要给 LLM 当 prompt 上下文已经够用.
pub fn diff_lines(old: &str, new: &str) -> DiffSummary {
    let old_lines: Vec<&str> = split_lines_keep_order(old);
    let new_lines: Vec<&str> = split_lines_keep_order(new);
    let old_set: std::collections::HashSet<&str> = old_lines.iter().copied().collect();
    let new_set: std::collections::HashSet<&str> = new_lines.iter().copied().collect();

    let added: Vec<&str> = new_lines
        .iter()
        .copied()
        .filter(|l| !old_set.contains(l))
        .collect();
    let removed: Vec<&str> = old_lines
        .iter()
        .copied()
        .filter(|l| !new_set.contains(l))
        .collect();

    // modified ≈ min(added, removed) (粗略估计: 一行被改 = 删除旧 + 新增新)
    let modified = added.len().min(removed.len());
    let real_added = added.len().saturating_sub(modified);
    let real_removed = removed.len().saturating_sub(modified);

    let added_preview: Vec<String> = added
        .iter()
        .take(3)
        .map(|s| truncate_chars(s, 80))
        .collect();
    let removed_preview: Vec<String> = removed
        .iter()
        .take(3)
        .map(|s| truncate_chars(s, 80))
        .collect();

    let headline = if real_added == 0 && real_removed == 0 && modified == 0 {
        "内容无实质变化 (可能有空白/格式调整)".to_string()
    } else {
        format!(
            "新增 {} 行, 删除 {} 行, 修改 {} 行",
            real_added, real_removed, modified
        )
    };

    DiffSummary {
        added: real_added,
        removed: real_removed,
        modified,
        headline,
        added_preview,
        removed_preview,
        mode: DiffMode::Fallback,
    }
}

fn split_lines_keep_order(s: &str) -> Vec<&str> {
    s.split('\n').map(str::trim_end).collect()
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}

/// F3 修复: 真接可配 LLM. 之前 `try_llm_summarize` 永远返 None, 整个"智能变化摘要"路径
/// 形同虚设. 现在用环境变量 `PAGE_MONITOR_LLM_URL` 配 endpoint (OpenAI 兼容 /v1/chat/completions),
/// 可选, 没配就 None → caller 用 fallback diff.
///
/// 安全:
///   - 不发整段 plaintext, 只发 diff headline + added/removed preview
///   - 超时 10s, 不阻塞 cron
///   - 错误一律降级 fallback, 不影响 check_one 主路径
pub async fn try_llm_summarize(diff: &DiffSummary) -> Option<String> {
    let endpoint = std::env::var("PAGE_MONITOR_LLM_URL").ok()?;
    if endpoint.trim().is_empty() {
        return None;
    }
    let model = std::env::var("PAGE_MONITOR_LLM_MODEL").unwrap_or_else(|_| "gpt-4o-mini".into());
    let api_key = std::env::var("PAGE_MONITOR_LLM_API_KEY").ok();

    // 组装 prompt — 只给 diff 概要 + preview, 不发整段
    let prompt = format!(
        "你是一个网页内容变化摘要助手. 给定 diff, 用一句话中文总结这次变化的语义.\n\n\
         diff:\n- {}\n- 新增预览: {:?}\n- 删除预览: {:?}\n\n\
         要求: 1 句话, 不超过 80 字, 不要复述原句.",
        diff.headline, diff.added_preview, diff.removed_preview
    );

    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 120,
        "temperature": 0.2,
    });

    let mut req = reqwest::Client::new()
        .post(&endpoint)
        .json(&body)
        .timeout(std::time::Duration::from_secs(10));
    if let Some(k) = api_key {
        if !k.is_empty() {
            req = req.bearer_auth(k);
        }
    }

    let resp = req.send().await.ok()?;
    if !resp.status().is_success() {
        tracing::debug!(status = %resp.status(), "LLM endpoint returned non-success, fallback");
        return None;
    }
    let parsed: serde_json::Value = resp.json().await.ok()?;
    let content = parsed
        .get("choices")?
        .get(0)?
        .get("message")?
        .get("content")?
        .as_str()?
        .trim()
        .to_string();
    if content.is_empty() {
        return None;
    }
    Some(content)
}

/// 顶层入口: 给定新旧 canonical text, 返回 (text_to_use, summary, mode).
///
/// 流程: spec §6.3
///   1. 算 diff (fallback, 永远成功)
///   2. 尝试调 LLM (当前未实现 → None)
///   3. 用 diff.headline 当 fallback summary
pub async fn summarize_change(old: &str, new: &str) -> (DiffSummary, Option<String>, DiffMode) {
    let diff = diff_lines(old, new);
    let llm_summary = try_llm_summarize(&diff).await;
    let mode = if llm_summary.is_some() {
        DiffMode::Llm
    } else {
        DiffMode::Fallback
    };
    let summary = llm_summary.unwrap_or_else(|| diff.headline.clone());
    (diff, Some(summary), mode)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hash_hex(s: &str) -> String {
        let mut h = Sha256::new();
        h.update(s.as_bytes());
        format!("{:x}", h.finalize())
    }

    #[test]
    fn strip_noise_removes_script_style_nav_footer() {
        let html = r#"<html><head><style>body{color:red}</style><script>alert(1)</script></head>
<body><nav>menu</nav><article>content</article><footer>foot</footer></body></html>"#;
        let stripped = strip_noise(html);
        assert!(
            !stripped.contains("alert"),
            "script body should be stripped"
        );
        assert!(
            !stripped.contains("body{color:red}"),
            "style body should be stripped"
        );
        assert!(!stripped.contains("menu"), "nav text should be stripped");
        assert!(!stripped.contains("foot"), "footer text should be stripped");
        assert!(
            stripped.contains("content"),
            "article content should remain"
        );
    }

    #[test]
    fn strip_noise_removes_html_comments() {
        let html = "before <!-- secret --> after";
        let stripped = strip_noise(html);
        assert!(!stripped.contains("secret"));
        assert!(stripped.contains("before"));
        assert!(stripped.contains("after"));
    }

    #[test]
    fn canonical_hash_is_stable_across_whitespace_diffs() {
        let a = r#"<html><body><p>hello   world</p></body></html>"#;
        let b = r#"<html><body><p>hello world</p></body></html>"#;
        let c = r#"<html><body>
            <p>hello world</p>
        </body></html>"#;
        let ha = canonicalize(a, "body").hash;
        let hb = canonicalize(b, "body").hash;
        let hc = canonicalize(c, "body").hash;
        assert_eq!(ha, hb);
        assert_eq!(hb, hc);
    }

    #[test]
    fn canonical_hash_ignores_script_content_changes() {
        let a = r#"<html><body><article>hello</article><script>x=1</script></body></html>"#;
        let b = r#"<html><body><article>hello</article><script>x=999; alert('changed')</script></body></html>"#;
        assert_eq!(canonicalize(a, "body").hash, canonicalize(b, "body").hash);
    }

    #[test]
    fn canonical_hash_detects_real_content_change() {
        let a = r#"<html><body><article>v1</article></body></html>"#;
        let b = r#"<html><body><article>v2</article></body></html>"#;
        assert_ne!(canonicalize(a, "body").hash, canonicalize(b, "body").hash);
    }

    #[test]
    fn extract_target_text_respects_css_selector() {
        let html = r#"<html><body><div class="article">main story</div><div class="ad">buy now</div></body></html>"#;
        let text = extract_target_text(&strip_noise(html), ".article");
        assert!(text.contains("main story"));
        assert!(!text.contains("buy now"));
    }

    #[test]
    fn extract_target_text_falls_back_when_selector_invalid() {
        let html = r#"<html><body><p>hello</p></body></html>"#;
        let text = extract_target_text(html, "@@@not-a-selector@@@");
        assert!(text.contains("hello"));
    }

    #[test]
    fn content_hash_is_sha256_64_hex() {
        let h = content_hash("hello");
        assert_eq!(h.len(), 64);
        assert_eq!(h, hash_hex("hello"));
    }

    // ─── diff_lines / summarize_change ────────────────────────────────

    #[tokio::test]
    async fn diff_lines_detects_added() {
        let d = diff_lines("hello", "hello\nworld");
        assert_eq!(d.added, 1);
        assert_eq!(d.removed, 0);
        assert_eq!(d.modified, 0);
        assert!(d.added_preview.iter().any(|p| p.contains("world")));
    }

    #[tokio::test]
    async fn diff_lines_detects_removed() {
        let d = diff_lines("hello\nworld", "hello");
        assert_eq!(d.added, 0);
        assert_eq!(d.removed, 1);
    }

    #[tokio::test]
    async fn diff_lines_detects_modified() {
        let d = diff_lines("line 1\nline 2", "line 1\nline 2-changed");
        // 旧 "line 2" 被删, 新 "line 2-changed" 被加 → modified = 1
        assert_eq!(d.modified, 1);
        assert_eq!(d.added, 0);
        assert_eq!(d.removed, 0);
    }

    #[tokio::test]
    async fn diff_lines_no_change() {
        let d = diff_lines("a\nb", "a\nb");
        assert_eq!(d.added, 0);
        assert_eq!(d.removed, 0);
        assert!(d.headline.contains("无实质变化"));
    }

    #[tokio::test]
    async fn diff_lines_truncates_long_lines() {
        let long = "x".repeat(1000);
        let d = diff_lines("", &long);
        // 80 chars + 1 ellipsis char → 81 chars; bytes may be more if multi-byte
        assert!(d.added_preview[0].chars().count() <= 81);
    }

    #[tokio::test]
    async fn summarize_change_falls_back_when_no_llm() {
        // 当前 try_llm_summarize 返 None → mode = fallback, summary = diff.headline
        let (diff, summary, mode) = summarize_change("a", "a\nb").await;
        assert_eq!(mode, DiffMode::Fallback);
        assert_eq!(diff.added, 1);
        assert!(summary.is_some());
        let s = summary.unwrap();
        assert!(s.contains("新增") || s.contains("无实质变化"));
    }
}
