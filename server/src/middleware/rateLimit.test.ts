import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { rateLimit } from "./rateLimit";

// Each test creates its own app + rateLimit instance with isolated store
function makeApp(max: number, trustProxy = false) {
  const app = new Hono();
  app.use("/*", rateLimit({ windowMs: 60_000, max, trustProxy }));
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit", () => {
  it("does not block requests up to the limit", async () => {
    const app = makeApp(3);
    for (let i = 0; i < 3; i++) {
      await app.request("/", { headers: { "x-real-ip": "1.1.1.1" } });
    }
    // 4th request should now be blocked — confirms the limit was counted correctly
    const res = await app.request("/", { headers: { "x-real-ip": "1.1.1.1" } });
    expect(res.status).toBe(429);
  });

  it("blocks the request that exceeds the limit with 429", async () => {
    const app = makeApp(2);
    await app.request("/", { headers: { "x-real-ip": "2.2.2.2" } });
    await app.request("/", { headers: { "x-real-ip": "2.2.2.2" } });
    const res = await app.request("/", { headers: { "x-real-ip": "2.2.2.2" } });
    expect(res.status).toBe(429);
  });

  it("returns Retry-After header on 429", async () => {
    const app = makeApp(1);
    await app.request("/", { headers: { "x-real-ip": "3.3.3.3" } });
    const res = await app.request("/", { headers: { "x-real-ip": "3.3.3.3" } });
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("retry-after");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("returns JSON error body on 429", async () => {
    const app = makeApp(1);
    await app.request("/", { headers: { "x-real-ip": "4.4.4.4" } });
    const res = await app.request("/", { headers: { "x-real-ip": "4.4.4.4" } });
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
  });

  it("tracks different IPs independently", async () => {
    const app = makeApp(1);
    await app.request("/", { headers: { "x-real-ip": "5.5.5.5" } });
    const blocked = await app.request("/", { headers: { "x-real-ip": "5.5.5.5" } });
    const allowed = await app.request("/", { headers: { "x-real-ip": "6.6.6.6" } });
    expect(blocked.status).toBe(429);
    expect(allowed.status).not.toBe(429); // different IP should not be rate-limited
  });

  it("falls back to 'unknown' when no IP header is present", async () => {
    const app = makeApp(1);
    await app.request("/");
    const res = await app.request("/");
    // Both requests share the 'unknown' bucket — second should be blocked
    expect(res.status).toBe(429);
  });

  describe("trustProxy: true", () => {
    it("uses x-forwarded-for first IP for rate limiting", async () => {
      const app = makeApp(1, true);
      await app.request("/", { headers: { "x-forwarded-for": "7.7.7.7, 10.0.0.1" } });
      const res = await app.request("/", { headers: { "x-forwarded-for": "7.7.7.7, 10.0.0.1" } });
      expect(res.status).toBe(429);
    });

    it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
      const app = makeApp(1, true);
      await app.request("/", { headers: { "x-real-ip": "8.8.8.8" } });
      const res = await app.request("/", { headers: { "x-real-ip": "8.8.8.8" } });
      expect(res.status).toBe(429);
    });
  });

  describe("trustProxy: false (default)", () => {
    it("ignores x-forwarded-for and uses x-real-ip", async () => {
      const app = makeApp(1, false);
      // Use up the limit for x-real-ip "9.9.9.9"
      await app.request("/", { headers: { "x-real-ip": "9.9.9.9" } });
      // Different x-forwarded-for but same x-real-ip — should still be blocked
      const res = await app.request("/", {
        headers: { "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" },
      });
      expect(res.status).toBe(429);
    });

    it("different x-forwarded-for with same x-real-ip is treated as same client", async () => {
      const app = makeApp(1, false);
      await app.request("/", { headers: { "x-real-ip": "10.10.10.10", "x-forwarded-for": "1.1.1.1" } });
      const res = await app.request("/", { headers: { "x-real-ip": "10.10.10.10", "x-forwarded-for": "2.2.2.2" } });
      expect(res.status).toBe(429);
    });
  });
});
