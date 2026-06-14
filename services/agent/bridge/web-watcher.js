/**
 * Web Page Watcher — polls monitored URLs, detects changes, extracts article
 * links, fetches full articles via readability, extracts images, summarizes
 * via MiniMax, and stores feed items visible in the frontend.
 *
 * Pipeline:
 *   detect change → cheerio extract links → for each new link:
 *     fetch → readability → save content+images → MiniMax summarize
 *     → feed_item (title, summary, content_path, original_url)
 */

import * as cheerio from "cheerio";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { query } from "./db.js";
import { log } from "./logger.js";
import { fetchArticle, saveReadingPage, hashContent, sanitizeName } from "./lib/article.js";



const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_URL = "https://api.minimaxi.com/v1/chat/completions";
const KNOWN_LINKS = new Map(); // monitor_id → Set of known article URLs

// ── helpers ──────────────────────────────────────────────────



// ── Extract article links from monitored page ───────────────

function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  const base = new URL(baseUrl);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const full = new URL(href, baseUrl).href;
      const u = new URL(full);
      // Skip non-article pages: anchors, javascript, mailto, off-site, list pages
      if (!full.startsWith("http")) return;
      if (full === baseUrl || full.includes("#")) return;
      if (u.host !== base.host) return;          // 跨站不算
      if (/\/rss|\/feed|\/tag|\/category|\/list\b/i.test(u.pathname)) return;
      if (/\/(app|quan|wap|m|static)\//i.test(u.pathname)) return;
      // Must look like an article: has digit segment in path
      if (!/\d+\.\w+$|\/\d+\b|\/\d+\/\d+\b/.test(u.pathname)) return;
      links.add(full);
    } catch { /* skip invalid URLs */ }
  });
  return [...links];
}

// ── MiniMax summarization ────────────────────────────────────

async function summarizeWithMiniMax(text, url) {
  if (!MINIMAX_API_KEY || !text) return null;
  try {
    const prompt = `请详细总结以下文章内容，要求：
1. 第一行：一个简短的标题（15字以内，不要用【】符号）
2. 空一行
3. 详细的摘要（不限字数，包含所有关键信息、数据、观点，尽可能完整）

文章URL: ${url}
文章内容: ${text.slice(0, 8000)}`;

    const res = await fetch(MINIMAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: "MiniMax-M2.7",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`MiniMax API ${res.status}`);
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";
    const lines = reply.trim().split("\n").filter(Boolean);
    const title = lines[0]?.trim().slice(0, 60) || "Untitled";
    const summary = lines.slice(1).join("\n").trim() || title;
    return { title, summary };
  } catch (e) {
    log.warn(`[web-watcher] MiniMax failed: ${e.message}`);
    return { title: text.slice(0, 60), summary: text.slice(0, 200) };
  }
}

// ── Feed management ──────────────────────────────────────────

async function ensureFeed(monitor) {
  const feedUrl = `page://monitor/${monitor.id}`;
  const existing = await query("SELECT id FROM feed WHERE url = $1", [feedUrl]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const result = await query(
    `INSERT INTO feed (user_id, url, title, category, enabled)
     VALUES ($1, $2, $3, 'page-monitor', true)
     ON CONFLICT (user_id, url) DO UPDATE SET title = $3
     RETURNING id`,
    [monitor.user_id, feedUrl, monitor.label || monitor.url],
  );
  return result.rows[0].id;
}

async function createFeedItem(feedId, monitor, summary, article, originalUrl, siteDir) {
  // Save the rendered reading page (title + content + original URL link)
  const { guid, htmlPath } = await saveReadingPage(siteDir, article, originalUrl);

  await query(
    `INSERT INTO feed_item (feed_id, guid, title, link, summary, published_at, read, starred)
     VALUES ($1, $2, $3, $4, $5, now(), false, false)
     ON CONFLICT (feed_id, guid) DO UPDATE
       SET title = $3, summary = $5, published_at = now()`,
    [feedId, guid, summary.title, originalUrl, `${summary.summary}\n\n<!-- content_path:${htmlPath} -->`],
  );
}


// ── Main check logic ─────────────────────────────────────────

async function checkOne(monitor) {
  try {
    const res = await fetch(monitor.url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "StudioArona-WebWatcher/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // 用 css_selector 提取关注区（默认 body）。空/null/未指定则用全页。
    const sel = (monitor.css_selector || "body").trim();
    let watchHtml = html;
    if (sel && sel !== "body") {
      const $w = cheerio.load(html);
      const $slice = $w(sel);
      if ($slice.length === 0) {
        log.warn(`[web-watcher] selector "${sel}" matched 0 nodes for ${monitor.label}, using full page`);
      } else {
        watchHtml = $slice.html() || html;
      }
    }
    const hash = hashContent(watchHtml);

    if (hash === monitor.last_hash) {
      await query("UPDATE page_monitor SET last_checked_at = now() WHERE id = $1", [monitor.id]);
      return;
    }

    log.info(`[web-watcher] CHANGE: ${monitor.label} (${monitor.url})`);

    await query(
      `UPDATE page_monitor SET last_hash = $1, last_changed_at = now(), last_checked_at = now()
       WHERE id = $2`,
      [hash, monitor.id],
    );

    // Extract article links from the watched region (or full page if body)
    const links = extractLinks(watchHtml, monitor.url);
    log.info(`[web-watcher] found ${links.length} links on ${monitor.label}`);

    // Track known links per monitor
    const known = KNOWN_LINKS.get(monitor.id) || new Set();
    KNOWN_LINKS.set(monitor.id, known);

    const newLinks = links.filter((l) => !known.has(l));
    if (newLinks.length === 0) return;

    // Prepare content directory: site/YYYY-MM-DD/
    const date = new Date().toISOString().slice(0, 10);
    const siteName = sanitizeName(monitor.label || new URL(monitor.url).hostname);
    const siteDir = path.join(DATA_DIR, siteName, date);
    await mkdir(siteDir, { recursive: true });

    // Create feed for this monitor
    const feedId = await ensureFeed(monitor);

    // Process new articles (limit to 10 per cycle)
    let count = 0;
    for (const link of newLinks.slice(0, 10)) {
      known.add(link);
      try {
        const article = await fetchArticle(link, siteDir);
        if (!article || !article.text) continue;
        let summary = await summarizeWithMiniMax(article.text, link);
        // 兜底：AI 总结失败时（无 key / API 错），用文章自己的 title + 开头段落
        if (!summary) {
          summary = {
            title: article.title || link.slice(-40),
            summary: article.text.slice(0, 300),
          };
        }
        await createFeedItem(feedId, monitor, summary, article, link, siteDir);
        count++;
      } catch (e) {
        log.warn(`[web-watcher] article failed ${link}: ${e.message}`);
      }
    }

    log.info(`[web-watcher] processed ${count} new articles for ${monitor.label}`);

    // 通知用户 (only if any new articles were processed)
    if (count > 0 && monitor.user_id) {
      // 收集本次 processed 0..count 的链接 → 拉回数据库刚写的
      try {
        const { rows } = await query(
          `SELECT title, link, summary, published_at FROM feed_item
           WHERE feed_id = $1
           ORDER BY published_at DESC
           LIMIT 20`,
          [feedId]
        );
        const items = rows.map((r) => ({
          title: r.title,
          link: r.link,
          summary: (r.summary || "").slice(0, 280),
          published: r.published_at,
        }));
        const url = `http://127.0.0.1:${process.env.GATEWAY_PORT || 8080}/internal/notify/rss`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: monitor.user_id, items }),
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json().catch(() => ({}));
        log.info(`[web-watcher] notify user ${monitor.user_id.slice(0,8)}…: ${res.status} ${JSON.stringify(data).slice(0, 80)}`);
      } catch (e) {
        log.warn(`[web-watcher] notify user failed: ${e.message}`);
      }
    }

    // Save article content to disk
    const indexPath = path.join(siteDir, "_index.json");
    const indexData = newLinks.slice(0, 10).map((l) => ({ url: l, fetched: true }));
    await writeFile(indexPath, JSON.stringify(indexData, null, 2));

  } catch (e) {
    log.warn(`[web-watcher] check failed for ${monitor.label}: ${e.message}`);
    await query("UPDATE page_monitor SET last_checked_at = now() WHERE id = $1", [monitor.id]);
  }
}

async function checkAll() {
  const now = Date.now();
  try {
    const result = await query(
      `SELECT * FROM page_monitor
       WHERE enabled = true
         AND (last_checked_at IS NULL
              OR last_checked_at < now() - (check_interval_min * interval '1 minute'))`,
    );
    log.info(`[web-watcher] checking ${result.rows.length} monitors`);
    for (const m of result.rows) {
      await checkOne(m);
    }
  } catch (e) {
    log.error("[web-watcher] checkAll error:", e.message);
  }
  log.info(`[web-watcher] cycle done in ${Date.now() - now}ms`);
}

let timer = null;

export function startWebWatcher(intervalMs = 60000) {
  log.info(`[web-watcher] starting (interval ${intervalMs}ms)`);
  checkAll();
  timer = setInterval(checkAll, intervalMs);
}

export function stopWebWatcher() {
  if (timer) { clearInterval(timer); timer = null; }
  log.info("[web-watcher] stopped");
}

// ── Standalone entrypoint ─────────────────────────────────────
// If invoked directly (e.g. by start.py as a separate process),
// start the polling loop. Otherwise the parent (server.js) imports
// startWebWatcher() and manages the timer.
if (import.meta.url === `file://${process.argv[1]}`) {
  const intervalMs = parseInt(process.env.WEB_WATCHER_INTERVAL_MS || "60000", 10);
  startWebWatcher(intervalMs);
  process.on("SIGINT", stopWebWatcher);
  process.on("SIGTERM", stopWebWatcher);
}
