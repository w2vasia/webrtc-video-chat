import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { hashPassword, verifyPassword, createToken } from "../auth";

export function authRoutes(db: Database) {
  const app = new Hono();

  app.post("/register", async (c) => {
    const { email, password, displayName } = await c.req.json();

    if (!email || !password || !displayName) {
      return c.json({ error: "Missing required fields" }, 400);
    }
    if (typeof email !== "string" || typeof password !== "string" || typeof displayName !== "string") {
      return c.json({ error: "Invalid field types" }, 400);
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "Invalid email format" }, 400);
    }
    if (displayName.length > 100) {
      return c.json({ error: "Display name too long" }, 400);
    }
    if (password.length < 8 || password.length > 256) {
      return c.json({ error: "Password must be 8-256 characters" }, 400);
    }

    const existing = db.query("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return c.json({ error: "Unable to create account" }, 409);
    }

    const passwordHash = await hashPassword(password);
    const result = db
      .query("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING id, email, display_name")
      .get(email, passwordHash, displayName) as { id: number; email: string; display_name: string };

    const token = await createToken(result.id, result.email);

    return c.json(
      {
        token,
        user: { id: result.id, email: result.email, displayName: result.display_name },
      },
      201,
    );
  });

  app.post("/login", async (c) => {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Missing credentials" }, 400);
    }

    const user = db
      .query("SELECT id, email, password_hash, display_name FROM users WHERE email = ?")
      .get(email) as { id: number; email: string; password_hash: string; display_name: string } | null;

    if (!user) {
      // Run dummy verify to prevent user enumeration via timing
      await Bun.password.verify("dummy", "$argon2id$v=19$m=65536,t=2,p=1$ysNsBe9+5I8eyEPLbcGMBbzvjpbbe0uVqSSXXB4lawY$YOmeeLCwQerRNVH8OyFNseZgzgokxmoDc/KbFlIzuoE");
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    db.query("UPDATE users SET last_seen = unixepoch() WHERE id = ?").run(user.id);
    const token = await createToken(user.id, user.email);

    return c.json(
      {
        token,
        user: { id: user.id, email: user.email, displayName: user.display_name },
      },
      200,
    );
  });

  return app;
}
