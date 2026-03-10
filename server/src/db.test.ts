import { describe, it, expect, beforeEach } from "bun:test";
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
});
