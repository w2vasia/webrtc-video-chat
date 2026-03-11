import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { keyRoutes } from "./keys";
import { authMiddleware } from "../middleware/auth";
import { createToken } from "../auth";
import { getDb, migrate } from "../db";

let db: ReturnType<typeof getDb>;
let app: Hono;
let tokenA: string;
let tokenB: string;
let userAId: number;
let userBId: number;

async function createUser(email: string, name: string) {
  const hash = await Bun.password.hash("password123", { algorithm: "argon2id" });
  return db
    .query("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING id")
    .get(email, hash, name) as { id: number };
}

function makeFriends(idA: number, idB: number) {
  db.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')").run(idA, idB);
}

beforeEach(async () => {
  db = getDb(":memory:");
  migrate(db);
  app = new Hono();
  app.use("/api/*", authMiddleware());
  app.route("/api/keys", keyRoutes(db));

  const userA = await createUser("alice@test.com", "Alice");
  const userB = await createUser("bob@test.com", "Bob");
  userAId = userA.id;
  userBId = userB.id;
  tokenA = await createToken(userA.id, "alice@test.com");
  tokenB = await createToken(userB.id, "bob@test.com");
});

describe("POST /api/keys", () => {
  it("uploads public keys", async () => {
    const res = await app.request("/api/keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ identityKey: "base64key==", signedPreKey: "base64prekey==" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("upserts — updates existing keys on second upload", async () => {
    const opts = (key: string) => ({
      method: "POST" as const,
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ identityKey: key, signedPreKey: "prekey==" }),
    });
    await app.request("/api/keys", opts("key1=="));
    const res = await app.request("/api/keys", opts("key2=="));
    expect(res.status).toBe(200);
    const row = db
      .query("SELECT identity_key FROM public_keys WHERE user_id = ?")
      .get(userAId) as { identity_key: string };
    expect(row.identity_key).toBe("key2==");
  });

  it("returns 400 when identityKey is missing", async () => {
    const res = await app.request("/api/keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ signedPreKey: "prekey==" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when signedPreKey is missing", async () => {
    const res = await app.request("/api/keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ identityKey: "key==" }),
    });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await app.request("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityKey: "key==", signedPreKey: "prekey==" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/keys/:userId", () => {
  beforeEach(async () => {
    await app.request("/api/keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ identityKey: "alicekey==", signedPreKey: "aliceprekey==" }),
    });
  });

  it("fetches friend's keys when friends", async () => {
    makeFriends(userAId, userBId);
    const res = await app.request(`/api/keys/${userAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identityKey).toBe("alicekey==");
    expect(body.signedPreKey).toBe("aliceprekey==");
  });

  it("fetches own keys without friendship requirement", async () => {
    const res = await app.request(`/api/keys/${userAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identityKey).toBe("alicekey==");
  });

  it("returns 403 when requester is not friends with target", async () => {
    const res = await app.request(`/api/keys/${userAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when user has not uploaded any keys", async () => {
    makeFriends(userAId, userBId);
    const res = await app.request(`/api/keys/${userBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-numeric userId", async () => {
    const res = await app.request("/api/keys/abc", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for userId zero", async () => {
    const res = await app.request("/api/keys/0", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await app.request(`/api/keys/${userAId}`);
    expect(res.status).toBe(401);
  });
});
