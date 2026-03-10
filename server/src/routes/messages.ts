import { Hono } from "hono";
import type { Database } from "bun:sqlite";

export function messageRoutes(db: Database) {
  const app = new Hono();

  // Get chat history with a friend
  app.get("/:friendId", async (c) => {
    const userId = c.get("userId") as number;
    const friendId = Number(c.req.param("friendId"));
    if (!Number.isInteger(friendId) || friendId <= 0) {
      return c.json({ error: "Invalid friend ID" }, 400);
    }

    // Verify friendship
    const friendship = db.query(
      "SELECT 1 FROM friendships WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted'"
    ).get(userId, friendId, friendId, userId);
    if (!friendship) return c.json({ error: "Not friends" }, 403);

    const beforeId = c.req.query("before_id"); // cursor: message id
    const limit = Math.min(Number(c.req.query("limit")) || 50, 100);

    let query = `
      SELECT id, sender_id, recipient_id, ciphertext, nonce, created_at
      FROM messages
      WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
    `;
    const params: any[] = [userId, friendId, friendId, userId];

    if (beforeId) {
      query += " AND id < ?";
      params.push(Number(beforeId));
    }

    query += " ORDER BY id DESC LIMIT ?";
    params.push(limit);

    const rows = db.query(query).all(...params) as Array<{
      id: number;
      sender_id: number;
      recipient_id: number;
      ciphertext: string;
      nonce: string;
      created_at: number;
    }>;

    return c.json({
      messages: rows.reverse().map((r) => ({
        id: r.id,
        from: r.sender_id,
        to: r.recipient_id,
        ciphertext: r.ciphertext,
        nonce: r.nonce,
        timestamp: r.created_at,
      })),
    }, 200);
  });

  // Delete conversation with a friend (both sides' messages)
  app.delete("/:friendId", async (c) => {
    const userId = c.get("userId") as number;
    const friendId = Number(c.req.param("friendId"));
    if (!Number.isInteger(friendId) || friendId <= 0) {
      return c.json({ error: "Invalid friend ID" }, 400);
    }

    db.query(
      "DELETE FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)"
    ).run(userId, friendId, friendId, userId);

    const { changes } = db.query("SELECT changes() as changes").get() as { changes: number };
    return c.json({ deleted: changes }, 200);
  });

  return app;
}
