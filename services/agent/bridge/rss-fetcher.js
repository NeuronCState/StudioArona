/**
 * RSS Fetcher Worker — polls subscribed feeds from PG and stores items.
 *
 * Runs as a background process alongside the bridge.
 * - Queries feed table for enabled subscriptions (per user)
 * - Parses RSS/Atom XML via rss-parser
 * - Detects new items via (feed_id, guid) UNIQUE constraint
 * - Stores items in feed_item table (ON CONFLICT DO NOTHING)
 * - Updates feed.last_fetched_at on each successful fetch
 * - Polling interval: 15 minutes
 * - Retry: 3 attempts with exponential backoff (2s/4s/8s)
 */

import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { query } from "./db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const FETCH_TIMEOUT_MS = 15000;              // 15s per feed
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;                  // 2s base for exponential backoff
const FETCHER_PORT = 8003;

const BRIDGE_URL = `http://127.0.0.1:${process.env.BRIDGE_PORT || 8001}`;

// ── rss-parser (lazy) ──────────────────────────────────────────
let Parser = null;
async function getParser() {
  if (!Parser) {
    try {
      const mod = await import("rss-parser");
      Parser = mod.default || mod.Parser;
    } catch {
      console.warn("[rss-fetcher] rss-parser not installed, using built-in regex parser");
      Parser = null;
    }
  }
  return Parser ? new Parser() : null;
}

// ── HTTP helpers ───────────────────────────────────────────────
function httpGetJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: FETCH_TIMEOUT_MS,
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 100)}`)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Fetch feeds from bridge API (fallback when DB not available) ──
async function fetchFeedsFromBridge() {
  try {
    const result = await httpGetJSON(BRIDGE_URL + "/api/feeds");
    return result.feeds || [];
  } catch (err) {
    console.error("[rss-fetcher] bridge fetch error:", err.message);
    return [];
  }
}

// ── Fetch feeds from PostgreSQL (primary path) ─────────────────
async function fetchFeedsFromDB() {
  try {
    const { rows } = await query(
      `SELECT id, user_id, url, title, category, enabled, last_fetched_at, created_at
       FROM feed
       WHERE enabled = true AND url NOT LIKE 'page://%'
       ORDER BY last_fetched_at ASC NULLS FIRST`
    );
    return rows;
  } catch (err) {
    console.error("[rss-fetcher] DB feed query error:", err.message);
    return [];
  }
}

async function fetchFeeds() {
  // Try DB first, fall back to bridge
  const dbFeeds = await fetchFeedsFromDB();
  if (dbFeeds.length > 0) return dbFeeds;
  console.log("[rss-fetcher] DB returned no feeds, trying bridge fallback...");
  return fetchFeedsFromBridge();
}

// ── RSS parsing ────────────────────────────────────────────────
async function parseRSS(url) {
  const parser = await getParser();

  if (parser) {
    // Use rss-parser library (supports RSS 2.0 + Atom)
    try {
      const feed = await parser.parseURL(url);
      return (feed.items || []).map((item) => ({
        guid: (item.guid || item.link || item.title || "").slice(0, 200),
        title: item.title || "",
        link: item.link || "",
        summary: item.contentSnippet || item.summary || item.content || "",
        published_at: item.pubDate || item.isoDate
          ? new Date(item.pubDate || item.isoDate).toISOString()
          : new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      }));
    } catch (err) {
      console.error(`[rss-fetcher] rss-parser error for ${url}:`, err.message);
      // Fall through to regex parser
    }
  }

  // Built-in regex parser as fallback
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const xml = await resp.text();
    return parseRSSXML(xml);
  } catch (err) {
    console.error(`[rss-fetcher] fetch error for ${url}:`, err.message);
    return [];
  }
}

function parseRSSXML(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;

  const pattern = xml.includes("<item") ? itemRegex : entryRegex;

  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractLinkHref(block);
    const description = extractTag(block, "description") || "";
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated") || "";
    const guid = extractTag(block, "guid") || link || title + pubDate;

    if (title && guid) {
      items.push({
        guid: guid.slice(0, 200),
        title: stripHTML(title),
        link: link || "",
        summary: stripHTML(description).slice(0, 500),
        published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      });
    }
  }

  return items;
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function extractLinkHref(block) {
  const m = block.match(/<link[^>]*href="([^"]+)"/i);
  return m ? m[1] : "";
}

function stripHTML(text) {
  return text.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, (e) => {
    const map = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
    return map[e] || "";
  });
}

// ── Retry wrapper ──────────────────────────────────────────────
async function withRetry(fn, label = "operation") {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s
      console.warn(`[rss-fetcher] ${label} attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        console.log(`[rss-fetcher] retrying in ${delay / 1000}s...`);
        await sleep(delay);
      } else {
        console.error(`[rss-fetcher] ${label} failed after ${MAX_RETRIES} attempts`);
        throw err;
      }
    }
  }
}

// ── Store feed items in PostgreSQL ─────────────────────────────
async function storeFeedItems(feedId, items) {
  if (!items.length) return { inserted: 0, newItems: [] };

  let inserted = 0;
  const newItems = [];
  for (const item of items) {
    try {
      // ON CONFLICT (feed_id, guid) DO NOTHING — dedup by guid
      const result = await query(
        `INSERT INTO feed_item (feed_id, guid, title, link, summary, published_at, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (feed_id, guid) DO NOTHING
         RETURNING id`,
        [feedId, item.guid, item.title, item.link, item.summary, item.published_at, item.fetched_at]
      );
      if (result.rowCount > 0) {
        inserted++;
        newItems.push({
          title: item.title || "(无标题)",
          link: item.link,
          summary: (item.summary || "").slice(0, 280),
          published: item.published_at,
        });
      }
    } catch (err) {
      console.error(`[rss-fetcher] insert error for feed=${feedId} guid=${item.guid}:`, err.message);
    }
  }
  return { inserted, newItems };
}

// ── Update last_fetched_at ─────────────────────────────────────
async function updateLastFetched(feedId) {
  try {
    await query(
      `UPDATE feed SET last_fetched_at = NOW() WHERE id = $1`,
      [feedId]
    );
  } catch (err) {
    console.error(`[rss-fetcher] update last_fetched_at error for ${feedId}:`, err.message);
  }
}

// ── Poll all feeds ─────────────────────────────────────────────
async function pollAll() {
  console.log("[rss-fetcher] polling feeds...");

  let feeds;
  try {
    feeds = await withRetry(() => fetchFeeds(), "fetchFeeds");
  } catch {
    console.error("[rss-fetcher] failed to fetch feed list, skipping this cycle");
    return;
  }

  if (!feeds || feeds.length === 0) {
    console.log("[rss-fetcher] no enabled feeds found");
    return;
  }

  console.log(`[rss-fetcher] found ${feeds.length} enabled feed(s)`);
  let totalNew = 0;
  // 按 user_id 聚合新条目 (用于末尾发邮件)
  const newByUser = new Map();

  for (const feed of feeds) {
    console.log(`[rss-fetcher] fetching: ${feed.url} (feed_id=${feed.id})`);

    let items;
    try {
      items = await withRetry(() => parseRSS(feed.url), `parseRSS(${feed.url})`);
    } catch {
      console.error(`[rss-fetcher] skipping feed ${feed.id} after retries exhausted`);
      continue;
    }

    if (items.length === 0) {
      console.log(`[rss-fetcher] ${feed.url}: 0 items parsed`);
      await updateLastFetched(feed.id);
      continue;
    }

    // Store in PG — dedup by (feed_id, guid)
    try {
      const { inserted, newItems } = await withRetry(
        () => storeFeedItems(feed.id, items),
        `storeFeedItems(${feed.id})`
      );
      console.log(`[rss-fetcher] ${feed.url}: ${items.length} parsed, ${inserted} new`);
      totalNew += inserted;
      if (newItems.length > 0 && feed.user_id) {
        const arr = newByUser.get(feed.user_id) || [];
        // 一封邮件最多 20 条（notifier 内部也截断）
        if (arr.length < 20) {
          arr.push(...newItems.slice(0, 20 - arr.length));
          newByUser.set(feed.user_id, arr);
        }
      }
    } catch {
      console.error(`[rss-fetcher] failed to store items for feed ${feed.id}`);
      continue;
    }

    // Update timestamp
    await updateLastFetched(feed.id);
  }

  console.log(`[rss-fetcher] cycle complete: ${totalNew} new items across ${feeds.length} feed(s)`);

  // 通知用户有新 RSS 更新（按 user_id 聚合，跨多个 feed）
  for (const [userId, items] of newByUser.entries()) {
    try {
      const url = `http://127.0.0.1:${process.env.GATEWAY_PORT || 8080}/internal/notify/rss`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, items }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json().catch(() => ({}));
      console.log(`[rss-fetcher] notify user ${userId.slice(0, 8)}…: ${res.status} ${JSON.stringify(data).slice(0, 80)}`);
    } catch (e) {
      console.warn(`[rss-fetcher] notify user ${userId.slice(0, 8)}… failed: ${e.message}`);
    }
  }
}

// ── Bootstrap ──────────────────────────────────────────────────
console.log(`[rss-fetcher] starting, refresh=${REFRESH_INTERVAL_MS / 60000}min, retries=${MAX_RETRIES}`);
pollAll();
setInterval(pollAll, REFRESH_INTERVAL_MS);

// ── Health + debug API ─────────────────────────────────────────
http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${FETCHER_PORT}`);
  res.setHeader("Content-Type", "application/json");

  if (url.pathname === "/api/feed-items") {
    // TODO: query from feed_item table instead of in-memory
    query(
      `SELECT fi.*, f.url as feed_url, f.title as feed_title
       FROM feed_item fi JOIN feed f ON fi.feed_id = f.id
       ORDER BY fi.published_at DESC LIMIT 200`
    ).then(({ rows }) => {
      res.end(JSON.stringify({ items: rows }));
    }).catch((err) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    });
  } else if (url.pathname === "/health") {
    query("SELECT count(*) as cnt FROM feed_item").then(({ rows }) => {
      res.end(JSON.stringify({ status: "ok", feed_items_total: parseInt(rows[0]?.cnt || "0", 10) }));
    }).catch(() => {
      res.end(JSON.stringify({ status: "ok", feed_items_total: "unknown" }));
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  }
}).listen(FETCHER_PORT, "127.0.0.1", () => {
  console.log(`[rss-fetcher] API on http://127.0.0.1:${FETCHER_PORT}`);
});
