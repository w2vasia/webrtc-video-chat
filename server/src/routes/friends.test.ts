import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { friendRoutes } from "./friends";
import { authMiddleware } from "../middleware/auth";
import { createToken } from "../auth";
import { getDb, migrate } from "../db";

let db: ReturnType<typeof getDb>;
let app: Hono;
let tokenA: string;
let tokenB: string;

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
  app.route("/api/friends", friendRoutes(db));

  const userA = await createUser("alice@test.com", "Alice");
  const userB = await createUser("bob@test.com", "Bob");
  tokenA = await createToken(userA.id, "alice@test.com");
  tokenB = await createToken(userB.id, "bob@test.com");
});

describe("GET /api/friends/search", () => {
  it("finds user by email", async () => {
    const res = await app.request("/api/friends/search?email=bob@test.com", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("bob@test.com");
  });

  it("returns 404 for unknown email", async () => {
    const res = await app.request("/api/friends/search?email=nobody@test.com", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/friends/request", () => {
  it("sends friend request", async () => {
    const res = await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });
    expect(res.status).toBe(201);
  });

  it("prevents duplicate request", async () => {
    const body = JSON.stringify({ email: "bob@test.com" });
    const opts = {
      method: "POST" as const,
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body,
    };
    await app.request("/api/friends/request", opts);
    const res = await app.request("/api/friends/request", opts);
    expect(res.status).toBe(409);
  });
});

describe("POST /api/friends/accept", () => {
  it("accepts pending request", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });

    const res = await app.request("/api/friends/accept", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 1 }),
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/friends", () => {
  it("lists accepted friends", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });
    await app.request("/api/friends/accept", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 1 }),
    });

    const res = await app.request("/api/friends", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.friends).toHaveLength(1);
    expect(body.friends[0].email).toBe("bob@test.com");
  });
});

describe("GET /api/friends/pending", () => {
  it("lists incoming requests", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });

    const res = await app.request("/api/friends/pending", {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toHaveLength(1);
  });
});

describe("POST /api/friends/reject", () => {
  it("reject returns 404 for nonexistent friendship", async () => {
    const res = await app.request("/api/friends/reject", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 99999 }),
    });
    expect(res.status).toBe(404);
  });
});
