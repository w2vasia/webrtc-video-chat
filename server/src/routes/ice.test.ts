import { describe, it, expect, afterEach } from "bun:test";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createToken } from "../auth";
import { getDb, migrate } from "../db";
import { iceHandler } from "./ice";

async function setup() {
  const db = getDb(":memory:");
  migrate(db);
  const hash = await Bun.password.hash("pass", { algorithm: "argon2id" });
  const user = db.query("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING id")
    .get("a@test.com", hash, "A") as { id: number };
  const token = await createToken(user.id, "a@test.com");
  const app = new Hono();
  app.use("/api/*", authMiddleware());
  app.get("/api/ice-servers", iceHandler);
  return { app, token };
}

describe("GET /api/ice-servers", () => {
  const origTurnUrl = process.env.TURN_URL;
  const origTurnUser = process.env.TURN_USERNAME;
  const origTurnCred = process.env.TURN_CREDENTIAL;

  afterEach(() => {
    process.env.TURN_URL = origTurnUrl;
    process.env.TURN_USERNAME = origTurnUser;
    process.env.TURN_CREDENTIAL = origTurnCred;
  });

  it("returns STUN only when TURN_URL is not set", async () => {
    delete process.env.TURN_URL;
    const { app, token } = await setup();
    const res = await app.request("/api/ice-servers", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { urls: string }[];
    expect(body).toHaveLength(1);
    expect(body[0].urls).toBe("stun:stun.l.google.com:19302");
  });

  it("includes TURN server when TURN_URL is set", async () => {
    process.env.TURN_URL = "turn:turn.example.com:3478";
    process.env.TURN_USERNAME = "user";
    process.env.TURN_CREDENTIAL = "pass";
    const { app, token } = await setup();
    const res = await app.request("/api/ice-servers", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { urls: string; username?: string; credential?: string }[];
    expect(body).toHaveLength(2);
    expect(body[1].urls).toBe("turn:turn.example.com:3478");
    expect(body[1].username).toBe("user");
    expect(body[1].credential).toBe("pass");
  });
});
