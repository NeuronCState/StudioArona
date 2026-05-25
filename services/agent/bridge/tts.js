/**
 * TTS Module — text-to-speech via OpenClaw Gateway (MiniMax backend).
 *
 * Flow:
 *   1. Agent generates text response
 *   2. Bridge calls ttsConvert(text) → spawns `openclaw infer tts convert`
 *   3. Audio saved to /tmp/arona_tts/<id>.mp3
 *   4. Bridge serves audio via GET /api/tts/:id
 *   5. Bridge sends SSE ui_action: live2d.lipsync_audio → frontend plays + lip-sync
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.resolve(__dirname, "..");
const OPENCLAW_CONFIG = path.join(AGENT_DIR, "openclaw.json");
const TTS_DIR = path.join("/tmp", "arona_tts");

// Ensure TTS output directory exists
if (!fs.existsSync(TTS_DIR)) {
  fs.mkdirSync(TTS_DIR, { recursive: true });
}

/**
 * Convert text to speech via OpenClaw Gateway.
 * Returns the audio file path on success, null on failure.
 */
export function ttsConvert(text, voice = null) {
  return new Promise((resolve) => {
    if (!text || text.trim().length === 0) {
      resolve(null);
      return;
    }

    const ttsId = randomUUID().slice(0, 8);
    const outputPath = path.join(TTS_DIR, `${ttsId}.mp3`);

    const args = [
      "exec", "openclaw", "infer", "tts", "convert",
      "--text", text,
      "--output", outputPath,
      "--gateway",
      "--json",
    ];

    if (voice) {
      args.push("--voice", voice);
    }

    const child = spawn("pnpm", args, {
      cwd: AGENT_DIR,
      env: { ...process.env, OPENCLAW_CONFIG_PATH: OPENCLAW_CONFIG },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[tts] Convert failed: ${stderr.slice(0, 200)}`);
        resolve(null);
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.ok && fs.existsSync(outputPath)) {
          console.log(`[tts] Generated: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
          resolve({ path: outputPath, id: ttsId });
        } else {
          console.error("[tts] No output file");
          resolve(null);
        }
      } catch (err) {
        console.error("[tts] Parse error:", err.message);
        resolve(null);
      }
    });

    child.on("error", (err) => {
      console.error("[tts] Spawn error:", err.message);
      resolve(null);
    });
  });
}

/**
 * Clean up old TTS files (> 1 hour).
 */
export function cleanupTTS() {
  const maxAge = 60 * 60 * 1000; // 1 hour
  const now = Date.now();
  try {
    const files = fs.readdirSync(TTS_DIR);
    for (const f of files) {
      const fp = path.join(TTS_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(fp);
        console.log(`[tts] Cleaned up: ${f}`);
      }
    }
  } catch {
    // directory may not exist yet
  }
}
