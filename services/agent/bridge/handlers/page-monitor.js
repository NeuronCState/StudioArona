import { query } from "../db.js";

function requireUserId(ctx) {
  if (!ctx?.userId) {
    const err = new Error("Authentication required");
    err.statusCode = 401;
    throw err;
  }
  return ctx.userId;
}

/**
 * GET /api/page-monitors — list monitors for current user.
 */
export async function listMonitors(req, ctx) {
  const userId = requireUserId(ctx);
  const result = await query(
    `SELECT id, user_id, url, label, css_selector, last_hash,
            last_checked_at, last_changed_at, check_interval_min,
            enabled, created_at, updated_at
     FROM page_monitor
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}

/**
 * POST /api/page-monitors — create a monitor.
 */
export async function createMonitor(req, ctx) {
  const userId = requireUserId(ctx);
  const { url, label, css_selector } = req;

  if (!url || !label) {
    const err = new Error("url and label are required");
    err.statusCode = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO page_monitor (user_id, url, label, css_selector)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, url, label, css_selector || "body"],
  );
  return result.rows[0];
}

/**
 * PATCH /api/page-monitors/:id — update a monitor.
 */
export async function updateMonitor(req, ctx) {
  const userId = requireUserId(ctx);
  const { monitorId } = ctx;

  const existing = await query(
    "SELECT id FROM page_monitor WHERE id = $1 AND user_id = $2",
    [monitorId, userId],
  );
  if (existing.rows.length === 0) {
    const err = new Error("Page monitor not found");
    err.statusCode = 404;
    throw err;
  }

  const allowed = ["url", "label", "css_selector", "check_interval_min", "enabled"];
  const sets = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (req[key] !== undefined) {
      sets.push(`${key} = $${idx++}`);
      params.push(req[key]);
    }
  }

  if (sets.length === 0) {
    return existing.rows[0];
  }

  sets.push(`updated_at = now()`);
  params.push(monitorId, userId);

  const result = await query(
    `UPDATE page_monitor SET ${sets.join(", ")}
     WHERE id = $${idx++} AND user_id = $${idx}
     RETURNING *`,
    params,
  );
  return result.rows[0];
}

/**
 * DELETE /api/page-monitors/:id — delete a monitor.
 */
export async function deleteMonitor(req, ctx) {
  const userId = requireUserId(ctx);
  const { monitorId } = ctx;

  const result = await query(
    "DELETE FROM page_monitor WHERE id = $1 AND user_id = $2",
    [monitorId, userId],
  );
  if (result.rowCount === 0) {
    const err = new Error("Page monitor not found");
    err.statusCode = 404;
    throw err;
  }
  return { deleted: true };
}
