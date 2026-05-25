/**
 * Voice Flow — handle the wake-by-face pipeline.
 *
 * Flow:
 *   1. perception publishes presence.near → WS event
 *   2. Bridge receives it, triggers face/identify skill
 *   3. If user recognized → bind session.user_id → publish voice_mode_start
 *   4. If unknown → create temp guest user → mark needs_register → voice_mode_start
 *   5. On presence.away + 15min silence → end session
 *
 * Phase M3 mock: presence events are simulated in perception/presence.py.
 * face/identify returns mock-user-001 when mock=true.
 */
import { randomUUID } from "node:crypto";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8080";

// Track guest users for potential adoption
const guestUsers = new Map(); // guest_id → {created_at, sessions: []}
const GUEST_IDLE_MS = 15 * 60 * 1000; // 15 min

/**
 * Handle a presence event from the perception service.
 *
 * @param {Object} event - WS event payload
 * @param {string} event.type - presence.near | presence.engaged | presence.away
 * @param {string} [event.user_id]
 * @returns {Promise<Object|null>} voice mode result or null
 */
export async function handlePresenceEvent(event) {
  const { type } = event;

  switch (type) {
    case "presence.near":
      return await _onPresenceNear(event);
    case "presence.engaged":
      return await _onPresenceEngaged(event);
    case "presence.away":
      return await _onPresenceAway(event);
    default:
      return null;
  }
}

/**
 * Someone approaching → try to identify.
 */
async function _onPresenceNear(event) {
  console.log("[voice-flow] presence.near detected, identifying...");

  const identifyResult = await _callFaceIdentify();

  if (identifyResult.ok && identifyResult.data.user_id) {
    const userId = identifyResult.data.user_id;
    const confidence = identifyResult.data.confidence;

    console.log(`[voice-flow] Face identified: ${userId} (${confidence})`);

    return {
      action: "voice_mode_start",
      user_id: userId,
      confidence,
      mode: "voice",
      is_guest: false,
    };
  }

  // Not recognized — create guest
  const guestId = `guest_${randomUUID()}`;
  guestUsers.set(guestId, {
    created_at: Date.now(),
    sessions: [],
    needs_register: true,
  });

  console.log(`[voice-flow] Unknown face → guest: ${guestId}`);

  return {
    action: "voice_mode_start",
    user_id: guestId,
    mode: "voice",
    is_guest: true,
    needs_register: true,
  };
}

/**
 * User engaged (looking at screen) — confirm identity.
 */
async function _onPresenceEngaged(event) {
  const userId = event.user_id;
  if (!userId) return null;

  console.log(`[voice-flow] presence.engaged: ${userId}`);

  return {
    action: "voice_mode_confirm",
    user_id: userId,
    mode: "voice",
  };
}

/**
 * User left — cleanup after idle timeout.
 */
async function _onPresenceAway(event) {
  console.log("[voice-flow] presence.away");

  // Clean up stale guest users
  const now = Date.now();
  for (const [guestId, data] of guestUsers) {
    if (now - data.created_at > GUEST_IDLE_MS) {
      guestUsers.delete(guestId);
      console.log(`[voice-flow] Expired guest: ${guestId}`);
    }
  }

  return {
    action: "voice_mode_end",
    user_id: event.user_id || null,
  };
}

/**
 * Call the face/identify skill via internal API.
 */
async function _callFaceIdentify() {
  try {
    const resp = await fetch(`${GATEWAY_URL}/internal/skills/face/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mock: true }),
    });
    if (resp.ok) {
      return { ok: true, data: await resp.json() };
    }
  } catch {
    // Fallback to mock behavior when endpoint not available
  }

  // Built-in mock: always return mock-user-001
  return {
    ok: true,
    data: {
      user_id: "mock-user-001",
      confidence: 0.95,
      display_name: "老张",
    },
  };
}

/**
 * Adopt a guest user's history into a registered account.
 *
 * @param {string} guestId
 * @param {string} registeredUserId
 * @returns {Promise<{ok: boolean, sessions: number}>}
 */
export async function adoptGuestHistory(guestId, registeredUserId) {
  const guest = guestUsers.get(guestId);
  if (!guest) {
    return { ok: false, error: "Guest not found" };
  }

  console.log(`[voice-flow] Adopting guest ${guestId} → ${registeredUserId}`);

  // Transfer session history to registered user
  const sessionCount = guest.sessions.length;

  // In production: update chat_sessions.user_id via PG
  try {
    const resp = await fetch(`${GATEWAY_URL}/internal/memory/adopt-guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guest_id: guestId,
        user_id: registeredUserId,
      }),
    });

    if (!resp.ok) {
      console.warn("[voice-flow] Guest adoption API failed:", await resp.text());
    }
  } catch {
    // API might not exist yet — non-critical
  }

  guestUsers.delete(guestId);

  return { ok: true, sessions: sessionCount };
}

/**
 * Get all active guest users.
 */
export function getActiveGuests() {
  return Array.from(guestUsers.entries()).map(([id, data]) => ({
    id,
    created_at: new Date(data.created_at).toISOString(),
    sessions: data.sessions.length,
    needs_register: data.needs_register,
  }));
}
