import { describe, it, expect, beforeEach } from "bun:test";
import type { ServerWebSocket } from "bun";
import { createWsHandlers, getOnlineUsers } from "./ws";
import type { WsData } from "./ws";
import { createToken } from "./auth";
import { getDb, migrate } from "./db";

type MockWs = {
  data: WsData;
  sent: string[];
  closeArgs: { code?: number; reason?: string } | null;
  send(msg: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
};

function makeMockWs(initial: Partial<WsData> = {}): MockWs {
  return {
    data: { authenticated: false, ...initial },
    sent: [],
    closeArgs: null,
    send(msg) {
      this.sent.push(typeof msg === "string" ? msg : "[binary]");
    },
    close(code?: number, reason?: string) {
      this.closeArgs = { code, reason };
    },
  };
}

function lastMsg(ws: MockWs): Record<string, unknown> {
  return JSON.parse(ws.sent[ws.sent.length - 1]);
}

function allTypes(ws: MockWs): string[] {
  return ws.sent.map((s) => JSON.parse(s).type);
}

async function createUser(db: ReturnType<typeof getDb>, email: string, name: string) {
  const hash = await Bun.password.hash("password123", { algorithm: "argon2id" });
  return db
    .query("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING id")
    .get(email, hash, name) as { id: number };
}

function makeFriends(db: ReturnType<typeof getDb>, idA: number, idB: number) {
  db.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')").run(idA, idB);
}

async function authWs(
  handlers: ReturnType<typeof createWsHandlers>,
  ws: MockWs,
  userId: number,
  email: string,
) {
  handlers.open(ws as unknown as ServerWebSocket<WsData>);
  const token = await createToken(userId, email);
  await handlers.message(ws as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "auth", token }));
}

let db: ReturnType<typeof getDb>;
let handlers: ReturnType<typeof createWsHandlers>;

beforeEach(() => {
  db = getDb(":memory:");
  migrate(db);
  handlers = createWsHandlers(db);
  getOnlineUsers().clear();
});

// ─── open ─────────────────────────────────────────────────────────────────────

describe("open", () => {
  it("initialises ws.data with authenticated = false", () => {
    const ws = makeMockWs({ authenticated: true }); // pre-set to true to prove reset
    handlers.open(ws as unknown as ServerWebSocket<WsData>);
    expect(ws.data.authenticated).toBe(false);
  });
});

// ─── auth handshake ───────────────────────────────────────────────────────────

describe("message — auth", () => {
  it("authenticates with valid token and responds with 'authenticated'", async () => {
    const user = await createUser(db, "alice@test.com", "Alice");
    const ws = makeMockWs();
    await authWs(handlers, ws, user.id, "alice@test.com");

    expect(ws.data.authenticated).toBe(true);
    expect(ws.data.userId).toBe(user.id);
    expect(lastMsg(ws).type).toBe("authenticated");
  });

  it("adds authenticated user to onlineUsers map", async () => {
    const user = await createUser(db, "alice@test.com", "Alice");
    const ws = makeMockWs();
    await authWs(handlers, ws, user.id, "alice@test.com");

    expect(getOnlineUsers().has(user.id)).toBe(true);
  });

  it("rejects invalid token with error message and closes connection", async () => {
    const ws = makeMockWs();
    handlers.open(ws as unknown as ServerWebSocket<WsData>);
    await handlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "auth", token: "bad.token.here" }),
    );

    expect(lastMsg(ws).type).toBe("error");
    expect(ws.closeArgs).not.toBeNull();
    expect(ws.data.authenticated).toBe(false);
  });

  it("delivers queued offline messages on authentication", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    db.query(
      "INSERT INTO messages (sender_id, recipient_id, ciphertext, nonce, delivered) VALUES (?, ?, ?, ?, 0)",
    ).run(userA.id, userB.id, "cipher==", "nonce1234567890a");

    const wsB = makeMockWs();
    await authWs(handlers, wsB, userB.id, "bob@test.com");

    expect(allTypes(wsB)).toContain("authenticated");
    expect(allTypes(wsB)).toContain("chat");

    const chatMsg = wsB.sent.map((s) => JSON.parse(s)).find((m) => m.type === "chat");
    expect(chatMsg.from).toBe(userA.id);
    expect(chatMsg.ciphertext).toBe("cipher==");
  });

  it("marks delivered offline messages as delivered=1 in DB", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    const msg = db
      .query(
        "INSERT INTO messages (sender_id, recipient_id, ciphertext, nonce, delivered) VALUES (?, ?, ?, ?, 0) RETURNING id",
      )
      .get(userA.id, userB.id, "cipher==", "nonce1234567890a") as { id: number };

    const wsB = makeMockWs();
    await authWs(handlers, wsB, userB.id, "bob@test.com");

    const row = db
      .query("SELECT delivered FROM messages WHERE id = ?")
      .get(msg.id) as { delivered: number };
    expect(row.delivered).toBe(1);
  });

  it("broadcasts online presence to friends on authentication", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    const wsB = makeMockWs();
    await authWs(handlers, wsB, userB.id, "bob@test.com");
    wsB.sent = [];

    const wsA = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");

    // Bob should receive a presence event for Alice coming online
    expect(allTypes(wsB)).toContain("presence");
    const presence = wsB.sent.map((s) => JSON.parse(s)).find((m) => m.type === "presence");
    expect(presence.userId).toBe(userA.id);
    expect(presence.online).toBe(true);
  });

  it("sends presence for already-online friends on authentication", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    // Alice connects first
    const wsA = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");

    // Bob connects second — should be told Alice is already online
    const wsB = makeMockWs();
    await authWs(handlers, wsB, userB.id, "bob@test.com");

    const presence = wsB.sent.map((s) => JSON.parse(s)).find((m) => m.type === "presence");
    expect(presence).not.toBeUndefined();
    expect(presence.userId).toBe(userA.id);
    expect(presence.online).toBe(true);
  });

  it("replaces existing session — sends session-replaced and closes with code 4000", async () => {
    const user = await createUser(db, "alice@test.com", "Alice");

    const ws1 = makeMockWs();
    await authWs(handlers, ws1, user.id, "alice@test.com");

    const ws2 = makeMockWs();
    await authWs(handlers, ws2, user.id, "alice@test.com");

    expect(allTypes(ws1)).toContain("session-replaced");
    expect(ws1.closeArgs?.code).toBe(4000);
    expect(ws2.data.authenticated).toBe(true);
  });

  it("ignores non-auth messages when not authenticated", async () => {
    const ws = makeMockWs();
    handlers.open(ws as unknown as ServerWebSocket<WsData>);
    await handlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "chat", to: 1, ciphertext: "x", nonce: "nonce1234567890a", clientId: "id" }),
    );
    expect(ws.sent).toHaveLength(0);
  });
});

// ─── chat ─────────────────────────────────────────────────────────────────────

describe("message — chat", () => {
  let userAId: number;
  let userBId: number;
  let wsA: MockWs;
  let wsB: MockWs;

  beforeEach(async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    userAId = userA.id;
    userBId = userB.id;
    makeFriends(db, userAId, userBId);

    wsA = makeMockWs();
    wsB = makeMockWs();
    await authWs(handlers, wsA, userAId, "alice@test.com");
    await authWs(handlers, wsB, userBId, "bob@test.com");
    wsA.sent = [];
    wsB.sent = [];
  });

  it("relays message to recipient and ACKs sender", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({
        type: "chat",
        to: userBId,
        ciphertext: "encryptedmsg==",
        nonce: "nonce1234567890a",
        clientId: "client-uuid-123",
      }),
    );

    const ack = lastMsg(wsA);
    expect(ack.type).toBe("chat-ack");
    expect(ack.clientId).toBe("client-uuid-123");
    expect(typeof ack.serverId).toBe("number");

    const relayed = lastMsg(wsB);
    expect(relayed.type).toBe("chat");
    expect(relayed.from).toBe(userAId);
    expect(relayed.ciphertext).toBe("encryptedmsg==");
    expect(relayed.id).toBe(ack.serverId);
  });

  it("persists message in DB with delivered=1 when recipient is online", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({
        type: "chat",
        to: userBId,
        ciphertext: "cipher==",
        nonce: "nonce1234567890a",
        clientId: "test-id",
      }),
    );

    const msg = db
      .query("SELECT * FROM messages WHERE sender_id = ? AND recipient_id = ?")
      .get(userAId, userBId) as { ciphertext: string; delivered: number } | null;
    expect(msg).not.toBeNull();
    expect(msg?.ciphertext).toBe("cipher==");
    expect(msg?.delivered).toBe(1);
  });

  it("persists message with delivered=0 when recipient is offline", async () => {
    // Close Bob's connection so he is offline
    handlers.close(wsB as unknown as ServerWebSocket<WsData>);

    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({
        type: "chat",
        to: userBId,
        ciphertext: "cipher==",
        nonce: "nonce1234567890a",
        clientId: "test-id",
      }),
    );

    const msg = db
      .query("SELECT delivered FROM messages WHERE sender_id = ? AND recipient_id = ?")
      .get(userAId, userBId) as { delivered: number } | null;
    expect(msg?.delivered).toBe(0);
  });

  it("rejects message to non-friend with error", async () => {
    const userC = await createUser(db, "charlie@test.com", "Charlie");
    const wsC = makeMockWs();
    await authWs(handlers, wsC, userC.id, "charlie@test.com");
    wsC.sent = [];

    await handlers.message(
      wsC as unknown as ServerWebSocket<WsData>,
      JSON.stringify({
        type: "chat",
        to: userAId,
        ciphertext: "cipher==",
        nonce: "nonce1234567890a",
        clientId: "test-id",
      }),
    );

    expect(lastMsg(wsC).type).toBe("error");
    const dbMsg = db.query("SELECT id FROM messages WHERE sender_id = ?").get(userC.id);
    expect(dbMsg).toBeNull();
  });

  it("drops oversized ciphertext (>65536 bytes) without ACK", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({
        type: "chat",
        to: userBId,
        ciphertext: "x".repeat(65537),
        nonce: "nonce1234567890a",
        clientId: "test-id",
      }),
    );
    expect(wsA.sent).toHaveLength(0);
    expect(wsB.sent).toHaveLength(0);
  });

  it("drops message with nonce shorter than 12 characters", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({
        type: "chat",
        to: userBId,
        ciphertext: "cipher==",
        nonce: "short",
        clientId: "test-id",
      }),
    );
    expect(wsA.sent).toHaveLength(0);
  });

  it("drops message with nonce longer than 64 characters", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({
        type: "chat",
        to: userBId,
        ciphertext: "cipher==",
        nonce: "n".repeat(65),
        clientId: "test-id",
      }),
    );
    expect(wsA.sent).toHaveLength(0);
  });
});

// ─── typing ───────────────────────────────────────────────────────────────────

describe("message — typing", () => {
  it("relays isTyping=true to friend", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    const wsA = makeMockWs();
    const wsB = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");
    await authWs(handlers, wsB, userB.id, "bob@test.com");
    wsB.sent = [];

    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "typing", to: userB.id, isTyping: true }),
    );

    const msg = lastMsg(wsB);
    expect(msg.type).toBe("typing");
    expect(msg.from).toBe(userA.id);
    expect(msg.isTyping).toBe(true);
  });

  it("relays isTyping=false to friend", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    const wsA = makeMockWs();
    const wsB = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");
    await authWs(handlers, wsB, userB.id, "bob@test.com");
    wsB.sent = [];

    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "typing", to: userB.id, isTyping: false }),
    );

    const msg = lastMsg(wsB);
    expect(msg.isTyping).toBe(false);
  });

  it("does not relay typing to non-friend", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    // NOT making them friends

    const wsA = makeMockWs();
    const wsB = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");
    await authWs(handlers, wsB, userB.id, "bob@test.com");
    wsB.sent = [];

    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "typing", to: userB.id, isTyping: true }),
    );

    expect(wsB.sent).toHaveLength(0);
  });
});

// ─── read receipt ─────────────────────────────────────────────────────────────

describe("message — read", () => {
  it("sets read_at in DB and notifies sender", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    const msg = db
      .query(
        "INSERT INTO messages (sender_id, recipient_id, ciphertext, nonce, delivered) VALUES (?, ?, ?, ?, 1) RETURNING id",
      )
      .get(userA.id, userB.id, "cipher==", "nonce1234567890a") as { id: number };

    const wsA = makeMockWs();
    const wsB = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");
    await authWs(handlers, wsB, userB.id, "bob@test.com");
    wsA.sent = [];

    await handlers.message(
      wsB as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "read", messageId: msg.id, senderId: userA.id }),
    );

    const row = db
      .query("SELECT read_at FROM messages WHERE id = ?")
      .get(msg.id) as { read_at: number | null };
    expect(row.read_at).not.toBeNull();

    const notification = lastMsg(wsA);
    expect(notification.type).toBe("read");
    expect(notification.messageId).toBe(msg.id);
  });

  it("does not notify arbitrary user when senderId does not own the message", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    const userC = await createUser(db, "charlie@test.com", "Charlie");
    makeFriends(db, userA.id, userB.id);
    makeFriends(db, userA.id, userC.id);

    // Message from A to B
    const msg = db
      .query("INSERT INTO messages (sender_id, recipient_id, ciphertext, nonce, delivered) VALUES (?, ?, ?, ?, 1) RETURNING id")
      .get(userA.id, userB.id, "cipher==", "nonce1234567890a") as { id: number };

    const wsA = makeMockWs();
    const wsC = makeMockWs();
    const wsB = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");
    await authWs(handlers, wsC, userC.id, "charlie@test.com");
    await authWs(handlers, wsB, userB.id, "bob@test.com");
    wsA.sent = [];
    wsC.sent = [];

    // B sends read but lies and claims C sent the message
    await handlers.message(
      wsB as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "read", messageId: msg.id, senderId: userC.id }),
    );

    // C must NOT receive a spurious read notification
    expect(wsC.sent).toHaveLength(0);
    // A (the real sender) must NOT receive it either (wrong senderId)
    expect(wsA.sent).toHaveLength(0);
  });

  it("drops read message with non-integer messageId", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    const wsA = makeMockWs();
    const wsB = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");
    await authWs(handlers, wsB, userB.id, "bob@test.com");
    wsA.sent = [];

    await handlers.message(
      wsB as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "read", messageId: "not-a-number", senderId: userA.id }),
    );

    expect(wsA.sent).toHaveLength(0);
  });
});

// ─── call signaling ───────────────────────────────────────────────────────────

describe("message — call signaling", () => {
  let userAId: number;
  let userBId: number;
  let wsA: MockWs;
  let wsB: MockWs;

  beforeEach(async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    userAId = userA.id;
    userBId = userB.id;
    makeFriends(db, userAId, userBId);

    wsA = makeMockWs();
    wsB = makeMockWs();
    await authWs(handlers, wsA, userAId, "alice@test.com");
    await authWs(handlers, wsB, userBId, "bob@test.com");
    wsA.sent = [];
    wsB.sent = [];
  });

  it("relays call-offer to target", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "call-offer", targetId: userBId, offer: { sdp: "v=0...", type: "offer" } }),
    );

    const msg = lastMsg(wsB);
    expect(msg.type).toBe("call-offer");
    expect(msg.senderId).toBe(userAId);
  });

  it("relays call-answer to target", async () => {
    await handlers.message(
      wsB as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "call-answer", targetId: userAId, answer: { sdp: "v=0...", type: "answer" } }),
    );

    const msg = lastMsg(wsA);
    expect(msg.type).toBe("call-answer");
    expect(msg.senderId).toBe(userBId);
  });

  it("relays ice-candidate to target", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "ice-candidate", targetId: userBId, candidate: { candidate: "candidate:0 1 UDP ..." } }),
    );

    const msg = lastMsg(wsB);
    expect(msg.type).toBe("ice-candidate");
    expect(msg.senderId).toBe(userAId);
  });

  it("relays call-end to target", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "call-end", targetId: userBId }),
    );

    const msg = lastMsg(wsB);
    expect(msg.type).toBe("call-end");
    expect(msg.senderId).toBe(userAId);
  });

  it("drops call-offer to non-friend", async () => {
    const userC = await createUser(db, "charlie@test.com", "Charlie");
    const wsC = makeMockWs();
    await authWs(handlers, wsC, userC.id, "charlie@test.com");
    wsA.sent = [];

    await handlers.message(
      wsC as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "call-offer", targetId: userAId, offer: {} }),
    );

    expect(wsA.sent).toHaveLength(0);
  });
});

// ─── ping/pong ────────────────────────────────────────────────────────────────

describe("message — ping", () => {
  it("responds with pong when authenticated client sends ping", async () => {
    const user = await createUser(db, "alice@test.com", "Alice");
    const ws = makeMockWs();
    await authWs(handlers, ws, user.id, "alice@test.com");
    ws.sent = [];

    await handlers.message(ws as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "ping" }));

    expect(lastMsg(ws).type).toBe("pong");
  });
});

// ─── close ────────────────────────────────────────────────────────────────────

describe("close", () => {
  it("removes user from onlineUsers on disconnect", async () => {
    const user = await createUser(db, "alice@test.com", "Alice");
    const ws = makeMockWs();
    await authWs(handlers, ws, user.id, "alice@test.com");
    expect(getOnlineUsers().has(user.id)).toBe(true);

    handlers.close(ws as unknown as ServerWebSocket<WsData>);
    expect(getOnlineUsers().has(user.id)).toBe(false);
  });

  it("broadcasts offline presence to online friends on disconnect", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    const wsA = makeMockWs();
    const wsB = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");
    await authWs(handlers, wsB, userB.id, "bob@test.com");
    wsB.sent = [];

    handlers.close(wsA as unknown as ServerWebSocket<WsData>);

    const presence = wsB.sent.map((s) => JSON.parse(s)).find((m) => m.type === "presence");
    expect(presence).not.toBeUndefined();
    expect(presence.userId).toBe(userA.id);
    expect(presence.online).toBe(false);
  });

  it("updates last_seen on disconnect", async () => {
    const user = await createUser(db, "alice@test.com", "Alice");
    const ws = makeMockWs();
    await authWs(handlers, ws, user.id, "alice@test.com");

    // Reset last_seen after auth to prove close updates it independently
    db.query("UPDATE users SET last_seen = 0 WHERE id = ?").run(user.id);
    handlers.close(ws as unknown as ServerWebSocket<WsData>);

    const row = db.query("SELECT last_seen FROM users WHERE id = ?").get(user.id) as { last_seen: number };
    expect(row.last_seen).toBeGreaterThan(0);
  });

  it("does not remove user from onlineUsers when a stale WS closes after session was replaced", async () => {
    const userA = await createUser(db, "alice@test.com", "Alice");
    const userB = await createUser(db, "bob@test.com", "Bob");
    makeFriends(db, userA.id, userB.id);

    const wsA = makeMockWs();
    await authWs(handlers, wsA, userA.id, "alice@test.com");

    // B connects (first session)
    const wsBold = makeMockWs();
    await authWs(handlers, wsBold, userB.id, "bob@test.com");

    // B reconnects (new session replaces old) — simulates async close race
    const wsBnew = makeMockWs();
    await authWs(handlers, wsBnew, userB.id, "bob@test.com");
    wsA.sent = [];

    // Old WS close fires AFTER new session is already established
    handlers.close(wsBold as unknown as ServerWebSocket<WsData>);

    // B should still be in onlineUsers (new session, not the stale one)
    expect(getOnlineUsers().has(userB.id)).toBe(true);
    expect(getOnlineUsers().get(userB.id)!.ws).toBe(wsBnew as unknown as ServerWebSocket<WsData>);

    // A should NOT receive an offline presence event for B
    const offlinePresence = wsA.sent.map((s) => JSON.parse(s)).find((m) => m.type === "presence" && m.online === false);
    expect(offlinePresence).toBeUndefined();
  });

  it("does not throw when unauthenticated connection closes", () => {
    const ws = makeMockWs();
    handlers.open(ws as unknown as ServerWebSocket<WsData>);
    expect(() => handlers.close(ws as unknown as ServerWebSocket<WsData>)).not.toThrow();
  });
});
