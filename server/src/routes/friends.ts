import { Hono } from "hono";
import type { Database } from "bun:sqlite";

export function friendRoutes(db: Database) {
  const app = new Hono();

  // Search user by email
  app.get("/search", async (c) => {
    const email = c.req.query("email");
    if (!email) return c.json({ error: "Email required" }, 400);

    const user = db
      .query("SELECT id, email, display_name FROM users WHERE email = ?")
      .get(email) as { id: number; email: string; display_name: string } | null;

    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({ user: { id: user.id, email: user.email, displayName: user.display_name } }, 200);
  });

  // Send friend request
  app.post("/request", async (c) => {
    const userId = c.get("userId") as number;
    const { email } = await c.req.json();

    const target = db.query("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | null;
    if (!target) return c.json({ error: "User not found" }, 404);
    if (target.id === userId) return c.json({ error: "Cannot befriend yourself" }, 400);

    const existing = db
      .query(
        `SELECT id FROM friendships
         WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      )
      .get(userId, target.id, target.id, userId);

    if (existing) return c.json({ error: "Request already exists" }, 409);

    db.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')").run(
      userId,
      target.id,
    );

    return c.json({ ok: true }, 201);
  });

  // Accept friend request
  app.post("/accept", async (c) => {
    const userId = c.get("userId") as number;
    const { friendshipId } = await c.req.json();

    db.query("UPDATE friendships SET status = 'accepted' WHERE id = ? AND addressee_id = ? AND status = 'pending'")
      .run(friendshipId, userId);

    const { changes } = db.query("SELECT changes() as changes").get() as { changes: number };
    if (changes === 0) return c.json({ error: "Request not found" }, 404);
    return c.json({ ok: true }, 200);
  });

  // Reject / remove friend
  app.post("/reject", async (c) => {
    const userId = c.get("userId") as number;
    const { friendshipId } = await c.req.json();

    db.query(
      "DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)",
    ).run(friendshipId, userId, userId);

    return c.json({ ok: true }, 200);
  });

  // List accepted friends
  app.get("/", async (c) => {
    const userId = c.get("userId") as number;

    const friends = db
      .query(
        `SELECT u.id, u.email, u.display_name, u.last_seen, f.id as friendship_id
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
         WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'`,
      )
      .all(userId, userId, userId) as Array<{
      id: number;
      email: string;
      display_name: string;
      last_seen: number;
      friendship_id: number;
    }>;

    return c.json({
      friends: friends.map((f) => ({
        id: f.id,
        email: f.email,
        displayName: f.display_name,
        lastSeen: f.last_seen,
        friendshipId: f.friendship_id,
      })),
    }, 200);
  });

  // List pending incoming requests
  app.get("/pending", async (c) => {
    const userId = c.get("userId") as number;

    const requests = db
      .query(
        `SELECT f.id as friendship_id, u.id, u.email, u.display_name, f.created_at
         FROM friendships f
         JOIN users u ON u.id = f.requester_id
         WHERE f.addressee_id = ? AND f.status = 'pending'`,
      )
      .all(userId) as Array<{
      friendship_id: number;
      id: number;
      email: string;
      display_name: string;
      created_at: number;
    }>;

    return c.json({
      requests: requests.map((r) => ({
        friendshipId: r.friendship_id,
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        createdAt: r.created_at,
      })),
    }, 200);
  });

  return app;
}
