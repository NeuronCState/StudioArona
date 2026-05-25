/**
 * Memory handler — CRUD for user memory entries.
 *
 * Every query is scoped by ctx.userId for tenant isolation.
 * Supports kind/tag filtering and full-text search.
 */

import { query, requireUserId } from "../db/index.js";

/**
 * GET /api/memory/entries — list memories for current user.
 * Query params: kind, tag
 */
export async function listEntries(req, ctx) {
  const userId = requireUserId(ctx);
  const { kind, tag } = ctx.query || {};

  const conditions = ["user_id = $1"];
  const params = [userId];
  let idx = 2;

  if (kind) {
    conditions.push(`kind = $${idx++}`);
    params.push(kind);
  }
  if (tag) {
    conditions.push(`$${idx++} = ANY(tags)`);
    params.push(tag);
  }

  const result = await query(
    `SELECT id, user_id, kind, content, tags, source_msg_id,
            weight, created_at, expires_at
     FROM memory_entry
     WHERE ${conditions.join(" AND ")}
     ORDER BY weight DESC, created_at DESC
     LIMIT 200`,
    params,
  );
  return result.rows;
}

/**
 * POST /api/memory/entries — write a memory.
 */
export async function createEntry(req, ctx) {
  const userId = requireUserId(ctx);
  const { kind, content, tags, weight, expires_at } = req;

  if (!kind || !content) {
    const err = new Error("kind and content are required");
    err.statusCode = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO memory_entry (user_id, kind, content, tags, weight, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      kind,
      content,
      tags || null,
      weight ?? 1.0,
      expires_at || null,
    ],
  );
  return result.rows[0];
}

/**
 * GET /api/memory/entries/:id — get a single memory entry.
 */
export async function getEntry(req, ctx) {
  const userId = requireUserId(ctx);
  const { entryId } = ctx;

  const result = await query(
    `SELECT id, user_id, kind, content, tags, source_msg_id,
            weight, created_at, expires_at
     FROM memory_entry
     WHERE id = $1 AND user_id = $2`,
    [entryId, userId],
  );
  if (result.rows.length === 0) {
    const err = new Error("Memory entry not found");
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

/**
 * DELETE /api/memory/entries/:id — delete a memory entry.
 */
export async function deleteEntry(req, ctx) {
  const userId = requireUserId(ctx);
  const { entryId } = ctx;

  const result = await query(
    "DELETE FROM memory_entry WHERE id = $1 AND user_id = $2 RETURNING id",
    [entryId, userId],
  );
  if (result.rows.length === 0) {
    const err = new Error("Memory entry not found");
    err.statusCode = 404;
    throw err;
  }
  return { deleted: true, id: entryId };
}
