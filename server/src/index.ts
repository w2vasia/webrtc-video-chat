import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getDb, migrate } from "./db";
import { authRoutes } from "./routes/auth";
import { friendRoutes } from "./routes/friends";
import { keyRoutes } from "./routes/keys";
import { pushRoutes } from "./routes/push";
import { messageRoutes } from "./routes/messages";
import { authMiddleware } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import { createWsHandlers, type WsData } from "./ws";
import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

// Ensure data dir
mkdirSync("data", { recursive: true });

const db = getDb("data/app.db");
migrate(db);

const app = new Hono();
if (!process.env.CLIENT_ORIGIN && process.env.NODE_ENV === "production") {
  throw new Error("CLIENT_ORIGIN must be set in production");
}
const corsOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use("*", cors({
  origin: corsOrigin,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));
app.use("*", logger());

// Public routes (rate limited)
app.use("/api/auth/*", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.route("/api/auth", authRoutes(db));
app.get("/api/health", (c) => c.json({ ok: true }, 200));

// Protected routes
app.use("/api/*", authMiddleware());
app.route("/api/friends", friendRoutes(db));
app.route("/api/keys", keyRoutes(db));
app.route("/api/push", pushRoutes(db));
app.route("/api/messages", messageRoutes(db));

// In production, serve client build
const clientDist = join(import.meta.dir, "../../client/dist");
if (existsSync(clientDist)) {
  app.get("*", async (c) => {
    const filePath = resolve(clientDist, c.req.path.replace(/^\//, ""));
    if (!filePath.startsWith(clientDist)) return new Response("Not found", { status: 404 });
    const file = Bun.file(filePath);
    if (await file.exists()) return new Response(file);
    // SPA fallback
    return new Response(Bun.file(join(clientDist, "index.html")));
  });
}

const wsHandlers = createWsHandlers(db);

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") {
      const upgraded = server.upgrade<WsData>(req, { data: { authenticated: false } });
      if (upgraded) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return app.fetch(req, { env: {} });
  },
  websocket: wsHandlers,
});

console.log(`Server running on http://localhost:${server.port}`);
