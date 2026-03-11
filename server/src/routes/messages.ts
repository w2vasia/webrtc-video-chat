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

    const beforeIdNum = beforeId !== undefined ? Number(beforeId) : null;
    if (beforeId !== undefined && (!Number.isInteger(beforeIdNum) || beforeIdNum! <= 0)) {
      return c.json({ error: "Invalid before_id" }, 400);
    }

    // Chat messages
    let msgQuery = `
      SELECT id, sender_id, recipient_id, ciphertext, nonce, created_at, read_at
      FROM messages
      WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
    `;
    const msgParams: (number)[] = [userId, friendId, friendId, userId];
    if (beforeIdNum) { msgQuery += " AND id < ?"; msgParams.push(beforeIdNum); }
    msgQuery += " ORDER BY id DESC LIMIT ?";
    msgParams.push(limit);

    const rows = db.query(msgQuery).all(...msgParams) as Array<{
      id: number; sender_id: number; recipient_id: number; ciphertext: string; nonce: string; created_at: number; read_at: number | null;
    }>;

    // System events for this conversation
    let evtQuery = `
      SELECT id, user1_id, user2_id, event_type, metadata, created_at
      FROM system_events
      WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
        AND NOT (event_type = 'rate_limited' AND user1_id != ?)
    `;
    const evtParams: number[] = [userId, friendId, friendId, userId, userId];
    if (rows.length) {
      const oldestTs = rows[rows.length - 1].created_at;
      evtQuery += " AND created_at >= ?";
      evtParams.push(oldestTs);
    }
    evtQuery += " ORDER BY created_at";

    const events = db.query(evtQuery).all(...evtParams) as Array<{
      id: number; user1_id: number; user2_id: number; event_type: string; metadata: string | null; created_at: number;
    }>;

    return c.json({
      messages: rows.reverse().map((r) => ({
        id: r.id, from: r.sender_id, to: r.recipient_id, ciphertext: r.ciphertext, nonce: r.nonce, timestamp: r.created_at, readAt: r.read_at ?? null,
      })),
      systemEvents: events.map((r) => ({
        id: r.id, user1_id: r.user1_id, user2_id: r.user2_id, event_type: r.event_type, metadata: r.metadata, created_at: r.created_at,
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

    // Verify friendship
    const friendship = db.query(
      "SELECT 1 FROM friendships WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted'"
    ).get(userId, friendId, friendId, userId);
    if (!friendship) return c.json({ error: "Not friends" }, 403);

    db.query(
      "DELETE FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)"
    ).run(userId, friendId, friendId, userId);

    const { changes } = db.query("SELECT changes() as changes").get() as { changes: number };
    return c.json({ ok: true, deleted: changes }, 200);
  });

  return app;
}
