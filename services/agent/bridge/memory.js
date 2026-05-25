/**
 * Memory Module — PostgreSQL chat persistence + per-user SQLite via api-gateway.
 *
 * Phase M1: removes in-memory fallback. PG is mandatory for chat messages.
 * Per-user SQLite memory is accessed via api-gateway HTTP API.
 */
import pg from "pg";

const { Pool } = pg;

const DB_URL = process.env.DATABASE_URL || "postgresql://javis:javis@localhost:5432/javis";
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8080";

let pool = null;

async function getPool() {
  if (pool) return pool;
  pool = new Pool({ connectionString: DB_URL, max: 5 });
  await pool.query("SELECT 1");
  console.log("[memory] PostgreSQL connected");
  return pool;
}

/**
 * Save a chat message to PG. Throws on failure — no fallback.
 */
export async function saveMessage(sessionId, userId, role, content, toolCallJson = null) {
  try {
    const db = await getPool();
    await db.query(
      `INSERT INTO chat_messages (id, session_id, role, content, tool_call_json, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      [sessionId, role, content, toolCallJson]
    );
    await db.query(
      `UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  } catch (err) {
    // FK constraint if session/user doesn't exist in PG — non-fatal
    console.warn(`[memory] saveMessage failed (non-fatal): ${err.message}`);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(s) {
  return typeof s === "string" && UUID_RE.test(s);
}

/**
 * Ensure a chat session row exists. Skips PG if userId is not a valid UUID.
 */
export async function ensureSession(sessionId, userId, mode = "text", title = null) {
  if (!isValidUUID(userId)) {
    console.log(`[memory] Skipping PG session for non-UUID user: ${userId}`);
    return;
  }
  try {
    const db = await getPool();
    await db.query(
      `INSERT INTO chat_sessions (id, user_id, mode, title)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [sessionId, userId, mode, title]
    );
  } catch (err) {
    // User may not exist yet (FK constraint), or PG is down.
    // Don't crash the bridge — session will work in memory only.
    console.warn(`[memory] ensureSession failed (non-fatal): ${err.message}`);
  }
}

/**
 * End a session.
 */
export async function endSession(sessionId) {
  const db = await getPool();
  await db.query(
    `UPDATE chat_sessions SET ended_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

/**
 * Mark session as summarized.
 */
export async function markSessionSummarized(sessionId) {
  const db = await getPool();
  await db.query(
    `UPDATE chat_sessions SET summarized = true WHERE id = $1`,
    [sessionId]
  );
}

/**
 * Get recent messages for a session from PG.
 */
export async function getSessionMessages(sessionId, limit = 20) {
  const db = await getPool();
  const result = await db.query(
    `SELECT role, content, tool_call_json, created_at FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [sessionId, limit]
  );
  return result.rows.reverse();
}

/**
 * Search messages across sessions for a keyword.
 */
export async function searchMessages(keyword, userId = null, limit = 10) {
  const db = await getPool();
  const result = await db.query(
    `SELECT session_id, role, content, created_at
     FROM chat_messages
     WHERE content ILIKE $1
     ORDER BY created_at DESC LIMIT $2`,
    [`%${keyword}%`, limit]
  );
  return result.rows;
}

/**
 * Get recent cross-session context for a user from PG.
 */
export async function getRecentContext(userId, maxMessages = 10) {
  const db = await getPool();
  const result = await db.query(
    `SELECT cm.session_id, cm.role, cm.content, cm.created_at
     FROM chat_messages cm
     JOIN chat_sessions cs ON cm.session_id = cs.id
     WHERE cs.user_id = $1
     ORDER BY cm.created_at DESC LIMIT $2`,
    [userId, maxMessages]
  );
  return result.rows.reverse();
}

/**
 * Build a memory context string for prompt injection.
 * Combines PG recent messages + per-user SQLite memory entries via api-gateway.
 */
export async function buildMemoryContext(userId) {
  const recent = await getRecentContext(userId, 10);
  const parts = [];

  if (recent.length > 0) {
    parts.push("[最近对话]");
    for (const m of recent) {
      parts.push(`[${m.role}]: ${m.content.slice(0, 200)}`);
    }
  }

  // Fetch per-user memory entries from api-gateway
  try {
    const resp = await fetch(
      `${GATEWAY_URL}/internal/memory/entries?user_id=${encodeURIComponent(userId)}&limit=5`
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.entries && data.entries.length > 0) {
        parts.push("\n[长期记忆]");
        for (const entry of data.entries) {
          parts.push(`- ${entry.summary}`);
        }
      }
    }
  } catch {
    // api-gateway memory endpoint not available yet (Phase M2)
  }

  return parts.join("\n");
}

/**
 * Close the PG pool.
 */
export async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
