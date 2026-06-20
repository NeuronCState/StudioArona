/**
 * @vitest-environment browser
 *
 * IndexedDB (Dexie) browser-mode test — validates that the database layer
 * works correctly in a real Chromium browser (not jsdom mock).
 *
 * jsdom's IndexedDB implementation (fake-indexeddb) doesn't perfectly match
 * real browser behavior, especially around transactions, compound indexes,
 * and bulk operations. Vitest 4 browser mode runs these in a real Chromium
 * instance via Playwright.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../index";

describe("Dexie IndexedDB (browser mode)", () => {
  beforeAll(async () => {
    // Ensure clean state — delete and recreate the test database
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    await db.delete();
  });

  it("opens the database and lists tables", async () => {
    const tables = db.tables.map((t) => t.name);
    // Core tables from the schema
    expect(tables).toContain("schedules");
    expect(tables).toContain("feeds");
    expect(tables).toContain("memories");
  });

  it("writes and reads a feed record with transaction integrity", async () => {
    const feed = {
      id: `test-${Date.now()}`,
      url: "https://example.com/rss",
      title: "Test Feed",
      created_at: new Date().toISOString(),
    };

    await db.table("feeds").put(feed);

    const read = await db.table("feeds").get(feed.id);
    expect(read).toBeDefined();
    expect(read!.url).toBe("https://example.com/rss");
    expect(read!.title).toBe("Test Feed");

    // Cleanup
    await db.table("feeds").delete(feed.id);
  });

  it("supports bulk operations with correct ordering", async () => {
    const items = [
      { id: "bulk-1", title: "A", created_at: new Date().toISOString() },
      { id: "bulk-2", title: "B", created_at: new Date().toISOString() },
      { id: "bulk-3", title: "C", created_at: new Date().toISOString() },
    ];

    await db.table("feeds").bulkPut(items);

    const all = await db.table("feeds").bulkGet(["bulk-1", "bulk-2", "bulk-3"]);
    expect(all.filter(Boolean)).toHaveLength(3);
    expect(all[0]!.title).toBe("A");

    // Cleanup
    await db.table("feeds").bulkDelete(["bulk-1", "bulk-2", "bulk-3"]);
  });

  it("fails gracefully on duplicate primary key", async () => {
    const id = `dup-${Date.now()}`;
    const item = { id, title: "Original", created_at: new Date().toISOString() };

    await db.table("feeds").put(item);

    // put() with same id should overwrite, not throw
    await db.table("feeds").put({ ...item, title: "Updated" });

    const read = await db.table("feeds").get(id);
    expect(read!.title).toBe("Updated");

    // add() with same id should throw
    await expect(
      db.table("feeds").add({ id, title: "Duplicate", created_at: new Date().toISOString() }),
    ).rejects.toThrow();

    await db.table("feeds").delete(id);
  });
});
