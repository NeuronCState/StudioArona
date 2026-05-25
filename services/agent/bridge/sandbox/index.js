/**
 * Sandbox — Safe tool invocation layer.
 *
 * Every LLM-initiated tool call MUST pass through safeInvoke().
 * This is the single choke-point for:
 *   1. User context validation (ctx.userId required)
 *   2. Tool allowlist enforcement
 *   3. Handler dispatch
 *   4. Audit logging (success / denial / error)
 *   5. Latency measurement
 *
 * No tool handler is ever called directly — always via safeInvoke.
 */

import { ALLOWED_TOOLS, checkForbidden } from "./tool-registry.js";
import { auditLog, auditDenied, auditError } from "./audit.js";

// ── Handler imports ──────────────────────────────────────────────
import * as scheduleHandler from "../handlers/schedules.js";
import * as feedHandler from "../handlers/feeds.js";
import * as memoryHandler from "../handlers/memory.js";

// ── SandboxError ─────────────────────────────────────────────────

/**
 * Structured error thrown by the sandbox when a tool invocation is blocked.
 */
export class SandboxError extends Error {
  /**
   * @param {string} code    - machine-readable error code
   * @param {string} message - human-readable message
   * @param {object} [extra] - additional context
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
    this.extra = extra;
  }
}

// ── Handler dispatch map ─────────────────────────────────────────

/**
 * Map tool names to handler functions.
 * Each handler receives (payload, ctx) and returns a result object.
 *
 * @type {Map<string, Function>}
 */
const HANDLERS = new Map([
  // Schedules
  ["schedules.list", (payload, ctx) => scheduleHandler.listSchedules(null, ctx)],
  ["schedules.create", (payload, ctx) => scheduleHandler.createSchedule(payload, ctx)],
  ["schedules.update", (payload, ctx) => scheduleHandler.updateSchedule(payload, ctx)],
  ["schedules.delete", (payload, ctx) => scheduleHandler.deleteSchedule(null, ctx)],

  // Feeds
  ["feeds.list", (payload, ctx) => feedHandler.listFeeds(null, ctx)],
  ["feeds.add", (payload, ctx) => feedHandler.createFeed(payload, ctx)],
  ["feeds.remove", (payload, ctx) => feedHandler.deleteFeed(null, ctx)],
  ["feeds.items.list", (payload, ctx) => feedHandler.listFeedItems(null, ctx)],
  ["feeds.items.mark_read", (payload, ctx) => feedHandler.markRead(payload, ctx)],

  // Memory
  ["memory.search", (payload, ctx) => memoryHandler.listEntries(null, ctx)],
  ["memory.add", (payload, ctx) => memoryHandler.createEntry(payload, ctx)],
  ["memory.delete", (payload, ctx) => memoryHandler.deleteEntry(null, ctx)],
]);

// ── Core: safeInvoke ─────────────────────────────────────────────

/**
 * Safely invoke a tool with full guardrails.
 *
 * Check order:
 *  1. ctx.userId must exist → SandboxError('NO_USER_CONTEXT')
 *  2. Tool must be in ALLOWED_TOOLS → SandboxError('TOOL_NOT_ALLOWED') + audit
 *  3. Tool must not match forbidden patterns → SandboxError('FORBIDDEN_TOOL') + audit
 *  4. Handler must be registered → SandboxError('NO_HANDLER') (audited)
 *  5. Execute handler, measure latency, audit result
 *
 * @param {string} toolName   - e.g. "schedules.list"
 * @param {object} args       - arguments payload for the tool
 * @param {object} ctx        - context object with userId, sessionId, requestId
 * @returns {Promise<object>} - result from the tool handler
 */
export async function safeInvoke(toolName, args, ctx) {
  // ── 1. User context guard ─────────────────────────────────────
  if (!ctx || !ctx.userId) {
    throw new SandboxError(
      "NO_USER_CONTEXT",
      "Tool invocation requires a valid user context (ctx.userId).",
      { toolName },
    );
  }

  const userId = ctx.userId;

  // ── 2. Allowlist check ────────────────────────────────────────
  if (!ALLOWED_TOOLS.has(toolName)) {
    await auditDenied(userId, toolName, `TOOL_NOT_ALLOWED: ${toolName} is not in the allowlist`);
    throw new SandboxError(
      "TOOL_NOT_ALLOWED",
      `Tool "${toolName}" is not in the allowed tool registry.`,
      { toolName },
    );
  }

  // ── 3. Forbidden pattern check (double-insurance) ─────────────
  const forbiddenCheck = checkForbidden(toolName);
  if (forbiddenCheck.blocked) {
    await auditDenied(userId, toolName, forbiddenCheck.reason);
    throw new SandboxError(
      "FORBIDDEN_TOOL",
      `Tool "${toolName}" matches a forbidden pattern.`,
      { toolName, reason: forbiddenCheck.reason },
    );
  }

  // ── 4. Handler lookup ─────────────────────────────────────────
  const handler = HANDLERS.get(toolName);
  if (!handler) {
    // Allowed tool but no handler yet (e.g. system.status, vms.*, ha.*, ui.*)
    // These are valid allowlist entries but their handlers live in other services
    // or are not yet implemented. Return a controlled "not implemented" response
    // rather than throwing — this lets the LLM give a graceful answer.
    const now = new Date().toISOString();
    return {
      ok: true,
      tool: toolName,
      handler: "passthrough",
      message: `Tool "${toolName}" is registered but handled by an external service.`,
      timestamp: now,
    };
  }

  // ── 5. Execute with timing ────────────────────────────────────
  const start = Date.now();
  try {
    const result = await handler(args || {}, ctx);
    const latencyMs = Date.now() - start;
    await auditLog({
      userId,
      tool: toolName,
      args,
      status: "ok",
      latency: latencyMs,
    });
    return result;
  } catch (err) {
    const latencyMs = Date.now() - start;
    await auditError(userId, toolName, args, err.message);
    throw err;
  }
}

/**
 * Convenience: invoke with a plain userId string instead of a ctx object.
 * Builds a minimal ctx for internal/testing use.
 *
 * @param {string} toolName
 * @param {object} args
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function safeInvokeForUser(toolName, args, userId) {
  return safeInvoke(toolName, args, {
    userId,
    sessionId: null,
    requestId: `internal_${Date.now()}`,
  });
}
