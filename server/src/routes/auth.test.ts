import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { authRoutes } from "./auth";
import { getDb, migrate } from "../db";

function setup() {
  const db = getDb(":memory:");
  migrate(db);
  const app = new Hono();
  app.use("*", secureHeaders());
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

  it("returns same error message for unknown email vs wrong password", async () => {
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
    const res1 = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@nowhere.com", password: "wrongpassword" }),
    });
    const res2 = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "wrongpassword" }),
    });
    expect(res1.status).toBe(401);
    expect(res2.status).toBe(401);
    const b1 = await res1.json();
    const b2 = await res2.json();
    expect(b1.error).toBe("Invalid credentials");
    expect(b2.error).toBe("Invalid credentials");
  });
});

describe("Security headers", () => {
  it("sets X-Content-Type-Options: nosniff on responses", async () => {
    const { app } = setup();
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "password123", displayName: "A" }),
    });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sets X-Frame-Options: SAMEORIGIN on responses", async () => {
    const { app } = setup();
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "password123", displayName: "A" }),
    });
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});
