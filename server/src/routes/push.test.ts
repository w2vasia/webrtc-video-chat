import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { pushRoutes } from "./push";
import { authMiddleware } from "../middleware/auth";
import { createToken } from "../auth";
import { getDb, migrate } from "../db";

let db: ReturnType<typeof getDb>;
let app: Hono;
let tokenA: string;
let userAId: number;

async function createUser(email: string, name: string) {
  const hash = await Bun.password.hash("password123", { algorithm: "argon2id" });
  return db
    .query("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING id")
    .get(email, hash, name) as { id: number };
}

beforeEach(async () => {
  db = getDb(":memory:");
  migrate(db);
  app = new Hono();
  app.use("/api/*", authMiddleware());
  app.route("/api/push", pushRoutes(db));

  const userA = await createUser("alice@test.com", "Alice");
  userAId = userA.id;
  tokenA = await createToken(userA.id, "alice@test.com");
});

describe("GET /api/push/vapid-key", () => {
  it("returns publicKey field (empty string when VAPID not configured)", async () => {
    const res = await app.request("/api/push/vapid-key", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("publicKey");
    expect(typeof body.publicKey).toBe("string");
  });

  it("requires authentication", async () => {
    const res = await app.request("/api/push/vapid-key");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/push/subscribe", () => {
  const subscription = {
    endpoint: "https://push.example.com/subscribe/abc123",
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtZ5MZwqZQNJQhzSmVMP==",
    auth: "tBHItJI5svbpez7KI4CCXg==",
  };

  it("stores push subscription and returns ok", async () => {
    const res = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const row = db
      .query("SELECT * FROM push_subscriptions WHERE user_id = ?")
      .get(userAId) as { endpoint: string; p256dh: string } | null;
    expect(row).not.toBeNull();
    expect(row?.endpoint).toBe(subscription.endpoint);
    expect(row?.p256dh).toBe(subscription.p256dh);
  });

  it("upserts — updates keys on duplicate endpoint", async () => {
    await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });

    const updated = { ...subscription, p256dh: "newkey==", auth: "newauth==" };
    const res = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    expect(res.status).toBe(200);

    const rows = db
      .query("SELECT * FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
      .all(userAId, subscription.endpoint) as Array<{ p256dh: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("newkey==");
  });

  it("allows multiple subscriptions per user (different endpoints)", async () => {
    await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription, endpoint: "https://push.example.com/subscribe/xyz456" }),
    });

    const rows = db
      .query("SELECT * FROM push_subscriptions WHERE user_id = ?")
      .all(userAId);
    expect(rows).toHaveLength(2);
  });

  it("requires authentication", async () => {
    const res = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    expect(res.status).toBe(401);
  });
});
