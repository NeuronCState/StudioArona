/**
 * Feed handler — CRUD for RSS feeds and feed items.
 *
 * Every query is scoped by ctx.userId for tenant isolation.
 */

import { query, requireUserId } from "../db/index.js";
import { createMonitor as createPageMonitor } from "./page-monitor.js";

// ── Feeds ──────────────────────────────────────────────────────

/**
 * GET /api/feeds — list feeds for current user.
 */
export async function listFeeds(req, ctx) {
  const userId = requireUserId(ctx);
  // 注意：前端 FeedsPage 同时调 /api/feeds 和 /api/page-monitors，
  // 列表/删除/详情/标记已读/星标 都按 kind 走对应表
  // 这里只返回真正的 RSS feed 行 (URL 以 http(s):// 开头)，不返回 web-watcher 写的 page:// 合成 feed
  const result = await query(
    `SELECT id, user_id, url, title, category, enabled, last_fetched_at, created_at
     FROM feed
     WHERE user_id = $1
       AND url NOT LIKE 'page://%'
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}

/**
 * POST /api/feeds — add a feed.
 */

// ── URL type sniff: "feed" (RSS/Atom/JSON) vs "page" (普通网页) ─────
function sniffFeedType(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    const q = u.search.toLowerCase();
    const host = u.hostname.toLowerCase();
    // 1) pathname 含 /feed /rss /atom
    if (/\/(feed|rss|atom)(\/|$|\?)/.test(p)) return "feed";
    // 2) 扩展名 .xml / .atom / .json (JSON Feed 常见)
    if (/\.(xml|atom|rss)$/.test(p)) return "feed";
    if (/\.json(\?|$)/.test(p) && /[?&]format=(feed|atom|rss)/.test(q)) return "feed";
    // 3) 查询参数 ?feed= / ?format=atom/rss/xml
    if (/[?&](feed|rss|atom|format)=(atom|rss|xml|feed)/.test(q)) return "feed";
    // 4) hostname 含 RSS 平台关键字
    if (host.includes("rss") || host.includes("rsshub") || host.includes("feedburner") || host.includes("feedly") || host.includes("feedproxy")) return "feed";
    return "page";
  } catch {
    return "page";
  }
}

export async function createFeed(req, ctx) {
  const userId = requireUserId(ctx);
  const { url, title, category } = req;

  if (!url) {
    const err = new Error("url is required");
    err.statusCode = 400;
    throw err;
  }

  const kind = sniffFeedType(url);

  if (kind === "page") {
    // 普通网页：走 web-watcher（page_monitor）
    const monitor = await createPageMonitor({ url, label: title || url, css_selector: "body", check_interval_min: 5 }, ctx);
    return {
      id: monitor.id,
      url: monitor.url,
      title: monitor.label,
      category: category || null,
      kind: "page",
      message: "已加入智能监控（web-watcher 5 min 轮询）",
    };
  }

  // 标准 RSS/Atom/JSON Feed
  const result = await query(
    `INSERT INTO feed (user_id, url, title, category)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, url) DO UPDATE SET title = COALESCE($3, feed.title)
     RETURNING *`,
    [userId, url, title || null, category || null],
  );
  return { ...result.rows[0], kind: "feed" };
}

/**
 * GET /api/feeds/:id — get a single feed.
 * Supports special "monitor:xxx" prefix to look up page monitor feeds.
 */
export async function getFeed(req, ctx) {
  const userId = requireUserId(ctx);
  let { feedId } = ctx;

  // Resolve monitor:xxx → page://monitor/xxx feed URL
  if (feedId.startsWith("monitor:")) {
    const monitorId = feedId.slice(8);
    const result = await query(
      "SELECT * FROM feed WHERE url = $1 AND user_id = $2",
      [`page://monitor/${monitorId}`, userId],
    );
    if (result.rows.length > 0) return result.rows[0];
    const err = new Error("Feed not found");
    err.statusCode = 404;
    throw err;
  }

  const result = await query(
    "SELECT * FROM feed WHERE id = $1 AND user_id = $2",
    [feedId, userId],
  );
  if (result.rows.length === 0) {
    const err = new Error("Feed not found");
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

/**
 * DELETE /api/feeds/:id — remove a feed.
 */
export async function deleteFeed(req, ctx) {
  const userId = requireUserId(ctx);
  const { feedId } = ctx;

  const result = await query(
    "DELETE FROM feed WHERE id = $1 AND user_id = $2 RETURNING id",
    [feedId, userId],
  );
  if (result.rows.length === 0) {
    const err = new Error("Feed not found");
    err.statusCode = 404;
    throw err;
  }
  return { deleted: true, id: feedId };
}

// ── Feed Items ──────────────────────────────────────────────────

/**
 * GET /api/feeds/:id/items — list items for a feed.
 * Supports special "monitor:xxx" prefix.
 */
export async function listFeedItems(req, ctx) {
  const userId = requireUserId(ctx);
  let { feedId } = ctx;

  // Resolve monitor:xxx → actual feed ID
  let actualFeedId = feedId;
  if (feedId.startsWith("monitor:")) {
    const monitorId = feedId.slice(8);
    const result = await query(
      "SELECT id FROM feed WHERE url = $1 AND user_id = $2",
      [`page://monitor/${monitorId}`, userId],
    );
    if (result.rows.length === 0) {
      const err = new Error("Feed not found");
      err.statusCode = 404;
      throw err;
    }
    actualFeedId = result.rows[0].id;
  } else {
    // Verify feed ownership via user_id
    const feedCheck = await query(
      "SELECT id FROM feed WHERE id = $1 AND user_id = $2",
      [feedId, userId],
    );
    if (feedCheck.rows.length === 0) {
      const err = new Error("Feed not found");
      err.statusCode = 404;
      throw err;
    }
  }

  const result = await query(
    `SELECT id, feed_id, guid, title, link, summary,
            published_at, read, starred, fetched_at
     FROM feed_item
     WHERE feed_id = $1
     ORDER BY published_at DESC NULLS LAST`,
    [actualFeedId],
  );
  return result.rows;
}

/**
 * POST /api/feeds/items/:id/read — mark as read/unread.
 */
export async function markRead(req, ctx) {
  const userId = requireUserId(ctx);
  const { itemId } = ctx;
  const { read } = req;

  // Verify feed ownership through feed_item → feed → user_id
  const result = await query(
    `UPDATE feed_item
     SET read = $1
     WHERE id = $2
       AND feed_id IN (SELECT id FROM feed WHERE user_id = $3)
     RETURNING id, read`,
    [read !== false, itemId, userId],
  );
  if (result.rows.length === 0) {
    const err = new Error("Feed item not found");
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

/**
 * POST /api/feeds/items/:id/star — toggle star.
 */
export async function toggleStar(req, ctx) {
  const userId = requireUserId(ctx);
  const { itemId } = ctx;
  const { starred } = req;

  const result = await query(
    `UPDATE feed_item
     SET starred = $1
     WHERE id = $2
       AND feed_id IN (SELECT id FROM feed WHERE user_id = $3)
     RETURNING id, starred`,
    [starred !== false, itemId, userId],
  );
  if (result.rows.length === 0) {
    const err = new Error("Feed item not found");
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}
