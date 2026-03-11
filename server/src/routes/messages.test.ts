import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { messageRoutes } from "./messages";
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

function insertMessage(from: number, to: number, cipher = "cipher==", nonce = "nonce1234567890a") {
  return db
    .query("INSERT INTO messages (sender_id, recipient_id, ciphertext, nonce, delivered) VALUES (?, ?, ?, ?, 1) RETURNING id")
    .get(from, to, cipher, nonce) as { id: number };
}

beforeEach(async () => {
  db = getDb(":memory:");
  migrate(db);
  app = new Hono();
  app.use("/api/*", authMiddleware());
  app.route("/api/messages", messageRoutes(db));

  const userA = await createUser("alice@test.com", "Alice");
  const userB = await createUser("bob@test.com", "Bob");
  userAId = userA.id;
  userBId = userB.id;
  tokenA = await createToken(userA.id, "alice@test.com");
  tokenB = await createToken(userB.id, "bob@test.com");
});

describe("GET /api/messages/:friendId", () => {
  it("returns empty array when no messages exist", async () => {
    makeFriends(userAId, userBId);
    const res = await app.request(`/api/messages/${userBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual([]);
  });

  it("returns messages between two friends in ascending order", async () => {
    makeFriends(userAId, userBId);
    insertMessage(userAId, userBId, "c1", "nonce1234567890a");
    insertMessage(userBId, userAId, "c2", "nonce1234567890b");

    const res = await app.request(`/api/messages/${userBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].from).toBe(userAId);
    expect(body.messages[1].from).toBe(userBId);
    expect(body.messages[0].id).toBeLessThan(body.messages[1].id);
  });

  it("returns 403 when not friends", async () => {
    const res = await app.request(`/api/messages/${userBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for non-numeric friendId", async () => {
    const res = await app.request("/api/messages/abc", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for friendId zero", async () => {
    const res = await app.request("/api/messages/0", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(400);
  });

  it("paginates with before_id cursor — only returns older messages", async () => {
    makeFriends(userAId, userBId);
    insertMessage(userAId, userBId, "c1", "nonce1234567890a");
    insertMessage(userAId, userBId, "c2", "nonce1234567890b");
    const msg3 = insertMessage(userAId, userBId, "c3", "nonce1234567890c");

    const res = await app.request(`/api/messages/${userBId}?before_id=${msg3.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages.every((m: { id: number }) => m.id < msg3.id)).toBe(true);
  });

  it("returns 400 for non-numeric before_id", async () => {
    makeFriends(userAId, userBId);
    const res = await app.request(`/api/messages/${userBId}?before_id=notanumber`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for before_id zero", async () => {
    makeFriends(userAId, userBId);
    const res = await app.request(`/api/messages/${userBId}?before_id=0`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(400);
  });

  it("includes readAt in milliseconds when message is read", async () => {
    makeFriends(userAId, userBId);
    const msg = insertMessage(userBId, userAId, "cipher==", "nonce1234567890a");
    db.query("UPDATE messages SET read_at = unixepoch() WHERE id = ?").run(msg.id);

    const res = await app.request(`/api/messages/${userBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const body = await res.json();
    expect(body.messages[0].readAt).not.toBeNull();
    expect(body.messages[0].readAt).toBeGreaterThan(1_000_000_000_000); // ms timestamp
  });

  it("returns readAt as null for unread messages", async () => {
    makeFriends(userAId, userBId);
    insertMessage(userBId, userAId, "cipher==", "nonce1234567890a");

    const res = await app.request(`/api/messages/${userBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const body = await res.json();
    expect(body.messages[0].readAt).toBeNull();
  });

  it("requires authentication", async () => {
    const res = await app.request(`/api/messages/${userBId}`);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/messages/:friendId", () => {
  it("deletes all messages in a conversation and returns count", async () => {
    makeFriends(userAId, userBId);
    insertMessage(userAId, userBId, "c1", "nonce1234567890a");
    insertMessage(userBId, userAId, "c2", "nonce1234567890b");

    const res = await app.request(`/api/messages/${userBId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(2);

    const count = db.query("SELECT COUNT(*) as n FROM messages").get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("returns deleted=0 when no messages exist", async () => {
    const res = await app.request(`/api/messages/${userBId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(0);
  });

  it("returns 400 for invalid friendId", async () => {
    const res = await app.request("/api/messages/0", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await app.request(`/api/messages/${userBId}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});
