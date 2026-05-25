/**
 * Prompt Builder — layered assembly of the agent prompt.
 *
 * Layers (in order):
 *   1. Core Identity  — IDENTITY.md
 *   2. Soul           — SOUL.md
 *   3. Tool Context   — available skills for this session
 *   4. Runtime Context — current page, device, presence
 *   5. Memory Context — recall() top-K entries
 *   6. Recent History — last N messages from this session
 *   7. User Message
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSessionMessages } from "./memory.js";

const WORKSPACE_DIR = resolve(import.meta.dirname || ".", "../workspace");
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8080";

// Static prompt layers (loaded once)
const IDENTITY = readFileSync(resolve(WORKSPACE_DIR, "IDENTITY.md"), "utf-8");
const SOUL = readFileSync(resolve(WORKSPACE_DIR, "SOUL.md"), "utf-8");

/**
 * Build a layered prompt for the agent.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.sessionId
 * @param {string} opts.userMessage
 * @param {string} [opts.currentRoute="/"]  - current frontend route
 * @param {Object} [opts.presence]          - current presence state
 * @param {string[]} [opts.skills]          - available skill names
 * @returns {Promise<string>}
 */
export async function buildPrompt({
  userId,
  sessionId,
  userMessage,
  currentRoute = "/",
  presence = null,
  skills = [],
}) {
  const layers = [];

  // Layer 1: Core Identity
  layers.push(`[核心身份]\n${IDENTITY}`);

  // Layer 2: Soul
  layers.push(`[性格设定]\n${SOUL}`);

  // Layer 3: Tool Context
  if (skills.length > 0) {
    layers.push(`[可用技能]\n${skills.join(", ")}`);
  }

  // Layer 4: Runtime Context
  const runtimeParts = [`当前页面: ${currentRoute}`];
  if (presence) {
    runtimeParts.push(`presence: ${presence.state || "unknown"}`);
  }
  layers.push(`[运行时上下文]\n${runtimeParts.join("\n")}`);

  // Layer 5: Memory Context (recall from per-user SQLite)
  try {
    const resp = await fetch(
      `${GATEWAY_URL}/internal/memory/recall?user_id=${encodeURIComponent(userId)}&query=${encodeURIComponent(userMessage)}&k=5`
    );
    if (resp.ok) {
      const entries = await resp.json();
      if (entries && entries.length > 0) {
        const memLines = entries.map(
          (e) => `- [${e.type}] ${e.summary}`
        );
        layers.push(`[长期记忆]\n${memLines.join("\n")}`);
      }
    }
  } catch {
    // Memory recall not critical — skip if unavailable
  }

  // Layer 6: Recent History
  try {
    const recent = await getSessionMessages(sessionId, 10);
    if (recent.length > 0) {
      const historyLines = recent.map(
        (m) => `[${m.role}]: ${m.content.slice(0, 200)}`
      );
      layers.push(`[最近对话]\n${historyLines.join("\n")}`);
    }
  } catch {
    // History not critical
  }

  // Layer 7: User Message
  layers.push(`[用户消息]\n${userMessage}`);

  return layers.join("\n\n");
}
