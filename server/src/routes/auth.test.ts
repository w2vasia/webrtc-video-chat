import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { authRoutes } from "./auth";
import { getDb, migrate } from "../db";

function setup() {
  const db = getDb(":memory:");
  migrate(db);
  const app = new Hono();
  app.route("/api/auth", authRoutes(db));
  return { app, db };
}

describe("POST /api/auth/register", () => {
  it("registers a new user", async () => {
    const { app } = setup();
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass123",
        displayName: "Test User",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe("test@example.com");
  });

  it("rejects duplicate email", async () => {
    const { app } = setup();
    const body = JSON.stringify({
      email: "test@example.com",
      password: "securepass123",
      displayName: "Test",
    });
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(res.status).toBe(409);
  });

  it("rejects weak password", async () => {
    const { app } = setup();
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "short",
        displayName: "Test",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    const { app } = setup();
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass123",
        displayName: "Test",
      }),
    });
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass123",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
  });

  it("rejects wrong password", async () => {
    const { app } = setup();
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass123",
        displayName: "Test",
      }),
    });
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "wrongpassword",
      }),
    });
    expect(res.status).toBe(401);
  });
});
