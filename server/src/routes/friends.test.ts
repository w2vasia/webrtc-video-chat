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

  it("addressee can reject a pending request", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });

    const res = await app.request("/api/friends/reject", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 1 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("requester can cancel their own pending request", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });

    const res = await app.request("/api/friends/reject", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 1 }),
    });
    expect(res.status).toBe(200);
  });

  it("can remove an already accepted friendship", async () => {
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

    const res = await app.request("/api/friends/reject", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 1 }),
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/friends/request — edge cases", () => {
  it("returns 400 when trying to befriend yourself", async () => {
    const res = await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when target email does not exist", async () => {
    const res = await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@test.com" }),
    });
    expect(res.status).toBe(404);
  });

  it("prevents reverse duplicate (B→A when A→B exists)", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });

    const res = await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/friends/accept — edge cases", () => {
  it("returns 404 when requester tries to accept their own outgoing request", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });

    const res = await app.request("/api/friends/accept", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for nonexistent friendshipId", async () => {
    const res = await app.request("/api/friends/accept", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 99999 }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/friends — edge cases", () => {
  it("returns empty list when user has no friends", async () => {
    const res = await app.request("/api/friends", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.friends).toEqual([]);
  });
});

describe("GET /api/friends/pending — edge cases", () => {
  it("returns empty list when no pending requests", async () => {
    const res = await app.request("/api/friends/pending", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toEqual([]);
  });

  it("does not show outgoing requests to requester", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });

    const res = await app.request("/api/friends/pending", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const body = await res.json();
    expect(body.requests).toEqual([]);
  });
});

describe("GET /api/friends/search — edge cases", () => {
  it("returns 400 when email query param is missing", async () => {
    const res = await app.request("/api/friends/search", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/friends — pagination", () => {
  it("respects limit param", async () => {
    // Get userA id from DB
    const userA = db.query("SELECT id FROM users WHERE email='alice@test.com'").get() as { id: number };
    // Create 4 extra friends for A
    for (let i = 0; i < 4; i++) {
      const hash = await Bun.password.hash("password123", { algorithm: "argon2id" });
      const u = db
        .query("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING id")
        .get(`extra${i}@test.com`, hash, `Extra${i}`) as { id: number };
      db.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')").run(userA.id, u.id);
    }
    const res = await app.request("/api/friends?limit=2", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.friends).toHaveLength(2);
  });

  it("returns different pages with offset", async () => {
    const userA = db.query("SELECT id FROM users WHERE email='alice@test.com'").get() as { id: number };
    for (let i = 0; i < 4; i++) {
      const hash = await Bun.password.hash("password123", { algorithm: "argon2id" });
      const u = db
        .query("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING id")
        .get(`pager${i}@test.com`, hash, `Pager${i}`) as { id: number };
      db.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')").run(userA.id, u.id);
    }
    const res1 = await app.request("/api/friends?limit=2&offset=0", { headers: { Authorization: `Bearer ${tokenA}` } });
    const res2 = await app.request("/api/friends?limit=2&offset=2", { headers: { Authorization: `Bearer ${tokenA}` } });
    const body1 = await res1.json();
    const body2 = await res2.json();
    const ids1 = new Set(body1.friends.map((f: { id: number }) => f.id));
    const ids2 = body2.friends.map((f: { id: number }) => f.id);
    expect(ids2.some((id: number) => ids1.has(id))).toBe(false);
  });
});
