import { describe, it, expect } from "bun:test";
import { getDb, migrate } from "./db";

describe("database", () => {
  it("creates all tables", () => {
    const db = getDb(":memory:");
    migrate(db);
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("friendships");
    expect(names).toContain("messages");
    expect(names).toContain("public_keys");
    expect(names).toContain("push_subscriptions");
  });

  it("sets busy_timeout > 0 so concurrent writes retry instead of failing immediately", () => {
    const db = getDb(":memory:");
    const row = db.query("PRAGMA busy_timeout").get() as { timeout: number };
    expect(row.timeout).toBeGreaterThan(0);
  });

  it("records each migration name in _migrations exactly once (idempotent)", () => {
    const db = getDb(":memory:");
    migrate(db);
    const rows1 = db.query("SELECT name FROM _migrations ORDER BY name").all() as { name: string }[];
    migrate(db); // second run — should be a no-op
    const rows2 = db.query("SELECT name FROM _migrations ORDER BY name").all() as { name: string }[];
    expect(rows2).toEqual(rows1);
    expect(rows2.length).toBeGreaterThanOrEqual(1);
  });
});
