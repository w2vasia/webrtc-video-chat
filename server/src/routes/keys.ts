import { Hono } from "hono";
import type { Database } from "bun:sqlite";

export function keyRoutes(db: Database) {
  const app = new Hono();

  // Upload own public keys
  app.post("/", async (c) => {
    const userId = c.get("userId") as number;
    const { identityKey, signedPreKey } = await c.req.json();

    if (!identityKey || !signedPreKey) {
      return c.json({ error: "Missing keys" }, 400);
    }

    db.query(
      `INSERT INTO public_keys (user_id, identity_key, signed_pre_key, updated_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(user_id) DO UPDATE SET identity_key = ?, signed_pre_key = ?, updated_at = unixepoch()`,
    ).run(userId, identityKey, signedPreKey, identityKey, signedPreKey);

    return c.json({ ok: true }, 200);
  });

  // Fetch another user's public keys (friends only)
  app.get("/:userId", (c) => {
    const requesterId = c.get("userId") as number;
    const targetId = Number(c.req.param("userId"));

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return c.json({ error: "Invalid user ID" }, 400);
    }

    // Allow fetching own keys or friend's keys
    if (targetId !== requesterId) {
      const friendship = db.query(
        "SELECT 1 FROM friendships WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted'"
      ).get(requesterId, targetId, targetId, requesterId);
      if (!friendship) return c.json({ error: "Not friends" }, 403);
    }

    const keys = db
      .query("SELECT identity_key, signed_pre_key, updated_at FROM public_keys WHERE user_id = ?")
      .get(targetId) as { identity_key: string; signed_pre_key: string; updated_at: number } | null;

    if (!keys) return c.json({ error: "Keys not found" }, 404);
    return c.json({ identityKey: keys.identity_key, signedPreKey: keys.signed_pre_key, updatedAt: keys.updated_at }, 200);
  });

  return app;
}
