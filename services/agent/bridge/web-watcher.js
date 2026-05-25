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
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";
import { log } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data", "pages");
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_URL = "https://api.minimaxi.com/v1/chat/completions";
const KNOWN_LINKS = new Map(); // monitor_id → Set of known article URLs

// ── helpers ──────────────────────────────────────────────────

function hashContent(text) {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9一-鿿_-]/g, "_").slice(0, 80);
}

// ── Article extraction with readability ─────────────────────

async function fetchArticle(url, siteDir, monitorId) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "StudioJavis-ArticleBot/1.0" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) return null;

    // Extract content images (skip tiny icons, ads, trackers)
    const imgUrls = [];
    const contentDom = new JSDOM(article.content || "");
    const imgs = contentDom.window.document.querySelectorAll("img");
    for (const img of imgs) {
      const src = img.getAttribute("src");
      const w = parseInt(img.getAttribute("width") || "0");
      const h = parseInt(img.getAttribute("height") || "0");
      if (src && (w > 100 || h > 100 || (!w && !h))) {
        // Filter likely ads/trackers
        if (!/pixel|track|beacon|ads|analytics|1x1/i.test(src)) {
          imgUrls.push(new URL(src, url).href);
        }
      }
    }

    // Download and save images
    const savedImgs = [];
    for (const imgUrl of imgUrls.slice(0, 5)) {
      try {
        const imgRes = await fetch(imgUrl, {
          signal: AbortSignal.timeout(10000),
          headers: { "User-Agent": "StudioJavis-ArticleBot/1.0" },
        });
        if (!imgRes.ok) continue;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const ext = imgUrl.split(".").pop()?.split("?")[0] || "jpg";
        const imgName = `${crypto.randomUUID().slice(0, 8)}.${ext}`;
        await writeFile(path.join(siteDir, imgName), buf);
        savedImgs.push(imgName);
      } catch { /* skip failed image downloads */ }
    }

    return {
      title: article.title || "",
      text: article.textContent || "",
      content: article.content || "",
      imageCount: savedImgs.length,
      siteDir: path.relative(DATA_DIR, siteDir),
    };
  } catch (e) {
    log.warn(`[web-watcher] article fetch failed for ${url}: ${e.message}`);
    return null;
  }
}

// ── Extract article links from monitored page ───────────────

function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const full = new URL(href, baseUrl).href;
      // Skip anchors, javascript, mailto, same-page links
      if (full.startsWith("http") && full !== baseUrl && !full.includes("#")) {
        links.add(full);
      }
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

async function createFeedItem(feedId, monitor, summary, article, originalUrl) {
  const guid = crypto.createHash("md5").update(originalUrl).digest("hex");

  // Save article HTML for reading page
  const htmlPath = `${article.siteDir}/${guid}.html`;
  const readingPage = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${summary.title}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.8;color:#1a1a1a}
img{max-width:100%;height:auto;border-radius:8px;margin:16px 0}
h1{font-size:1.6em;margin-bottom:8px}a{color:#2563eb;text-decoration:none}
.meta{color:#888;font-size:.85em;margin-bottom:24px}.source{margin-top:32px;padding-top:16px;border-top:1px solid #eee}
</style></head><body>
<h1>${summary.title}</h1>
<div class="meta">来源: ${new URL(originalUrl).hostname} · ${new Date().toLocaleDateString("zh-CN")}</div>
${article.content}
<div class="source"><a href="${originalUrl}" target="_blank">查看原文 →</a></div>
</body></html>`;
  const htmlFullPath = path.join(DATA_DIR, htmlPath);
  await mkdir(path.dirname(htmlFullPath), { recursive: true });
  await writeFile(htmlFullPath, readingPage, "utf-8");

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
      headers: { "User-Agent": "StudioJavis-WebWatcher/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const hash = hashContent(html);

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

    // Extract article links from the page
    const links = extractLinks(html, monitor.url);
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
      const article = await fetchArticle(link, siteDir, monitor.id);
      if (!article || !article.text) continue;

      const summary = await summarizeWithMiniMax(article.text, link);
      await createFeedItem(feedId, monitor, summary, article, link);
      count++;
    }

    log.info(`[web-watcher] processed ${count} new articles for ${monitor.label}`);

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
