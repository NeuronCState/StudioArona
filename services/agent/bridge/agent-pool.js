/**
 * Agent Process Pool — spawns OpenClaw agent subprocesses on demand.
 *
 * OpenClaw's CLI is one-shot (--message → response → exit), so we can't
 * reuse processes. Instead we:
 * 1. Warmup at startup to pre-load Node.js modules into OS cache.
 * 2. Spawn fresh for each request — the OS cache makes this fast (~1s vs ~2s cold).
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.resolve(__dirname, "..");
const OPENCLAW_CONFIG = path.join(AGENT_DIR, "openclaw.json");

// Resolve OpenClaw entry point — avoid pnpm exec overhead (~1s)
function resolveOpenClawEntry() {
  // Check npm flat structure (Docker / production)
  const flatPath = path.resolve(AGENT_DIR, "node_modules", "openclaw", "dist", "entry.js");
  if (fs.existsSync(flatPath)) return flatPath;

  // Check npm global bin symlink
  const binPath = path.resolve(AGENT_DIR, "node_modules", ".bin", "openclaw");
  if (fs.existsSync(binPath)) return binPath;

  // Walk pnpm .pnpm directory (dev)
  const pnpmDir = path.resolve(AGENT_DIR, "..", "..", "node_modules", ".pnpm");
  if (fs.existsSync(pnpmDir)) {
    for (const d of fs.readdirSync(pnpmDir)) {
      if (d.startsWith("openclaw@")) {
        const entry = path.join(pnpmDir, d, "node_modules", "openclaw", "dist", "entry.js");
        if (fs.existsSync(entry)) return entry;
      }
    }
  }
  return null;
}

const OPENCLAW_ENTRY = resolveOpenClawEntry();

class AgentPool {
  constructor() {
    this._warmedUp = false;
  }

  /**
   * Pre-warm: send a dummy message to load Node.js modules into OS file cache.
   * Fire-and-forget — failure is non-fatal.
   */
  warmup() {
    if (this._warmedUp || !OPENCLAW_ENTRY) return;
    this._warmedUp = true;
    console.log("[agent-pool] Warming up OS cache...");

    const child = spawn("node", [
      OPENCLAW_ENTRY, "agent",
      "--agent", "main",
      "--message", ".",
      "--thinking", "off",
      "--session-id", `warm_${randomUUID().slice(0, 8)}`,
      "--json",
    ], {
      cwd: AGENT_DIR,
      env: { ...process.env, OPENCLAW_CONFIG_PATH: OPENCLAW_CONFIG },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.resume(); // drain
    child.stderr.resume();

    const timer = setTimeout(() => child.kill(), 15000);
    child.on("close", () => {
      clearTimeout(timer);
      console.log("[agent-pool] Warmup done, OS cache loaded");
    });
  }

  /**
   * Execute a message by spawning a fresh OpenClaw agent process.
   */
  async execute(message, sessionId) {
    return new Promise((resolve, reject) => {
      const sid = sessionId || `s_${randomUUID().slice(0, 12)}`;
      const startTime = Date.now();

      const args = OPENCLAW_ENTRY
        ? [
            OPENCLAW_ENTRY, "agent",
            "--agent", "main",
            "--message", message,
            "--thinking", "off",
            "--session-id", sid,
            "--json",
          ]
        : [
            "exec", "openclaw", "agent",
            "--agent", "main",
            "--message", message,
            "--thinking", "off",
            "--session-id", sid,
            "--json",
          ];

      const child = OPENCLAW_ENTRY
        ? spawn("node", args, {
            cwd: AGENT_DIR,
            env: { ...process.env, OPENCLAW_CONFIG_PATH: OPENCLAW_CONFIG },
            stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn("pnpm", args, {
            cwd: AGENT_DIR,
            env: { ...process.env, OPENCLAW_CONFIG_PATH: OPENCLAW_CONFIG },
            stdio: ["ignore", "pipe", "pipe"],
          });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (c) => { stdout += c; });
      child.stderr.on("data", (c) => { stderr += c; });

      // Timeout: kill process after 45s
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Agent timeout (45s)"));
      }, 45000);

      child.on("close", (code) => {
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        console.log(`[agent-pool] Response in ${elapsed}ms (exit ${code})`);

        if (code !== 0 && code !== null) {
          reject(new Error(stderr.slice(0, 200) || `exit ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          const text = result?.result?.payloads?.map((p) => p.text || "").join("") || "";
          resolve({ text, sessionId: sid, elapsed, raw: result });
        } catch (err) {
          reject(new Error(`Parse error: ${err.message}`));
        }
      });

      child.on("error", reject);
    });
  }
}

export const agentPool = new AgentPool();
