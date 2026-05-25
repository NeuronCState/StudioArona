/**
 * Direct MiniMax API streaming — bypasses OpenClaw spawn overhead.
 *
 * Call chain: Bridge → MiniMax API (SSE) → Frontend
 * Eliminates: openclaw agent spawn (2s) + gateway connection (1-2s)
 *
 * The system prompt is assembled from the Arona workspace files,
 * matching what OpenClaw would inject via SOUL.md + IDENTITY.md.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, "..", "workspace");

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_URL = "https://api.minimaxi.com/v1/chat/completions";
const MODEL = "MiniMax-M2.7";

let _systemPrompt = null;

function loadSystemPrompt() {
  if (_systemPrompt) return _systemPrompt;
  const files = ["SOUL.md", "IDENTITY.md"];
  const parts = [];
  for (const f of files) {
    const fp = path.join(WORKSPACE, f);
    if (fs.existsSync(fp)) {
      parts.push(fs.readFileSync(fp, "utf-8"));
    }
  }
  const today = new Date();
  const dateStr = `今天是 ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（星期${["日","一","二","三","四","五","六"][today.getDay()]}）。`;
  parts.unshift(`[系统时间] ${dateStr}`);
  _systemPrompt = parts.join("\n\n---\n\n");
  console.log(`[minimax] System prompt loaded: ${_systemPrompt.length} chars`);
  return _systemPrompt;
}

/**
 * Warm up the MiniMax prompt cache on bridge startup.
 * Sends the system prompt once so subsequent requests hit the cache (~2.5s vs ~16s).
 */
export async function warmupCache() {
  const system = loadSystemPrompt();
  try {
    const resp = await fetch(MINIMAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: "." },
        ],
        stream: false,
        max_tokens: 1,
      }),
    });
    if (resp.ok) {
      console.log("[minimax] Prompt cache warmed up");
    }
  } catch (err) {
    console.warn("[minimax] Cache warmup failed:", err.message);
  }
}

/**
 * Stream a response from MiniMax API.
 * Yields SSE token strings.
 */
export async function* streamMinimax(message, context = "") {
  const system = loadSystemPrompt();
  const messages = [
    { role: "system", content: system },
  ];

  if (context) {
    messages.push({ role: "system", content: `[最近对话记录]\n${context}` });
  }

  messages.push({ role: "user", content: message });

  const body = JSON.stringify({
    model: MODEL,
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 2000,
    reasoning_effort: "none",
  });

  const resp = await fetch(MINIMAX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MINIMAX_API_KEY}`,
    },
    body,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`MiniMax API ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textBuf = "";  // accumulates content for think-tag stripping

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") {
          // Flush remaining text (strip any trailing think tags)
          const clean = textBuf.replace(/<think>[\s\S]*?<\/think>/g, "");
          textBuf = "";
          if (clean) yield clean;
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (!delta) continue;
          textBuf += delta;

          // Yield only content outside of think tags
          // Find the last complete segment (no open <think> without </think>)
          const openIdx = textBuf.lastIndexOf("<think>");
          const closeIdx = textBuf.lastIndexOf("</think>");

          if (openIdx === -1) {
            // No think tag at all → yield accumulated text
            yield textBuf;
            textBuf = "";
          } else if (closeIdx > openIdx) {
            // Think tag completed → yield content after </think>
            const after = textBuf.slice(closeIdx + 8);
            if (after && !after.includes("<think>")) {
              yield after;
              textBuf = "";
            }
          }
          // else: inside a think tag → keep buffering, don't yield
        } catch {
          // skip
        }
      }
    }
  }
}
