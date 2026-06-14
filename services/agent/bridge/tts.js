/**
 * TTS Module — text-to-speech (legacy, OpenClaw removed).
 *
 * Flow:
 *   1. Agent generates text response
 *   2. Bridge calls ttsConvert(text) → currently returns null (OpenClaw removed)
 *   3. Audio saved to <tmpdir>/arona_tts/<id>.mp3
 *   4. Bridge serves audio via GET /api/tts/:id
 *   5. Bridge sends SSE ui_action: live2d.lipsync_audio → frontend plays + lip-sync
 *
 * TODO: Re-implement TTS via Hermes or direct MiniMax TTS API.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TTS_DIR = path.join(os.tmpdir(), "arona_tts");

// Ensure TTS output directory exists
if (!fs.existsSync(TTS_DIR)) {
  fs.mkdirSync(TTS_DIR, { recursive: true });
}

/**
 * Convert text to speech.
 * Currently disabled — OpenClaw TTS backend removed.
 * Returns null until a new TTS backend is implemented.
 */
export function ttsConvert(text, voice = null) {
  // TODO: Re-implement via Hermes TTS or MiniMax TTS API
  return Promise.resolve(null);
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
