/**
 * Schedule handler — CRUD for user schedules.
 *
 * Every query is scoped by ctx.userId for tenant isolation.
 */

import { query, requireUserId } from "../db/index.js";

/**
 * GET /api/schedules — list schedules for current user.
 */
export async function listSchedules(req, ctx) {
  const userId = requireUserId(ctx);
  const result = await query(
    `SELECT id, user_id, title, body, starts_at, ends_at, rrule,
            reminder_min, status, source, created_at, updated_at
     FROM schedule
     WHERE user_id = $1
     ORDER BY starts_at DESC`,
    [userId],
  );
  return result.rows;
}

/**
 * POST /api/schedules — create a schedule.
 */
export async function createSchedule(req, ctx) {
  const userId = requireUserId(ctx);
  const { title, body, starts_at, ends_at, rrule, reminder_min, status, source } = req;

  if (!title || !starts_at) {
    const err = new Error("title and starts_at are required");
    err.statusCode = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO schedule (user_id, title, body, starts_at, ends_at, rrule,
                           reminder_min, status, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      title,
      body || null,
      starts_at,
      ends_at || null,
      rrule || null,
      reminder_min || null,
      status || "pending",
      source || "manual",
    ],
  );
  return result.rows[0];
}

/**
 * PATCH /api/schedules/:id — update a schedule.
 */
export async function updateSchedule(req, ctx) {
  const userId = requireUserId(ctx);
  const { scheduleId } = ctx;
  const fields = req;

  // Verify ownership
  const existing = await query(
    "SELECT id FROM schedule WHERE id = $1 AND user_id = $2",
    [scheduleId, userId],
  );
  if (existing.rows.length === 0) {
    const err = new Error("Schedule not found");
    err.statusCode = 404;
    throw err;
  }

  const allowed = [
    "title", "body", "starts_at", "ends_at",
    "rrule", "reminder_min", "status",
  ];
  const sets = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${idx++}`);
      params.push(fields[key]);
    }
  }

  if (sets.length === 0) {
    return existing.rows[0];
  }

  sets.push(`updated_at = NOW()`);
  params.push(scheduleId, userId);

  const result = await query(
    `UPDATE schedule SET ${sets.join(", ")}
     WHERE id = $${idx++} AND user_id = $${idx}
     RETURNING *`,
    params,
  );
  return result.rows[0];
}

/**
 * DELETE /api/schedules/:id — delete a schedule.
 */
export async function deleteSchedule(req, ctx) {
  const userId = requireUserId(ctx);
  const { scheduleId } = ctx;

  const result = await query(
    "DELETE FROM schedule WHERE id = $1 AND user_id = $2 RETURNING id",
    [scheduleId, userId],
  );
  if (result.rows.length === 0) {
    const err = new Error("Schedule not found");
    err.statusCode = 404;
    throw err;
  }
  return { deleted: true, id: scheduleId };
}
