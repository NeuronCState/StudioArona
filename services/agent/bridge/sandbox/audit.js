/**
 * Audit logger — writes every tool invocation to the audit_log table.
 *
 * Uses the shared PG connection pool from db/index.js.
 * All writes are fire-and-forget (non-blocking), but the log call itself
 * returns a promise so callers can await if needed.
 */

import { query } from "../db/index.js";
import { createHash } from "node:crypto";

/**
 * Hash args object for storage and dedup.
 * @param {object} args
 * @returns {string} SHA-256 hex digest (first 16 chars)
 */
function hashArgs(args) {
  if (!args) return "null";
  try {
    const json = JSON.stringify(args);
    return createHash("sha256").update(json).digest("hex").slice(0, 16);
  } catch {
    return "unserializable";
  }
}

/**
 * Write an audit record to the audit_log table.
 *
 * @param {object} params
 * @param {string} params.userId      - UUID of the user who triggered the tool
 * @param {string} params.tool        - tool name (e.g. "schedules.list")
 * @param {object} [params.args]      - arguments passed to the tool
 * @param {string} params.status      - "ok" | "denied_unknown" | "denied_forbidden" | "error" | "timeout"
 * @param {string} [params.error]     - error message if status === "error"
 * @param {number} [params.latency]   - latency in milliseconds
 * @param {string} [params.resultTruncated] - first 256 chars of result (for VM exec)
 * @returns {Promise<void>}
 */
export async function auditLog({ userId, tool, args, status, error, latency, resultTruncated }) {
  if (!userId || !tool || !status) {
    console.warn("[audit] missing required audit fields, skipping write");
    return;
  }

  const argsHash = hashArgs(args);

  try {
    await query(
      `INSERT INTO audit_log (user_id, tool_name, args_hash, status, error_message, latency_ms, result_truncated, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        userId,
        tool,
        argsHash,
        status,
        error || null,
        latency != null ? Math.round(latency) : null,
        resultTruncated || null,
      ],
    );
  } catch (err) {
    // Never let audit failure break the main flow
    console.error("[audit] failed to write audit log:", err.message);
  }
}

/**
 * Shortcut: record a denied attempt (tool not in allowlist).
 */
export async function auditDenied(userId, tool, reason) {
  return auditLog({
    userId,
    tool,
    args: null,
    status: "denied_unknown",
    error: reason,
  });
}

/**
 * Shortcut: record a successful invocation.
 */
export async function auditOk(userId, tool, args, latencyMs) {
  return auditLog({
    userId,
    tool,
    args,
    status: "ok",
    latency: latencyMs,
  });
}

/**
 * Shortcut: record a failed invocation (runtime error).
 */
export async function auditError(userId, tool, args, errorMsg) {
  return auditLog({
    userId,
    tool,
    args,
    status: "error",
    error: errorMsg,
  });
}
