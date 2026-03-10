import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getDb, migrate } from "./db";
import { authRoutes } from "./routes/auth";
import { friendRoutes } from "./routes/friends";
import { keyRoutes } from "./routes/keys";
import { pushRoutes } from "./routes/push";
import { authMiddleware } from "./middleware/auth";
import { createWsHandlers, type WsData } from "./ws";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

// Ensure data dir
mkdirSync("data", { recursive: true });

const db = getDb("data/app.db");
migrate(db);

const app = new Hono();
app.use("*", cors());
app.use("*", logger());

// Public routes
app.route("/api/auth", authRoutes(db));

// Protected routes
app.use("/api/*", authMiddleware());
app.route("/api/friends", friendRoutes(db));
app.route("/api/keys", keyRoutes(db));
app.route("/api/push", pushRoutes(db));

// Health check
app.get("/api/health", (c) => c.json({ ok: true }, 200));

// In production, serve client build
const clientDist = join(import.meta.dir, "../../client/dist");
if (existsSync(clientDist)) {
  app.get("*", async (c) => {
    const filePath = join(clientDist, c.req.path);
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
