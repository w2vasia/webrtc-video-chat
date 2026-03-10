import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { authMiddleware } from "./auth";
import { createToken } from "../auth";

describe("authMiddleware", () => {
  const app = new Hono();
  app.use("/protected/*", authMiddleware());
  app.get("/protected/me", (c) => c.json({ userId: c.get("userId") }, 200));

  it("allows valid token", async () => {
    const token = await createToken(1, "test@example.com");
    const res = await app.request("/protected/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(1);
  });

  it("rejects missing token", async () => {
    const res = await app.request("/protected/me");
    expect(res.status).toBe(401);
  });

  it("rejects invalid token", async () => {
    const res = await app.request("/protected/me", {
      headers: { Authorization: "Bearer invalid.token.here" },
    });
    expect(res.status).toBe(401);
  });
});
