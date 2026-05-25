/**
 * Summarizer Pipeline — session end → extract memory → store entries.
 *
 * Triggered on session end (explicit, away timeout, idle timeout).
 * Runs asynchronously, never blocks the user's next conversation.
 */
import { getSessionMessages, markSessionSummarized } from "./memory.js";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8080";

/**
 * Run the summarization pipeline for a completed session.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @returns {Promise<{ok: boolean, entries: number, error?: string}>}
 */
export async function runSummarizerPipeline(sessionId, userId) {
  console.log(`[summarizer] Starting pipeline for session ${sessionId}, user ${userId}`);

  try {
    // 1. Fetch all messages from this session
    const messages = await getSessionMessages(sessionId, 200);
    if (messages.length === 0) {
      console.log(`[summarizer] No messages in session ${sessionId}, skipping`);
      await markSessionSummarized(sessionId);
      return { ok: true, entries: 0 };
    }

    // 2. Build conversation text
    const conversation = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    // 3. Call api-gateway to summarize
    const summarizeResp = await fetch(`${GATEWAY_URL}/internal/memory/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation }),
    });

    if (!summarizeResp.ok) {
      const err = await summarizeResp.text();
      throw new Error(`Summarize failed: ${summarizeResp.status} ${err}`);
    }

    const entries = await summarizeResp.json();

    if (!entries || entries.length === 0) {
      console.log(`[summarizer] No entries extracted from session ${sessionId}`);
      await markSessionSummarized(sessionId);
      return { ok: true, entries: 0 };
    }

    // 4. Store entries via batch upsert
    const upsertResp = await fetch(
      `${GATEWAY_URL}/internal/memory/entries/batch?user_id=${encodeURIComponent(userId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entries),
      }
    );

    if (!upsertResp.ok) {
      const err = await upsertResp.text();
      throw new Error(`Upsert entries failed: ${upsertResp.status} ${err}`);
    }

    const result = await upsertResp.json();

    // 5. Mark session as summarized
    await markSessionSummarized(sessionId);

    console.log(`[summarizer] Pipeline complete: ${result.count || entries.length} entries stored`);
    return { ok: true, entries: result.count || entries.length };
  } catch (err) {
    console.error(`[summarizer] Pipeline failed for session ${sessionId}:`, err.message);
    return { ok: false, entries: 0, error: err.message };
  }
}
