/**
 * Studio Arona — Agent Bridge
 *
 * - Accepts SSE connections from frontend (aligned with 00 §3.2)
 * - Calls LLM Gateway as subprocess for AI responses
 * - Session lifecycle: TTL cleanup, reconnection via Last-Event-ID
 * - Safety policy: risk-based skill execution (low/medium/high)
 * - Feeds, schedules, preferences CRUD (in-memory, W4+ → PG)
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { scanInjection } from "./injection-guard.js";
import { saveMessage, getSessionMessages, searchMessages, buildMemoryContext, ensureSession, endSession } from "./memory.js";
import { runSummarizerPipeline } from "./summarizer-pipeline.js";
import { handlePresenceEvent, adoptGuestHistory, getActiveGuests } from "./voice-flow.js";
import { ttsConvert, cleanupTTS } from "./tts.js";
import { fetchArticle, saveReadingPage, sanitizeName, DATA_DIR as ARTICLE_DIR } from "./lib/article.js";

// LLM Gateway direct URL (services/llm_gateway) — used to fetch per-user
// USER.md / MEMORY.md so the agent has user identity in its context.
const LLM_GATEWAY_DIRECT = process.env.LLM_GATEWAY_DIRECT_URL || "http://127.0.0.1:8645";

/**
 * Fetch per-user profile (USER.md + MEMORY.md) from LLM Gateway. Returns
 * {user_md, memory_md} or null on failure (silent — non-fatal).
 */
async function fetchUserProfile(userId) {
  if (!userId) return null;
  try {
    const r = await fetch(`${LLM_GATEWAY_DIRECT}/v1/users/${encodeURIComponent(userId)}/memory`, {
      // LLM Gateway memory endpoint has no auth requirement; we add X-User-Id
      // for log correlation.
      headers: { "X-User-Id": String(userId) },
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.user_md && !data.memory_md) return null;
    return { user_md: data.user_md || "", memory_md: data.memory_md || "" };
  } catch {
    return null;
  }
}
import { streamMinimax, warmupCache } from "./minimax.js";
import fs from "node:fs";
import { query } from "./db.js";
import * as scheduleHandler from "./handlers/schedules.js";
import * as feedHandler from "./handlers/feeds.js";
import * as memoryHandler from "./handlers/memory.js";
import * as pageMonitorHandler from "./handlers/page-monitor.js";
import { startWebWatcher } from "./web-watcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(AGENT_DIR, "data", "pages");

const PORT = process.env.BRIDGE_PORT || 8001;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minute session TTL

// ── In-memory stores ──────────────────────────────────────────
const feeds = [];
const schedules = [];
const preferences = new Map();   // user_id → { key: value }
const sessions = new Map();      // session_id → { created_at, last_msg_at, message_ids[] }
const sseClients = new Set();

// ── Skill risk definitions ─────────────────────────────────────
const SKILL_RISKS = {
  "vm.create": "high",
  "vm.destroy": "high",
  "vm.start": "medium",
  "vm.stop": "medium",
  "ha.toggle": "medium",
  "schedules.create": "medium",
  "schedules.delete": "medium",
  "feeds.add": "low",
  "feeds.delete": "low",
  "nas.list_recent": "low",
  "nas.search": "low",
  "system.metrics_snapshot": "low",
  "network.list_devices": "low",
  "meta.update_preference": "low",
  "meta.recall_memory": "low",
  "ui.navigate": "low",
  "ui.render_card": "low",
  "ui.toast": "low",
  "ui.confirm": "low",
};

// ── Session management ─────────────────────────────────────────

async function createSession(userId, mode = "text") {
  const id = randomUUID();
  // Generate a proper UUID for default/guest users
  const uid = userId || randomUUID();
  sessions.set(id, {
    user_id: uid,
    mode,
    created_at: Date.now(),
    last_msg_at: null,
    message_ids: [],
  });
  await ensureSession(id, uid, mode);
  return id;
}

function recordMessage(sessionId, messageId) {
  const s = sessions.get(sessionId);
  if (s) {
    s.last_msg_at = Date.now();
    s.message_ids.push(messageId);
  }
}

// Session end triggers (3 conditions):
//   1. Explicit POST /api/chat/sessions/:id/end
//   2. Idle timeout: 15 min since last message
//   3. TTL timeout: 30 min total session lifetime
const SESSION_IDLE_MS = 15 * 60 * 1000; // 15 min idle

// Cleanup stale sessions + trigger summarizer every 5 min
setInterval(() => {
  const now = Date.now();
  const ttlCutoff = now - SESSION_TTL_MS;
  const idleCutoff = now - SESSION_IDLE_MS;

  for (const [id, s] of sessions) {
    const expired = (s.last_msg_at && s.last_msg_at < ttlCutoff)
      || (!s.last_msg_at && s.created_at < ttlCutoff);
    const idle = s.last_msg_at && s.last_msg_at < idleCutoff;

    if (expired || idle) {
      // Run summarizer pipeline asynchronously — never blocks cleanup
      runSummarizerPipeline(id, s.user_id).catch(() => {});
      sessions.delete(id);
      endSession(id).catch(() => {});
    }
  }
}, 5 * 60 * 1000);

// ── SSE helpers ────────────────────────────────────────────────

function sseSend(res, event, data, id) {
  let line = `event: ${event}\n`;
  if (id) line += `id: ${id}\n`;
  line += `data: ${JSON.stringify(data)}\n\n`;
  res.write(line);
}

function broadcastUiAction(action) {
  for (const res of sseClients) {
    try { sseSend(res, "ui_action", action); }
    catch { sseClients.delete(res); }
  }
}

// ── Safety policy ──────────────────────────────────────────────

function checkSkillRisk(skillName) {
  const risk = SKILL_RISKS[skillName] || "low";
  return {
    allowed: risk !== "high",
    requiresConfirm: risk === "high",
    risk,
    reason: risk === "high"
      ? `Skill "${skillName}" 是高危操作，需要用户二次确认`
      : "",
  };
}

// ── Agent response streaming ───────────────────────────────────

async function streamAgentResponse(sessionId, userId, message, res, { lastEventId = null } = {}) {
  const messageId = `m_${randomUUID().slice(0, 12)}`;
  const eventId = parseInt(lastEventId) || 0;

  // Check for reconnection — if Last-Event-ID present, skip to resuming
  if (eventId > 0) {
    sseSend(res, "session_started", { session_id: sessionId }, eventId + 1);
    // In future: replay missed events from session store
    sseSend(res, "token", { delta: "（会话恢复）", index: eventId }, eventId + 2);
    return;
  }

  sseSend(res, "session_started", { session_id: sessionId }, 1);
  recordMessage(sessionId, messageId);

  // Injection scan
  const injectionCheck = scanInjection(message);
  if (!injectionCheck.isSafe) {
    sseSend(res, "error", {
      code: "INJECTION_BLOCKED",
      message: "检测到潜在的提示注入，阿洛娜已拒绝处理。",
    }, 2);
    sseSend(res, "done", { message_id: messageId, tokens: 0 }, 3);
    return;
  }

  // Check message for skill invocation patterns
  const skillMatch = message.match(/^!(\S+)\s*(.*)$/);
  if (skillMatch) {
    const [_, skill, args] = skillMatch;
    const policy = checkSkillRisk(skill);

    if (!policy.allowed) {
      // Push confirm to frontend, wait for user
      const confirmId = `cf_${randomUUID().slice(0, 8)}`;
      sseSend(res, "ui_action", {
        type: "confirm",
        confirm_id: confirmId,
        message: `技能 "${skill}" 为高危操作，${policy.reason}`,
        skill,
        args: args || "{}",
      }, 2);
      sseSend(res, "done", { message_id: messageId, tokens: 0 }, 3);
      return;
    }

    sseSend(res, "tool_call", {
      id: `tc_${randomUUID().slice(0, 8)}`,
      skill,
      args: parseSkillArgs(args),
    }, 2);

    sseSend(res, "tool_result", {
      id: `tc_${randomUUID().slice(0, 8)}`,
      ok: true,
      summary: `${skill} 请求已接收（risk: ${policy.risk}）`,
    }, 3);
  }

  // Build memory context + save user message in parallel
  const [memContext, _saved, userProfile] = await Promise.all([
    buildMemoryContext(userId),
    saveMessage(sessionId, userId, "user", message),
    fetchUserProfile(userId),  // USER.md + MEMORY.md from LLM Gateway
  ]);
  const contextBlocks = [];
  if (userProfile?.user_md) {
    contextBlocks.push(`[用户档案]\n${userProfile.user_md}`);
  }
  if (userProfile?.memory_md) {
    contextBlocks.push(`[长期记忆]\n${userProfile.memory_md}`);
  }
  if (memContext) {
    contextBlocks.push(`[最近对话记录]\n${memContext}`);
  }
  const augmentedMessage = contextBlocks.length
    ? `${contextBlocks.join("\n\n")}\n\n[当前消息]\n${message}`
    : message;

  // ── Agent response ──
  // Call LLM Gateway (services/llm_gateway) which handles per-user Hermes
  // daemon lifecycle, context injection, and thinking-tag stripping.
  const startTime = Date.now();
  const userSessionId = `user-${userId}`;
  let evId = 10;
  let fullText = "";

  try {
    // ── LLM Gateway streaming via MiniMax-compatible SSE ──
      const ttsPromise = ttsConvert(augmentedMessage);
      let firstToken = true;

      for await (const token of streamMinimax(augmentedMessage, memContext)) {
        if (firstToken) {
          console.log(`[bridge] LLM TTFT: ${Date.now() - startTime}ms`);
          firstToken = false;
        }
        fullText += token;
        sseSend(res, "token", { delta: token, index: evId++ }, evId++);
      }

      console.log(`[bridge] LLM total: ${Date.now() - startTime}ms, ${fullText.length} chars`);

    if (fullText) {
      // TTS generation in background
      ttsConvert(fullText).then((ttsResult) => {
        if (ttsResult) {
          broadcastUiAction({
            type: "live2d.lipsync_audio",
            audioUrl: `/api/tts/${ttsResult.id}`,
          });
        }
      });

      if (useDirectMiniMax) {
        sseSend(res, "done", { message_id: messageId, tokens: fullText.length }, evId);
        res.end();
      }
    }
  } catch (err) {
    console.error("[bridge] Agent error:", err.message);
    sseSend(res, "error", {
      code: "AGENT_ERROR",
      message: err.message.slice(0, 200) || "Unknown error",
    }, evId++);
    sseSend(res, "done", { message_id: messageId, tokens: 0 }, evId);
  }
}

function parseSkillArgs(args) {
  try { return JSON.parse(args); }
  catch { return { raw: args }; }
}

/**
 * Split text into word-level tokens for streaming.
 * CJK characters → individual tokens (each character is meaningful).
 * ASCII/words → grouped by whitespace boundaries.
 */
function splitTokens(text) {
  const tokens = [];
  let buf = "";
  const push = () => { if (buf) { tokens.push(buf); buf = ""; } };
  for (const ch of text) {
    if (/\s/.test(ch)) { push(); tokens.push(ch); }
    else if (/[一-鿿぀-ゟ゠-ヿ]/.test(ch)) { push(); tokens.push(ch); }
    else { buf += ch; }
  }
  push();
  return tokens;
}

// ── User context helper ────────────────────────────────────────

/**
 * Extract user context from request headers.
 * api-gateway injects X-User-Id header after JWT verification.
 */
function getUserCtx(req, url) {
  return {
    userId: req.headers["x-user-id"] || req.headers["x-arona-user"] || "default",
    sessionId: null,
    requestId: req.headers["x-request-id"] || randomUUID(),
    query: Object.fromEntries(url.searchParams.entries()),
  };
}

/**
 * Parse JSON body or return {}.
 */
async function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

// ── HTTP server ─────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname: pathName } = url;
  const method = req.method;
  const ctx = getUserCtx(req, url);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Last-Event-ID");
  if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const json = (data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  const readBody = () =>
    new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({}); }
      });
    });

  // ── Chat ──────────────────────────────────────────────────────

  // Create session
  if (method === "POST" && pathName === "/api/chat/sessions") {
    const body = await readBody();
    const userId = body.user_id || req.headers["x-arona-user"] || "default";
    const mode = body.mode || "text";
    const sid = await createSession(userId, mode);
    json({ session_id: sid, user_id: userId, mode });
    return;
  }

  // SSE: send message
  if (method === "POST" && pathName.match(/^\/api\/chat\/sessions\/[^/]+\/messages$/)) {
    const sessionId = pathName.split("/")[4];
    const body = await readBody();
    const lastEventId = req.headers["last-event-id"] || null;
    const sess = sessions.get(sessionId);
    const userId = sess ? sess.user_id : (body.user_id || req.headers["x-arona-user"] || "default");

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    await streamAgentResponse(sessionId, userId, body.content || "", res, { lastEventId });
    return;
  }

  // End session
  if (method === "POST" && pathName.match(/^\/api\/chat\/sessions\/[^/]+\/end$/)) {
    const sessionId = pathName.split("/")[4];
    const sess = sessions.get(sessionId);
    const userId = sess ? sess.user_id : "default";
    // Trigger summarizer pipeline asynchronously
    runSummarizerPipeline(sessionId, userId).catch(() => {});
    sessions.delete(sessionId);
    await endSession(sessionId);
    json({ ok: true, session_id: sessionId, summary_pending: true });
    return;
  }

  // Get message history
  if (method === "GET" && pathName.match(/^\/api\/chat\/sessions\/[^/]+\/messages$/)) {
    const sessionId = pathName.split("/")[4];
    const sess = sessions.get(sessionId);
    json({ session_id: sessionId, messages: sess?.message_ids || [] });
    return;
  }

  // ── Feeds ─────────────────────────────────────────────────────

  if (pathName === "/api/feeds") {
    if (method === "GET") {
      try { json(await feedHandler.listFeeds(null, ctx)); } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
    if (method === "POST") {
      try {
        const body = await readJsonBody(req);
        json(await feedHandler.createFeed(body, ctx), 201);
        broadcastUiAction({ type: 'data.changed', resource: 'feeds' });
      } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
  }

  if (method === "DELETE" && pathName.match(/^\/api\/feeds\/[^/]+$/)) {
    const feedCtx = { ...ctx, feedId: pathName.split("/")[3] };
    try {
      json(await feedHandler.deleteFeed(null, feedCtx));
      broadcastUiAction({ type: 'data.changed', resource: 'feeds' });
    } catch (e) { json({ error: e.message }, e.statusCode || 500); }
    return;
  }

  // Get single feed
  if (method === "GET" && pathName.match(/^\/api\/feeds\/[^/]+$/)) {
    const feedCtx = { ...ctx, feedId: pathName.split("/")[3] };
    try { json(await feedHandler.getFeed(null, feedCtx)); } catch (e) { json({ error: e.message }, e.statusCode || 500); }
    return;
  }

  // Feed items list
  if (method === "GET" && pathName.match(/^\/api\/feeds\/[^/]+\/items$/)) {
    const itemCtx = { ...ctx, feedId: pathName.split("/")[3] };
    try { json(await feedHandler.listFeedItems(null, itemCtx)); } catch (e) { json({ error: e.message }, e.statusCode || 500); }
    return;
  }

  // Mark feed item read
  if (method === "POST" && pathName.match(/^\/api\/feeds\/items\/[^/]+\/read$/)) {
    const itemCtx = { ...ctx, itemId: pathName.split("/")[3] };
    try {
      const body = await readJsonBody(req);
      json(await feedHandler.markRead(body, itemCtx));
    } catch (e) { json({ error: e.message }, e.statusCode || 500); }
    return;
  }

  // Toggle feed item star
  if (method === "POST" && pathName.match(/^\/api\/feeds\/items\/[^/]+\/star$/)) {
    const itemCtx = { ...ctx, itemId: pathName.split("/")[3] };
    try {
      const body = await readJsonBody(req);
      json(await feedHandler.toggleStar(body, itemCtx));
    } catch (e) { json({ error: e.message }, e.statusCode || 500); }
    return;
  }

  // ── Schedules ─────────────────────────────────────────────────

  if (pathName === "/api/schedules") {
    if (method === "GET") {
      try { json(await scheduleHandler.listSchedules(null, ctx)); } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
    if (method === "POST") {
      try {
        const body = await readJsonBody(req);
        json(await scheduleHandler.createSchedule(body, ctx), 201);
        broadcastUiAction({ type: 'data.changed', resource: 'schedules' });
      } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
  }

  if (method === "PATCH" && pathName.match(/^\/api\/schedules\/[^/]+$/)) {
    const schedCtx = { ...ctx, scheduleId: pathName.split("/")[3] };
    try {
      const body = await readJsonBody(req);
      json(await scheduleHandler.updateSchedule(body, schedCtx));
      broadcastUiAction({ type: 'data.changed', resource: 'schedules' });
    } catch (e) { json({ error: e.message }, e.statusCode || 500); }
    return;
  }

  if (method === "DELETE" && pathName.match(/^\/api\/schedules\/[^/]+$/)) {
    const schedCtx = { ...ctx, scheduleId: pathName.split("/")[3] };
    try {
      json(await scheduleHandler.deleteSchedule(null, schedCtx));
      broadcastUiAction({ type: 'data.changed', resource: 'schedules' });
    } catch (e) { json({ error: e.message }, e.statusCode || 500); }
    return;
  }

  // ── Page Monitors ───────────────────────────────────────────────

  if (pathName === "/api/page-monitors") {
    if (method === "GET") {
      try { json(await pageMonitorHandler.listMonitors(null, ctx)); } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
    if (method === "POST") {
      try {
        const body = await readJsonBody(req);
        json(await pageMonitorHandler.createMonitor(body, ctx), 201);
      } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
  }

  if (method === "PATCH" && pathName.match(/^\/api\/page-monitors\/[^/]+$/)) {
    const monCtx = { ...ctx, monitorId: pathName.split("/")[3] };
    try {
      const body = await readJsonBody(req);
      json(await pageMonitorHandler.updateMonitor(body, monCtx));
    } catch (e) { json({ error: e.message }, e.statusCode || 500); }
    return;
  }

  if (method === "DELETE" && pathName.match(/^\/api\/page-monitors\/[^/]+$/)) {
    const monCtx = { ...ctx, monitorId: pathName.split("/")[3] };
    try { json(await pageMonitorHandler.deleteMonitor(null, monCtx)); } catch (e) { json({ error: e.message }, e.statusCode || 500); }
    return;
  }

  // ── Memory ────────────────────────────────────────────────────

  if (pathName === "/api/memory/entries") {
    if (method === "GET") {
      try { json(await memoryHandler.listEntries(null, ctx)); } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
    if (method === "POST") {
      try {
        const body = await readJsonBody(req);
        json(await memoryHandler.createEntry(body, ctx), 201);
      } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
  }

  if (pathName.match(/^\/api\/memory\/entries\/[^/]+$/)) {
    const memCtx = { ...ctx, entryId: pathName.split("/")[4] };
    if (method === "GET") {
      try { json(await memoryHandler.getEntry(null, memCtx)); } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
    if (method === "DELETE") {
      try { json(await memoryHandler.deleteEntry(null, memCtx)); } catch (e) { json({ error: e.message }, e.statusCode || 500); }
      return;
    }
  }

  // ── User preferences ──────────────────────────────────────────

  if (pathName === "/api/me/preferences") {
    const userId = req.headers["x-arona-user"] || "default";
    const userPrefs = preferences.get(userId) || {};

    if (method === "GET") { json({ preferences: userPrefs }); return; }
    if (method === "PATCH") {
      const body = await readBody();
      preferences.set(userId, { ...userPrefs, ...body });
      json({ ok: true, preferences: preferences.get(userId) });
      return;
    }
  }

  // ── UI Actions ────────────────────────────────────────────────

  if (method === "POST" && pathName === "/api/ui/action") {
    const body = await readBody();
    broadcastUiAction(body);
    json({ ok: true });
    return;
  }

  // SSE subscription for UI events
  if (method === "GET" && pathName === "/api/ui/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  // ── Confirm response ──────────────────────────────────────────

  if (method === "POST" && pathName === "/api/ui/confirm") {
    const body = await readBody();
    // In future: proceed with the held skill execution
    json({ ok: true, confirmed: body.confirm_id });
    return;
  }

  // ── TTS audio serving ──────────────────────────────────────────

  if (method === "GET" && pathName.startsWith("/api/tts/")) {
    const ttsId = pathName.split("/").pop();
    const filePath = path.join(os.tmpdir(), "arona_tts", `${ttsId}.mp3`);
    try {
      const stat = fs.statSync(filePath);
      const audio = fs.readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": stat.size,
        "Cache-Control": "public, max-age=3600",
      });
      res.end(audio);
    } catch {
      res.writeHead(404);
      res.end("TTS audio not found");
    }
    return;
  }

  // ── Memory search ────────────────────────────────────────────

  if (method === "GET" && pathName === "/api/memory/search") {
    const q = url.searchParams.get("q") || "";
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const results = await searchMessages(q, null, limit);
    json({ query: q, results });
    return;
  }

  // ── Voice Flow ─────────────────────────────────────────────────

  // Presence event from perception service
  if (method === "POST" && pathName === "/internal/voice/presence") {
    const body = await readBody();
    const result = await handlePresenceEvent(body);
    json(result || { action: "noop" });
    return;
  }

  // List active guest users
  if (method === "GET" && pathName === "/api/voice/guests") {
    json({ guests: getActiveGuests() });
    return;
  }

  // Adopt guest history → registered user
  if (method === "POST" && pathName === "/api/users/adopt-guest") {
    const body = await readBody();
    const result = await adoptGuestHistory(body.guest_id, body.user_id);
    json(result);
    return;
  }

  // ── Health ────────────────────────────────────────────────────

  // Serve extracted page content (file path mode)
  if (method === "GET" && pathName.startsWith("/api/page-content/")) {
    const contentPath = decodeURIComponent(pathName.slice("/api/page-content/".length));
    const safe = path.resolve(ARTICLE_DIR, contentPath);
    if (!safe.startsWith(ARTICLE_DIR)) { json({ error: "invalid path" }, 403); return; }
    try {
      const content = fs.readFileSync(safe, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
    } catch { json({ error: "not found" }, 404); }
    return;
  }

  // Lazy-extract article body on demand (RSS items lack content_path until clicked)
  // GET /api/article-content?url=<encoded>&feed=<feedId>&guid=<guid>
  if (method === "GET" && pathName === "/api/article-content") {
    const qs = new URL(req.url, "http://localhost").searchParams;
    const url = qs.get("url");
    const feedId = qs.get("feed") || "ad-hoc";
    const guid = qs.get("guid") || "manual";
    if (!url) { json({ error: "missing url" }, 400); return; }
    try {
      const date = new Date().toISOString().slice(0, 10);
      const siteName = sanitizeName(new URL(url).hostname);
      const siteDir = path.join(ARTICLE_DIR, siteName, date);
      // Check cache first (by guid under today's dir)
      const cachedPath = path.join(siteDir, `${guid}.html`);
      if (fs.existsSync(cachedPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(cachedPath, "utf-8"));
        return;
      }
      // Cache miss — fetch + extract
      const article = await fetchArticle(url, siteDir);
      if (!article) {
        // 抽取失败 (反爬 / paywall / 404) — 返 fallback 页面（带原文链接）而不是 502
        // 让前端能展示 fallback 而非 "agent 服务不可用"
        const fallbackHtml = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>无法抽取正文</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:48px 24px;text-align:center;color:#1a1a1a;background:#fff}
h1{font-size:1.4em;margin-bottom:12px}p{color:#666;margin-bottom:24px}a.btn{display:inline-block;padding:10px 20px;background:#c9a875;color:#fff;border-radius:8px;text-decoration:none}
@media (prefers-color-scheme: dark){body{background:#1a1a1a;color:#e6e6e6}p{color:#aaa}}</style>
</head><body>
<h1>📄 暂时无法抽取正文</h1>
<p>该网站可能启用了反爬、付费墙或响应超时。请点击下方按钮跳转到原文阅读。</p>
<a class="btn" href="${url}" target="_blank" rel="noopener noreferrer">打开原文 →</a>
</body></html>`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallbackHtml);
        return;
      }
      const { htmlPath } = await saveReadingPage(siteDir, article, url);
      // Also update feed_item.content_path so future loads go via /api/page-content (cheap)
      try {
        await query(
          `UPDATE feed_item SET summary = summary || $1
           WHERE feed_id = $2 AND guid = $3`,
          [`\n\n<!-- content_path:${htmlPath} -->`, feedId, guid]
        );
      } catch (e) {
        log.warn(`[bridge] failed to back-fill content_path for ${guid}: ${e.message}`);
      }
      const content = fs.readFileSync(path.join(ARTICLE_DIR, htmlPath), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
    } catch (e) {
      log.warn(`[bridge] /api/article-content failed: ${e.message}`);
      json({ error: e.message }, 500);
    }
    return;
  }

  if (pathName === "/health") {
    json({
      status: "ok",
      service: "agent-bridge",
      version: "0.1.0",
      sessions: sessions.size,
      feeds_count: feeds.length,
      schedules_count: schedules.length,
    });
    return;
  }

  json({ error: "not found" }, 404);
});

// ── Startup ─────────────────────────────────────────────────────

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[bridge] Studio Arona bridge on http://127.0.0.1:${PORT}`);
  console.log(`[bridge] Session TTL: ${SESSION_TTL_MS / 60000}min`);

  // Periodic TTS file cleanup
  cleanupTTS();
  setInterval(cleanupTTS, 30 * 60 * 1000); // every 30 min
  console.log(`[bridge] TTS enabled (minimax)`);

  // Start web page watcher
  startWebWatcher(60000);

  // Warm MiniMax prompt cache so first user message isn't 16s cold start
  if (process.env.MINIMAX_API_KEY) {
    warmupCache();
  }
});
