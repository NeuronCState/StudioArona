/**
 * Tool Registry — Central allowlist of all tools the LLM is permitted to invoke.
 *
 * Any tool NOT in this set is rejected at the sandbox layer, regardless of
 * what the LLM requests. This is the single source of truth for tool authorization.
 *
 * Principle: deny-by-default. Only explicitly listed tools are callable.
 */

/**
 * @type {Set<string>}
 */
export const ALLOWED_TOOLS = new Set([
  // ── Schedules ─────────────────────────────────────────────────
  "schedules.list",
  "schedules.create",
  "schedules.update",
  "schedules.delete",

  // ── Feeds ─────────────────────────────────────────────────────
  "feeds.list",
  "feeds.add",
  "feeds.remove",
  "feeds.items.list",
  "feeds.items.mark_read",

  // ── Memory ────────────────────────────────────────────────────
  "memory.search",
  "memory.add",
  "memory.delete",

  // ── System ────────────────────────────────────────────────────
  "system.status",

  // ── VMs ───────────────────────────────────────────────────────
  "vms.list",
  "vms.start",
  "vms.stop",
  "vms.console.tail",
  "vms.console.exec",

  // ── Home Assistant ────────────────────────────────────────────
  "ha.devices.list",
  "ha.devices.toggle",
  "ha.scenes.activate",

  // ── UI actions (agent → frontend) ─────────────────────────────
  "ui.toast",
  "ui.navigate",
  "ui.render_card",
]);

/**
 * Tools that are explicitly forbidden and should never appear in ALLOWED_TOOLS.
 * This list exists for documentation and audit cross-reference purposes.
 *
 * Forbidden tool patterns (non-exhaustive):
 *   shell.exec, fs.read, fs.write, git.*, docker.*, python.eval,
 *   http.request (unless wrapped), db.query (raw SQL), os.system
 */
export const FORBIDDEN_PATTERNS = [
  /^shell\./,
  /^fs\./,
  /^git\./,
  /^docker\./,
  /^python\.eval/,
  /^http\.request$/,
  /^db\./,
  /^os\./,
  /^subprocess\./,
];

/**
 * Check whether a tool name matches any forbidden pattern.
 * @param {string} toolName
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function checkForbidden(toolName) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(toolName)) {
      return { blocked: true, reason: `FORBIDDEN_PATTERN: ${pattern.source}` };
    }
  }
  return { blocked: false };
}
