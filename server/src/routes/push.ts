import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import webpush from "web-push";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_MAILTO = process.env.VAPID_MAILTO || "mailto:admin@example.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);
}

export function pushRoutes(db: Database) {
  const app = new Hono();

  app.get("/vapid-key", (c) => c.json({ publicKey: VAPID_PUBLIC }, 200));

  app.post("/subscribe", async (c) => {
    const userId = c.get("userId") as number;
    const { endpoint, p256dh, auth } = await c.req.json();

    db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = ?, auth = ?`,
    ).run(userId, endpoint, p256dh, auth, p256dh, auth);

    return c.json({ ok: true }, 200);
  });

  return app;
}

