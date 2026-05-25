import { GatewayClient } from "./ws-gateway.js";

const client = new GatewayClient();

try {
  console.log("[test] Connecting with device identity...");
  const start = Date.now();
  await client.connect();
  const connectTime = Date.now() - start;
  console.log(`[test] Connected in ${connectTime}ms!`);

  console.log("\n[test] Test 1: agents.list");
  try {
    const agents = await client.request("agents.list", {});
    console.log("[test] agents.list OK:", JSON.stringify(agents).slice(0, 200));
  } catch (err) {
    console.log("[test] agents.list failed:", err.message);
  }

  console.log("\n[test] Test 2: sessions.list");
  try {
    const sessions = await client.request("sessions.list", {});
    console.log("[test] sessions.list OK:", JSON.stringify(sessions).slice(0, 200));
  } catch (err) {
    console.log("[test] sessions.list failed:", err.message);
  }

  console.log("\n[test] Test 3: chat (sessions.send)");
  try {
    const cStart = Date.now();
    const result = await client.request("sessions.send", {
      sessionId: "main",
      message: "你好，一句话回复",
    });
    const cTime = Date.now() - cStart;
    console.log(`[test] Chat response in ${cTime}ms:`, JSON.stringify(result).slice(0, 300));
  } catch (err) {
    console.log("[test] Chat failed:", err.message);
  }

  console.log("\n[test] Done");
  client.close();
  process.exit(0);
} catch (err) {
  console.error("[test] Failed:", err.message);
  process.exit(1);
}
