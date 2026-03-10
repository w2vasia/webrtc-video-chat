# Encrypted Chat & Video Call PWA — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform existing WebRTC video chat into a full encrypted real-time chat + video call PWA with email auth, friends, and E2E encryption.

**Architecture:** Monorepo with SolidJS frontend (Vite) and Hono/Bun backend. SQLite for persistence. WebSocket for signaling + chat relay. WebRTC for P2P video/audio. X25519 + AES-256-GCM E2E encryption via Web Crypto API. PWA with service worker + web push notifications.

**Tech Stack:**
- **Runtime:** Bun
- **Backend:** Hono + bun:sqlite + Bun.password (argon2) + hono/jwt
- **Frontend:** SolidJS + Vite + vite-plugin-pwa
- **Encryption:** Web Crypto API (X25519 + AES-256-GCM)
- **Video:** WebRTC (browser-native) with Google STUN + optional coturn TURN
- **Push:** web-push (VAPID)

**Existing code:** Express+ws signaling server (`src/server.ts`), vanilla JS WebRTC client (`public/client.js`). We rewrite from scratch but preserve the WebRTC signaling patterns.

---

## Phase 1: Project Bootstrap & Backend Foundation

### Task 1: Initialize Bun + Monorepo Structure

**Files:**
- Delete: `src/server.ts`, `public/*`, `node_modules/`, `package-lock.json`, `dist/`
- Create: `package.json` (root)
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`

**Step 1: Remove old project files**

```bash
cd /Users/wasiliy/Documents/Projects/webrtc-video-chat
rm -rf node_modules dist package-lock.json
rm src/server.ts public/client.js public/index.html public/styles.css
rmdir src public
```

**Step 2: Create root package.json**

```json
{
  "name": "webrtc-video-chat",
  "private": true,
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "dev:server": "bun run --filter server dev",
    "dev:client": "bun run --filter client dev",
    "build": "bun run --filter client build && bun run --filter server build",
    "test": "bun run --filter '*' test"
  },
  "workspaces": ["server", "client"]
}
```

**Step 3: Create server package.json**

```json
{
  "name": "server",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "test": "bun test"
  },
  "dependencies": {
    "hono": "^4",
    "@hono/node-ws": "^1",
    "web-push": "^3"
  },
  "devDependencies": {
    "@types/web-push": "^3",
    "bun-types": "latest"
  }
}
```

**Step 4: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"],
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  },
  "include": ["src/**/*"]
}
```

**Step 5: Create client package.json**

```json
{
  "name": "client",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "solid-js": "^1",
    "@solidjs/router": "^0.14"
  },
  "devDependencies": {
    "vite": "^6",
    "vite-plugin-solid": "^2",
    "vite-plugin-pwa": "^0.21",
    "vitest": "^3",
    "typescript": "^5"
  }
}
```

**Step 6: Create client/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "types": ["vite/client"]
  },
  "include": ["src/**/*"]
}
```

**Step 7: Create client/vite.config.ts**

```ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Whisper — Encrypted Chat",
        short_name: "Whisper",
        description: "E2E encrypted chat & video calls",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\//,
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", expiration: { maxEntries: 50 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { "/api": "http://localhost:3000", "/ws": { target: "ws://localhost:3000", ws: true } },
  },
});
```

**Step 8: Install dependencies**

```bash
bun install
```

**Step 9: Commit**

```bash
git init
git add -A
git commit -m "init: bun monorepo w/ hono server + solidjs client"
```

---

### Task 2: SQLite Database Schema & Migration

**Files:**
- Create: `server/src/db.ts`
- Create: `server/src/migrate.ts`
- Create: `server/migrations/001_init.sql`
- Test: `server/src/db.test.ts`

**Step 1: Write the failing test**

Create `server/src/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { getDb, migrate } from "./db";

describe("database", () => {
  beforeEach(() => {
    const db = getDb(":memory:");
    migrate(db);
  });

  it("creates users table", () => {
    const db = getDb(":memory:");
    migrate(db);
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("friendships");
    expect(names).toContain("messages");
    expect(names).toContain("public_keys");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd server && bun test src/db.test.ts
```
Expected: FAIL — module not found

**Step 3: Create migration SQL**

Create `server/migrations/001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  last_seen INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  addressee_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'blocked')),
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  delivered INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, delivered);

CREATE TABLE IF NOT EXISTS public_keys (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  identity_key TEXT NOT NULL,
  signed_pre_key TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, endpoint)
);
```

**Step 4: Implement db.ts**

Create `server/src/db.ts`:

```ts
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

let _db: Database | null = null;

export function getDb(path: string = "data/app.db"): Database {
  if (_db && path !== ":memory:") return _db;
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") _db = db;
  return db;
}

export function migrate(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER DEFAULT (unixepoch())
  )`);

  const migrationsDir = join(import.meta.dir, "../migrations");
  let files: string[];
  try {
    files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return;
  }

  for (const file of files) {
    const applied = db.query("SELECT 1 FROM _migrations WHERE name = ?").get(file);
    if (applied) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    db.exec(sql);
    db.query("INSERT INTO _migrations (name) VALUES (?)").run(file);
  }
}
```

**Step 5: Run test to verify it passes**

```bash
cd server && bun test src/db.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add server/src/db.ts server/src/db.test.ts server/migrations/
git commit -m "feat: sqlite schema w/ users, friends, messages, keys"
```

---

### Task 3: Auth — Registration & Login

**Files:**
- Create: `server/src/auth.ts`
- Create: `server/src/routes/auth.ts`
- Test: `server/src/routes/auth.test.ts`

**Step 1: Write the failing test**

Create `server/src/routes/auth.test.ts`:

```ts
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
```

**Step 2: Run test to verify it fails**

```bash
cd server && bun test src/routes/auth.test.ts
```
Expected: FAIL — module not found

**Step 3: Implement auth utilities**

Create `server/src/auth.ts`:

```ts
import { sign, verify } from "hono/jwt";
import type { Database } from "bun:sqlite";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface JwtPayload {
  sub: number;
  email: string;
  iat: number;
  exp: number;
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export async function createToken(userId: number, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, email, iat: now, exp: now + 86400 * 7 }, JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  return (await verify(token, JWT_SECRET)) as JwtPayload;
}

export function getJwtSecret(): string {
  return JWT_SECRET;
}
```

**Step 4: Implement auth routes**

Create `server/src/routes/auth.ts`:

```ts
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
    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const existing = db.query("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return c.json({ error: "Email already registered" }, 409);
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
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    db.query("UPDATE users SET last_seen = unixepoch() WHERE id = ?").run(user.id);
    const token = await createToken(user.id, user.email);

    return c.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
  });

  return app;
}
```

**Step 5: Run tests**

```bash
cd server && bun test src/routes/auth.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add server/src/auth.ts server/src/routes/auth.ts server/src/routes/auth.test.ts
git commit -m "feat: email auth w/ argon2 + jwt"
```

---

### Task 4: Auth Middleware

**Files:**
- Create: `server/src/middleware/auth.ts`
- Test: `server/src/middleware/auth.test.ts`

**Step 1: Write the failing test**

Create `server/src/middleware/auth.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { authMiddleware } from "./auth";
import { createToken } from "../auth";

describe("authMiddleware", () => {
  const app = new Hono();
  app.use("/protected/*", authMiddleware());
  app.get("/protected/me", (c) => c.json({ userId: c.get("userId") }));

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
```

**Step 2: Run test — expected FAIL**

**Step 3: Implement middleware**

Create `server/src/middleware/auth.ts`:

```ts
import { createMiddleware } from "hono/factory";
import { verifyToken } from "../auth";

export function authMiddleware() {
  return createMiddleware(async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const payload = await verifyToken(header.slice(7));
      c.set("userId", payload.sub);
      c.set("userEmail", payload.email);
      await next();
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  });
}
```

**Step 4: Run test — expected PASS**

**Step 5: Commit**

```bash
git add server/src/middleware/
git commit -m "feat: jwt auth middleware"
```

---

### Task 5: Friends API — Search, Request, Accept, List

**Files:**
- Create: `server/src/routes/friends.ts`
- Test: `server/src/routes/friends.test.ts`

**Step 1: Write the failing test**

Create `server/src/routes/friends.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { friendRoutes } from "./friends";
import { authMiddleware } from "../middleware/auth";
import { createToken } from "../auth";
import { getDb, migrate } from "../db";

let db: ReturnType<typeof getDb>;
let app: Hono;
let tokenA: string;
let tokenB: string;

async function createUser(email: string, name: string) {
  const hash = await Bun.password.hash("password123", { algorithm: "argon2id" });
  return db
    .query("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING id")
    .get(email, hash, name) as { id: number };
}

beforeEach(async () => {
  db = getDb(":memory:");
  migrate(db);
  app = new Hono();
  app.use("/api/*", authMiddleware());
  app.route("/api/friends", friendRoutes(db));

  const userA = await createUser("alice@test.com", "Alice");
  const userB = await createUser("bob@test.com", "Bob");
  tokenA = await createToken(userA.id, "alice@test.com");
  tokenB = await createToken(userB.id, "bob@test.com");
});

describe("GET /api/friends/search", () => {
  it("finds user by email", async () => {
    const res = await app.request("/api/friends/search?email=bob@test.com", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("bob@test.com");
  });

  it("returns 404 for unknown email", async () => {
    const res = await app.request("/api/friends/search?email=nobody@test.com", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/friends/request", () => {
  it("sends friend request", async () => {
    const res = await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });
    expect(res.status).toBe(201);
  });

  it("prevents duplicate request", async () => {
    const body = JSON.stringify({ email: "bob@test.com" });
    const opts = {
      method: "POST" as const,
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body,
    };
    await app.request("/api/friends/request", opts);
    const res = await app.request("/api/friends/request", opts);
    expect(res.status).toBe(409);
  });
});

describe("POST /api/friends/accept", () => {
  it("accepts pending request", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });

    const res = await app.request("/api/friends/accept", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 1 }),
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/friends", () => {
  it("lists accepted friends", async () => {
    // Send + accept request
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });
    await app.request("/api/friends/accept", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: 1 }),
    });

    const res = await app.request("/api/friends", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.friends).toHaveLength(1);
    expect(body.friends[0].email).toBe("bob@test.com");
  });
});

describe("GET /api/friends/pending", () => {
  it("lists incoming requests", async () => {
    await app.request("/api/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@test.com" }),
    });

    const res = await app.request("/api/friends/pending", {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toHaveLength(1);
  });
});
```

**Step 2: Run test — expected FAIL**

**Step 3: Implement friends routes**

Create `server/src/routes/friends.ts`:

```ts
import { Hono } from "hono";
import type { Database } from "bun:sqlite";

export function friendRoutes(db: Database) {
  const app = new Hono();

  // Search user by email
  app.get("/search", (c) => {
    const email = c.req.query("email");
    if (!email) return c.json({ error: "Email required" }, 400);

    const user = db
      .query("SELECT id, email, display_name FROM users WHERE email = ?")
      .get(email) as { id: number; email: string; display_name: string } | null;

    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
  });

  // Send friend request
  app.post("/request", async (c) => {
    const userId = c.get("userId") as number;
    const { email } = await c.req.json();

    const target = db.query("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | null;
    if (!target) return c.json({ error: "User not found" }, 404);
    if (target.id === userId) return c.json({ error: "Cannot befriend yourself" }, 400);

    const existing = db
      .query(
        `SELECT id FROM friendships
         WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      )
      .get(userId, target.id, target.id, userId);

    if (existing) return c.json({ error: "Request already exists" }, 409);

    db.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')").run(
      userId,
      target.id,
    );

    return c.json({ ok: true }, 201);
  });

  // Accept friend request
  app.post("/accept", async (c) => {
    const userId = c.get("userId") as number;
    const { friendshipId } = await c.req.json();

    const result = db
      .query("UPDATE friendships SET status = 'accepted' WHERE id = ? AND addressee_id = ? AND status = 'pending'")
      .run(friendshipId, userId);

    if (result.changes === 0) return c.json({ error: "Request not found" }, 404);
    return c.json({ ok: true });
  });

  // Reject / remove friend
  app.post("/reject", async (c) => {
    const userId = c.get("userId") as number;
    const { friendshipId } = await c.req.json();

    db.query(
      "DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)",
    ).run(friendshipId, userId, userId);

    return c.json({ ok: true });
  });

  // List accepted friends
  app.get("/", (c) => {
    const userId = c.get("userId") as number;

    const friends = db
      .query(
        `SELECT u.id, u.email, u.display_name, u.last_seen, f.id as friendship_id
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
         WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'`,
      )
      .all(userId, userId, userId) as Array<{
      id: number;
      email: string;
      display_name: string;
      last_seen: number;
      friendship_id: number;
    }>;

    return c.json({
      friends: friends.map((f) => ({
        id: f.id,
        email: f.email,
        displayName: f.display_name,
        lastSeen: f.last_seen,
        friendshipId: f.friendship_id,
      })),
    });
  });

  // List pending incoming requests
  app.get("/pending", (c) => {
    const userId = c.get("userId") as number;

    const requests = db
      .query(
        `SELECT f.id as friendship_id, u.id, u.email, u.display_name, f.created_at
         FROM friendships f
         JOIN users u ON u.id = f.requester_id
         WHERE f.addressee_id = ? AND f.status = 'pending'`,
      )
      .all(userId) as Array<{
      friendship_id: number;
      id: number;
      email: string;
      display_name: string;
      created_at: number;
    }>;

    return c.json({
      requests: requests.map((r) => ({
        friendshipId: r.friendship_id,
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        createdAt: r.created_at,
      })),
    });
  });

  return app;
}
```

**Step 4: Run tests — expected PASS**

**Step 5: Commit**

```bash
git add server/src/routes/friends.ts server/src/routes/friends.test.ts
git commit -m "feat: friends api — search, request, accept, list"
```

---

### Task 6: Hono Server Entrypoint + WebSocket Signaling

**Files:**
- Create: `server/src/index.ts`
- Create: `server/src/ws.ts`

**Step 1: Implement WebSocket handler**

Create `server/src/ws.ts`:

```ts
import type { ServerWebSocket } from "bun";
import { verifyToken } from "./auth";
import type { Database } from "bun:sqlite";

interface WsUser {
  userId: number;
  email: string;
  ws: ServerWebSocket<WsData>;
}

export interface WsData {
  userId?: number;
  email?: string;
  authenticated: boolean;
}

const onlineUsers = new Map<number, WsUser>();

export function getOnlineUsers() {
  return onlineUsers;
}

export function createWsHandlers(db: Database) {
  return {
    async message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
      const data = JSON.parse(typeof message === "string" ? message : message.toString());

      // Auth handshake must be first message
      if (!ws.data.authenticated) {
        if (data.type === "auth") {
          try {
            const payload = await verifyToken(data.token);
            ws.data.userId = payload.sub;
            ws.data.email = payload.email;
            ws.data.authenticated = true;

            onlineUsers.set(payload.sub, { userId: payload.sub, email: payload.email, ws });
            db.query("UPDATE users SET last_seen = unixepoch() WHERE id = ?").run(payload.sub);

            ws.send(JSON.stringify({ type: "authenticated", userId: payload.sub }));

            // Deliver queued offline messages
            const queued = db
              .query("SELECT id, sender_id, ciphertext, nonce, created_at FROM messages WHERE recipient_id = ? AND delivered = 0 ORDER BY created_at")
              .all(payload.sub) as Array<{ id: number; sender_id: number; ciphertext: string; nonce: string; created_at: number }>;

            for (const msg of queued) {
              ws.send(JSON.stringify({ type: "chat", from: msg.sender_id, ciphertext: msg.ciphertext, nonce: msg.nonce, timestamp: msg.created_at }));
              db.query("UPDATE messages SET delivered = 1 WHERE id = ?").run(msg.id);
            }
          } catch {
            ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
            ws.close();
          }
        }
        return;
      }

      const userId = ws.data.userId!;

      switch (data.type) {
        case "chat": {
          // Relay E2E encrypted message
          const recipient = onlineUsers.get(data.to);
          const msg = { type: "chat", from: userId, ciphertext: data.ciphertext, nonce: data.nonce, timestamp: Math.floor(Date.now() / 1000) };

          if (recipient) {
            recipient.ws.send(JSON.stringify(msg));
          } else {
            // Store for offline delivery
            db.query("INSERT INTO messages (sender_id, recipient_id, ciphertext, nonce) VALUES (?, ?, ?, ?)").run(
              userId, data.to, data.ciphertext, data.nonce,
            );
          }
          break;
        }

        // WebRTC signaling
        case "call-offer":
        case "call-answer":
        case "ice-candidate":
        case "call-end": {
          const target = onlineUsers.get(data.targetId);
          if (target) {
            target.ws.send(JSON.stringify({ ...data, senderId: userId }));
          }
          break;
        }

        case "typing": {
          const target = onlineUsers.get(data.to);
          if (target) {
            target.ws.send(JSON.stringify({ type: "typing", from: userId }));
          }
          break;
        }
      }
    },

    open(ws: ServerWebSocket<WsData>) {
      ws.data = { authenticated: false };
    },

    close(ws: ServerWebSocket<WsData>) {
      if (ws.data.userId) {
        onlineUsers.delete(ws.data.userId);
      }
    },
  };
}
```

**Step 2: Implement server entrypoint**

Create `server/src/index.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getDb, migrate } from "./db";
import { authRoutes } from "./routes/auth";
import { friendRoutes } from "./routes/friends";
import { keyRoutes } from "./routes/keys";
import { authMiddleware } from "./middleware/auth";
import { createWsHandlers, type WsData } from "./ws";
import { mkdirSync } from "fs";

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

// Health check
app.get("/api/health", (c) => c.json({ ok: true }));

const wsHandlers = createWsHandlers(db);

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  fetch(req, server) {
    // WebSocket upgrade
    if (new URL(req.url).pathname === "/ws") {
      const upgraded = server.upgrade<WsData>(req, { data: { authenticated: false } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return app.fetch(req, { env: {} });
  },
  websocket: wsHandlers,
});

console.log(`Server running on http://localhost:${server.port}`);
```

**Step 3: Create public key routes (needed by server/src/index.ts import)**

Create `server/src/routes/keys.ts`:

```ts
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

    return c.json({ ok: true });
  });

  // Fetch another user's public keys
  app.get("/:userId", (c) => {
    const targetId = Number(c.req.param("userId"));
    const keys = db
      .query("SELECT identity_key, signed_pre_key, updated_at FROM public_keys WHERE user_id = ?")
      .get(targetId) as { identity_key: string; signed_pre_key: string; updated_at: number } | null;

    if (!keys) return c.json({ error: "Keys not found" }, 404);
    return c.json({ identityKey: keys.identity_key, signedPreKey: keys.signed_pre_key, updatedAt: keys.updated_at });
  });

  return app;
}
```

**Step 4: Verify server starts**

```bash
cd server && bun run src/index.ts
```
Expected: "Server running on http://localhost:3000"

**Step 5: Commit**

```bash
git add server/src/index.ts server/src/ws.ts server/src/routes/keys.ts
git commit -m "feat: hono server w/ ws signaling + key exchange + offline queue"
```

---

## Phase 2: SolidJS Client Foundation

### Task 7: SolidJS App Shell + Router

**Files:**
- Create: `client/index.html`
- Create: `client/src/index.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/pages/Login.tsx`
- Create: `client/src/pages/Register.tsx`
- Create: `client/src/pages/Chat.tsx`
- Create: `client/src/store/auth.ts`
- Create: `client/public/icon-192.png` (placeholder)
- Create: `client/public/icon-512.png` (placeholder)

**Step 1: Create HTML entry**

Create `client/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#1a1a2e" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <title>Whisper</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/index.tsx"></script>
</body>
</html>
```

**Step 2: Create app entry**

Create `client/src/index.tsx`:

```tsx
import { render } from "solid-js/web";
import { Router } from "@solidjs/router";
import App from "./App";
import "./styles/global.css";

render(
  () => (
    <Router>
      <App />
    </Router>
  ),
  document.getElementById("root")!,
);
```

**Step 3: Create auth store**

Create `client/src/store/auth.ts`:

```ts
import { createSignal } from "solid-js";

interface User {
  id: number;
  email: string;
  displayName: string;
}

const [token, setToken] = createSignal<string | null>(localStorage.getItem("token"));
const [user, setUser] = createSignal<User | null>(
  JSON.parse(localStorage.getItem("user") || "null"),
);

export function useAuth() {
  function login(t: string, u: User) {
    localStorage.setItem("token", t);
    localStorage.setItem("user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }

  return { token, user, login, logout, isLoggedIn: () => !!token() };
}
```

**Step 4: Create App with routes**

Create `client/src/App.tsx`:

```tsx
import { Route } from "@solidjs/router";
import { Show } from "solid-js";
import { useAuth } from "./store/auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";

export default function App() {
  const { isLoggedIn } = useAuth();

  return (
    <>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/" component={() => (
        <Show when={isLoggedIn()} fallback={<Login />}>
          <Chat />
        </Show>
      )} />
    </>
  );
}
```

**Step 5: Create Login page**

Create `client/src/pages/Login.tsx`:

```tsx
import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";

export default function Login() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: { email: email(), password: password() },
      });
      login(res.token, res.user);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="auth-page">
      <form class="auth-form" onSubmit={handleSubmit}>
        <h1>Whisper</h1>
        <h2>Sign In</h2>
        {error() && <p class="error">{error()}</p>}
        <input type="email" placeholder="Email" value={email()} onInput={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password()} onInput={(e) => setPassword(e.target.value)} required />
        <button type="submit" disabled={loading()}>
          {loading() ? "Signing in..." : "Sign In"}
        </button>
        <p class="link">
          No account? <a href="/register">Register</a>
        </p>
      </form>
    </div>
  );
}
```

**Step 6: Create Register page**

Create `client/src/pages/Register.tsx`:

```tsx
import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";

export default function Register() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api("/api/auth/register", {
        method: "POST",
        body: { email: email(), password: password(), displayName: displayName() },
      });
      login(res.token, res.user);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="auth-page">
      <form class="auth-form" onSubmit={handleSubmit}>
        <h1>Whisper</h1>
        <h2>Create Account</h2>
        {error() && <p class="error">{error()}</p>}
        <input type="text" placeholder="Display Name" value={displayName()} onInput={(e) => setDisplayName(e.target.value)} required />
        <input type="email" placeholder="Email" value={email()} onInput={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password (min 8 chars)" value={password()} onInput={(e) => setPassword(e.target.value)} minLength={8} required />
        <button type="submit" disabled={loading()}>
          {loading() ? "Creating..." : "Create Account"}
        </button>
        <p class="link">
          Have an account? <a href="/login">Sign In</a>
        </p>
      </form>
    </div>
  );
}
```

**Step 7: Create API helper**

Create `client/src/lib/api.ts`:

```ts
export async function api(path: string, opts: { method?: string; body?: any } = {}) {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
```

**Step 8: Create Chat page placeholder**

Create `client/src/pages/Chat.tsx`:

```tsx
import { useAuth } from "../store/auth";

export default function Chat() {
  const { user, logout } = useAuth();

  return (
    <div class="chat-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>Whisper</h2>
          <span class="user-name">{user()?.displayName}</span>
          <button onClick={logout}>Logout</button>
        </div>
        <div class="friend-list">
          <p class="placeholder">Friends list coming soon</p>
        </div>
      </aside>
      <main class="chat-main">
        <p class="placeholder">Select a friend to start chatting</p>
      </main>
    </div>
  );
}
```

**Step 9: Create global styles**

Create `client/src/styles/global.css`:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg: #0f0f1a;
  --surface: #1a1a2e;
  --surface-2: #242442;
  --primary: #6c63ff;
  --primary-hover: #5a52d5;
  --text: #e0e0e0;
  --text-muted: #888;
  --danger: #ff4757;
  --success: #2ed573;
  --border: #2a2a4a;
  --radius: 8px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100dvh;
}

/* Auth pages */
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 20px;
}

.auth-form {
  background: var(--surface);
  padding: 40px;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-form h1 { color: var(--primary); font-size: 2rem; text-align: center; }
.auth-form h2 { color: var(--text-muted); font-size: 1.1rem; text-align: center; font-weight: 400; }

.auth-form input {
  padding: 12px 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}
.auth-form input:focus { border-color: var(--primary); }

.auth-form button {
  padding: 12px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.auth-form button:hover { background: var(--primary-hover); }
.auth-form button:disabled { opacity: 0.6; cursor: not-allowed; }

.error { color: var(--danger); font-size: 0.9rem; text-align: center; }
.link { text-align: center; color: var(--text-muted); font-size: 0.9rem; }
.link a { color: var(--primary); text-decoration: none; }

/* Chat layout */
.chat-layout {
  display: flex;
  height: 100dvh;
}

.sidebar {
  width: 300px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-header h2 { color: var(--primary); }
.sidebar-header button {
  padding: 6px 12px;
  background: var(--surface-2);
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.85rem;
}

.friend-list { flex: 1; overflow-y: auto; }

.chat-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder { color: var(--text-muted); }

/* Responsive */
@media (max-width: 768px) {
  .sidebar { width: 100%; position: absolute; z-index: 10; }
  .chat-layout { position: relative; }
}
```

**Step 10: Generate placeholder icons**

```bash
# Create minimal SVG icons as PNG placeholders (will be replaced with real icons)
cd client/public
echo '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" rx="32" fill="#6c63ff"/><text x="96" y="120" text-anchor="middle" fill="white" font-size="100" font-family="sans-serif">W</text></svg>' > icon-192.svg
echo '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="64" fill="#6c63ff"/><text x="256" y="320" text-anchor="middle" fill="white" font-size="260" font-family="sans-serif">W</text></svg>' > icon-512.svg
```

**Step 11: Install and verify dev server starts**

```bash
cd client && bun install && bun run dev
```
Expected: Vite dev server on port 5173

**Step 12: Commit**

```bash
git add client/
git commit -m "feat: solidjs app shell w/ auth pages + chat layout + pwa manifest"
```

---

## Phase 3: E2E Encryption

### Task 8: Crypto Module — Key Generation, Exchange, Encrypt/Decrypt

**Files:**
- Create: `client/src/lib/crypto.ts`
- Test: `client/src/lib/crypto.test.ts`

**Step 1: Write the failing test**

Create `client/src/lib/crypto.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateKeyPair, deriveSharedKey, encrypt, decrypt, exportPublicKey, importPublicKey } from "./crypto";

describe("crypto", () => {
  it("generates a key pair", async () => {
    const kp = await generateKeyPair();
    expect(kp.publicKey).toBeDefined();
    expect(kp.privateKey).toBeDefined();
  });

  it("exports and imports public key", async () => {
    const kp = await generateKeyPair();
    const exported = await exportPublicKey(kp.publicKey);
    expect(typeof exported).toBe("string");
    const imported = await importPublicKey(exported);
    expect(imported).toBeDefined();
  });

  it("derives shared key and encrypts/decrypts", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();

    const aliceShared = await deriveSharedKey(alice.privateKey, bob.publicKey);
    const bobShared = await deriveSharedKey(bob.privateKey, alice.publicKey);

    const plaintext = "hello encrypted world";
    const { ciphertext, nonce } = await encrypt(aliceShared, plaintext);

    expect(ciphertext).not.toBe(plaintext);

    const decrypted = await decrypt(bobShared, ciphertext, nonce);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with wrong key", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const eve = await generateKeyPair();

    const aliceShared = await deriveSharedKey(alice.privateKey, bob.publicKey);
    const eveShared = await deriveSharedKey(eve.privateKey, bob.publicKey);

    const { ciphertext, nonce } = await encrypt(aliceShared, "secret");

    await expect(decrypt(eveShared, ciphertext, nonce)).rejects.toThrow();
  });
});
```

**Step 2: Run test — expected FAIL**

```bash
cd client && bun run vitest run src/lib/crypto.test.ts
```

**Step 3: Implement crypto module**

Create `client/src/lib/crypto.ts`:

```ts
// E2E encryption using X25519 key exchange + AES-256-GCM
// All via Web Crypto API — zero dependencies

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveKey"]) as Promise<CryptoKeyPair>;
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: "X25519" }, true, []);
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

export async function importPrivateKey(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr);
  return crypto.subtle.importKey("jwk", jwk, { name: "X25519" }, true, ["deriveKey"]);
}

export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "X25519", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(sharedKey: CryptoKey, plaintext: string): Promise<{ ciphertext: string; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, encoded);

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...iv)),
  };
}

export async function decrypt(sharedKey: CryptoKey, ciphertext: string, nonce: string): Promise<string> {
  const iv = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, data);
  return new TextDecoder().decode(decrypted);
}
```

**Step 4: Run test — expected PASS**

```bash
cd client && bun run vitest run src/lib/crypto.test.ts
```

**Step 5: Commit**

```bash
git add client/src/lib/crypto.ts client/src/lib/crypto.test.ts
git commit -m "feat: e2e crypto — x25519 key exchange + aes-256-gcm"
```

---

### Task 9: Crypto Key Persistence (IndexedDB)

**Files:**
- Create: `client/src/lib/keystore.ts`

**Step 1: Implement keystore**

Create `client/src/lib/keystore.ts`:

```ts
// Persist crypto keys in IndexedDB
// Keys never leave the device unencrypted

const DB_NAME = "whisper-keys";
const STORE = "keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeKey(name: string, value: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getKey(name: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(name);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteKey(name: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

**Step 2: Commit**

```bash
git add client/src/lib/keystore.ts
git commit -m "feat: indexeddb keystore for e2e crypto keys"
```

---

## Phase 4: Real-Time Chat & Friends UI

### Task 10: WebSocket Client Service

**Files:**
- Create: `client/src/lib/ws.ts`
- Create: `client/src/store/chat.ts`

**Step 1: Implement WebSocket service**

Create `client/src/lib/ws.ts`:

```ts
type MessageHandler = (data: any) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;

  connect(token: string) {
    this.token = token;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);

    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({ type: "auth", token }));
    };

    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      const handlers = this.handlers.get(data.type);
      if (handlers) handlers.forEach((h) => h(data));
    };

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => {
        if (this.token) this.connect(this.token);
      }, 3000);
    };
  }

  disconnect() {
    this.token = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }
}

export const wsClient = new WsClient();
```

**Step 2: Implement chat store**

Create `client/src/store/chat.ts`:

```ts
import { createSignal, createEffect } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { wsClient } from "../lib/ws";
import { deriveSharedKey, encrypt, decrypt, importPublicKey, generateKeyPair, exportPublicKey, exportPrivateKey, importPrivateKey } from "../lib/crypto";
import { storeKey, getKey } from "../lib/keystore";
import { api } from "../lib/api";

export interface ChatMessage {
  id: string;
  from: number;
  to: number;
  text: string;
  timestamp: number;
  pending?: boolean;
}

interface ChatState {
  conversations: Record<number, ChatMessage[]>;
  activeFriend: number | null;
  sharedKeys: Record<number, CryptoKey>;
  onlineUsers: Set<number>;
}

const [state, setState] = createStore<ChatState>({
  conversations: {},
  activeFriend: null,
  sharedKeys: {},
  onlineUsers: new Set(),
});

let myKeyPair: CryptoKeyPair | null = null;

export function useChat() {
  async function initKeys() {
    const storedPrivate = await getKey("privateKey");
    const storedPublic = await getKey("publicKey");

    if (storedPrivate && storedPublic) {
      myKeyPair = {
        privateKey: await importPrivateKey(storedPrivate),
        publicKey: await importPublicKey(storedPublic),
      };
    } else {
      myKeyPair = await generateKeyPair();
      await storeKey("privateKey", await exportPrivateKey(myKeyPair.privateKey));
      const pub = await exportPublicKey(myKeyPair.publicKey);
      await storeKey("publicKey", pub);
    }

    // Upload public key to server
    const pub = await exportPublicKey(myKeyPair!.publicKey);
    await api("/api/keys", { method: "POST", body: { identityKey: pub, signedPreKey: pub } });
  }

  async function getSharedKey(friendId: number): Promise<CryptoKey> {
    if (state.sharedKeys[friendId]) return state.sharedKeys[friendId];

    const { identityKey } = await api(`/api/keys/${friendId}`);
    const friendPub = await importPublicKey(identityKey);
    const shared = await deriveSharedKey(myKeyPair!.privateKey, friendPub);

    setState("sharedKeys", friendId, shared);
    return shared;
  }

  async function sendMessage(friendId: number, text: string) {
    const sharedKey = await getSharedKey(friendId);
    const { ciphertext, nonce } = await encrypt(sharedKey, text);

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      from: 0, // self
      to: friendId,
      text,
      timestamp: Math.floor(Date.now() / 1000),
      pending: true,
    };

    setState("conversations", friendId, (prev = []) => [...prev, msg]);
    wsClient.send({ type: "chat", to: friendId, ciphertext, nonce });

    // Mark as sent
    setState("conversations", friendId, (msgs) =>
      msgs.map((m) => (m.id === msg.id ? { ...m, pending: false } : m)),
    );
  }

  function setupListeners() {
    wsClient.on("chat", async (data) => {
      try {
        const sharedKey = await getSharedKey(data.from);
        const text = await decrypt(sharedKey, data.ciphertext, data.nonce);

        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          from: data.from,
          to: 0,
          text,
          timestamp: data.timestamp,
        };

        setState("conversations", data.from, (prev = []) => [...prev, msg]);
      } catch (err) {
        console.error("Failed to decrypt message", err);
      }
    });
  }

  return {
    state,
    setState,
    initKeys,
    sendMessage,
    setupListeners,
    setActiveFriend: (id: number | null) => setState("activeFriend", id),
  };
}
```

**Step 3: Commit**

```bash
git add client/src/lib/ws.ts client/src/store/chat.ts
git commit -m "feat: ws client + encrypted chat store w/ offline key derivation"
```

---

### Task 11: Friends UI — Search, Add, List, Pending

**Files:**
- Create: `client/src/components/FriendList.tsx`
- Create: `client/src/components/AddFriend.tsx`
- Create: `client/src/components/PendingRequests.tsx`
- Modify: `client/src/pages/Chat.tsx`

**Step 1: Create FriendList component**

Create `client/src/components/FriendList.tsx`:

```tsx
import { createSignal, createResource, For, Show } from "solid-js";
import { api } from "../lib/api";

interface Friend {
  id: number;
  email: string;
  displayName: string;
  lastSeen: number;
  friendshipId: number;
}

export default function FriendList(props: { onSelect: (id: number) => void; activeId: number | null }) {
  const [friends, { refetch }] = createResource(async () => {
    const res = await api("/api/friends");
    return res.friends as Friend[];
  });

  // Refetch every 30s
  setInterval(refetch, 30000);

  return (
    <div class="friend-list">
      <Show when={friends()?.length === 0}>
        <p class="placeholder">No friends yet. Add someone!</p>
      </Show>
      <For each={friends()}>
        {(friend) => (
          <button
            class={`friend-item ${props.activeId === friend.id ? "active" : ""}`}
            onClick={() => props.onSelect(friend.id)}
          >
            <div class="friend-avatar">{friend.displayName[0].toUpperCase()}</div>
            <div class="friend-info">
              <span class="friend-name">{friend.displayName}</span>
              <span class="friend-email">{friend.email}</span>
            </div>
          </button>
        )}
      </For>
    </div>
  );
}
```

**Step 2: Create AddFriend component**

Create `client/src/components/AddFriend.tsx`:

```tsx
import { createSignal } from "solid-js";
import { api } from "../lib/api";

export default function AddFriend(props: { onAdded?: () => void }) {
  const [email, setEmail] = createSignal("");
  const [status, setStatus] = createSignal<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = createSignal(false);

  async function handleSearch(e: Event) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      await api("/api/friends/request", {
        method: "POST",
        body: { email: email() },
      });
      setStatus({ ok: true, msg: "Friend request sent!" });
      setEmail("");
      props.onAdded?.();
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form class="add-friend" onSubmit={handleSearch}>
      <input
        type="email"
        placeholder="Add friend by email..."
        value={email()}
        onInput={(e) => setEmail(e.target.value)}
        required
      />
      <button type="submit" disabled={loading()}>Add</button>
      {status() && (
        <p class={status()!.ok ? "success-msg" : "error-msg"}>{status()!.msg}</p>
      )}
    </form>
  );
}
```

**Step 3: Create PendingRequests component**

Create `client/src/components/PendingRequests.tsx`:

```tsx
import { createResource, For, Show } from "solid-js";
import { api } from "../lib/api";

interface PendingRequest {
  friendshipId: number;
  id: number;
  email: string;
  displayName: string;
}

export default function PendingRequests() {
  const [requests, { refetch }] = createResource(async () => {
    const res = await api("/api/friends/pending");
    return res.requests as PendingRequest[];
  });

  setInterval(refetch, 15000);

  async function accept(friendshipId: number) {
    await api("/api/friends/accept", { method: "POST", body: { friendshipId } });
    refetch();
  }

  async function reject(friendshipId: number) {
    await api("/api/friends/reject", { method: "POST", body: { friendshipId } });
    refetch();
  }

  return (
    <Show when={requests()?.length}>
      <div class="pending-requests">
        <h3>Friend Requests</h3>
        <For each={requests()}>
          {(req) => (
            <div class="pending-item">
              <span>{req.displayName} ({req.email})</span>
              <div class="pending-actions">
                <button class="btn-accept" onClick={() => accept(req.friendshipId)}>Accept</button>
                <button class="btn-reject" onClick={() => reject(req.friendshipId)}>Reject</button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
```

**Step 4: Update Chat page to integrate all components**

Rewrite `client/src/pages/Chat.tsx`:

```tsx
import { onMount, Show, createSignal } from "solid-js";
import { useAuth } from "../store/auth";
import { useChat } from "../store/chat";
import { wsClient } from "../lib/ws";
import FriendList from "../components/FriendList";
import AddFriend from "../components/AddFriend";
import PendingRequests from "../components/PendingRequests";
import ChatWindow from "../components/ChatWindow";

export default function Chat() {
  const { user, token, logout } = useAuth();
  const { state, setActiveFriend, initKeys, setupListeners } = useChat();
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  onMount(async () => {
    wsClient.connect(token()!);
    await initKeys();
    setupListeners();
  });

  return (
    <div class="chat-layout">
      <aside class={`sidebar ${sidebarOpen() ? "open" : ""}`}>
        <div class="sidebar-header">
          <h2>Whisper</h2>
          <span class="user-name">{user()?.displayName}</span>
          <button onClick={logout} class="btn-logout">Logout</button>
        </div>
        <AddFriend />
        <PendingRequests />
        <FriendList
          onSelect={(id) => { setActiveFriend(id); setSidebarOpen(false); }}
          activeId={state.activeFriend}
        />
      </aside>
      <main class="chat-main">
        <Show when={state.activeFriend} fallback={<p class="placeholder">Select a friend to chat</p>}>
          <ChatWindow
            friendId={state.activeFriend!}
            onBack={() => { setActiveFriend(null); setSidebarOpen(true); }}
          />
        </Show>
      </main>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add client/src/components/ client/src/pages/Chat.tsx
git commit -m "feat: friends ui — search, add, accept, list + chat integration"
```

---

### Task 12: Chat Window — Messages + Input

**Files:**
- Create: `client/src/components/ChatWindow.tsx`

**Step 1: Implement chat window**

Create `client/src/components/ChatWindow.tsx`:

```tsx
import { createSignal, For, onMount, createEffect } from "solid-js";
import { useChat } from "../store/chat";
import { useAuth } from "../store/auth";

export default function ChatWindow(props: { friendId: number; onBack: () => void }) {
  const { state, sendMessage } = useChat();
  const { user } = useAuth();
  const [input, setInput] = createSignal("");
  let messagesEnd: HTMLDivElement | undefined;

  const messages = () => state.conversations[props.friendId] || [];

  createEffect(() => {
    messages(); // track
    messagesEnd?.scrollIntoView({ behavior: "smooth" });
  });

  async function handleSend(e: Event) {
    e.preventDefault();
    const text = input().trim();
    if (!text) return;
    setInput("");
    await sendMessage(props.friendId, text);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  return (
    <div class="chat-window">
      <div class="chat-header">
        <button class="btn-back" onClick={props.onBack}>&#8592;</button>
        <span>Chat</span>
      </div>

      <div class="messages">
        <For each={messages()}>
          {(msg) => (
            <div class={`message ${msg.from === 0 ? "sent" : "received"}`}>
              <div class="message-bubble">
                <p>{msg.text}</p>
                <span class="message-time">
                  {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          )}
        </For>
        <div ref={messagesEnd} />
      </div>

      <form class="chat-input" onSubmit={handleSend}>
        <textarea
          placeholder="Type a message..."
          value={input()}
          onInput={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

**Step 2: Add chat window styles to global.css**

Append to `client/src/styles/global.css`:

```css
/* Friend list */
.friend-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}
.friend-item:hover, .friend-item.active { background: var(--surface-2); }
.friend-avatar {
  width: 40px; height: 40px;
  background: var(--primary);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 1.1rem; color: white;
}
.friend-info { display: flex; flex-direction: column; }
.friend-name { font-weight: 600; font-size: 0.95rem; }
.friend-email { font-size: 0.8rem; color: var(--text-muted); }

/* Add friend */
.add-friend {
  display: flex; gap: 8px; padding: 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.add-friend input {
  flex: 1; padding: 8px 12px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text);
  font-size: 0.85rem; outline: none; min-width: 0;
}
.add-friend button {
  padding: 8px 16px; background: var(--primary); color: white;
  border: none; border-radius: var(--radius); cursor: pointer;
  font-weight: 600; font-size: 0.85rem;
}
.success-msg { color: var(--success); font-size: 0.8rem; width: 100%; }
.error-msg { color: var(--danger); font-size: 0.8rem; width: 100%; }

/* Pending requests */
.pending-requests {
  padding: 12px; border-bottom: 1px solid var(--border);
}
.pending-requests h3 { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px; }
.pending-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0; font-size: 0.9rem;
}
.pending-actions { display: flex; gap: 6px; }
.btn-accept {
  padding: 4px 10px; background: var(--success); color: white;
  border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;
}
.btn-reject {
  padding: 4px 10px; background: var(--danger); color: white;
  border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;
}

/* Chat window */
.chat-window {
  display: flex; flex-direction: column;
  height: 100dvh; width: 100%;
}
.chat-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px; border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.btn-back {
  display: none; background: none; border: none;
  color: var(--text); font-size: 1.5rem; cursor: pointer;
}
@media (max-width: 768px) { .btn-back { display: block; } }

.messages {
  flex: 1; overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 8px;
}
.message { display: flex; }
.message.sent { justify-content: flex-end; }
.message.received { justify-content: flex-start; }
.message-bubble {
  max-width: 70%; padding: 10px 14px;
  border-radius: 16px; word-break: break-word;
}
.sent .message-bubble { background: var(--primary); color: white; border-bottom-right-radius: 4px; }
.received .message-bubble { background: var(--surface-2); border-bottom-left-radius: 4px; }
.message-time { display: block; font-size: 0.7rem; opacity: 0.7; margin-top: 4px; text-align: right; }

.chat-input {
  display: flex; gap: 8px; padding: 12px 16px;
  border-top: 1px solid var(--border); background: var(--surface);
}
.chat-input textarea {
  flex: 1; padding: 10px 14px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text);
  font-size: 0.95rem; resize: none; outline: none;
  font-family: inherit; line-height: 1.4;
}
.chat-input button {
  padding: 10px 20px; background: var(--primary); color: white;
  border: none; border-radius: var(--radius); cursor: pointer;
  font-weight: 600;
}
```

**Step 3: Commit**

```bash
git add client/src/components/ChatWindow.tsx client/src/styles/global.css
git commit -m "feat: encrypted chat window w/ message display + auto-scroll"
```

---

## Phase 5: WebRTC Video Calls

### Task 13: WebRTC Call Service

**Files:**
- Create: `client/src/lib/webrtc.ts`
- Create: `client/src/store/call.ts`

**Step 1: Implement WebRTC service**

Create `client/src/lib/webrtc.ts`:

```ts
import { wsClient } from "./ws";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export class WebRTCCall {
  pc: RTCPeerConnection;
  localStream: MediaStream | null = null;
  remoteStream = new MediaStream();
  targetId: number;
  onRemoteStream?: (stream: MediaStream) => void;
  onEnded?: () => void;

  constructor(targetId: number) {
    this.targetId = targetId;
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((t) => this.remoteStream.addTrack(t));
      this.onRemoteStream?.(this.remoteStream);
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsClient.send({ type: "ice-candidate", targetId, candidate: e.candidate });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected") {
        this.end();
      }
    };
  }

  async startLocalMedia(video = true, audio = true): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream!));
    return this.localStream;
  }

  async createOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    wsClient.send({ type: "call-offer", targetId: this.targetId, offer });
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    wsClient.send({ type: "call-answer", targetId: this.targetId, answer });
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  toggleVideo(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; return track.enabled; }
    return false;
  }

  toggleAudio(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; return track.enabled; }
    return false;
  }

  end() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc.close();
    wsClient.send({ type: "call-end", targetId: this.targetId });
    this.onEnded?.();
  }
}
```

**Step 2: Implement call store**

Create `client/src/store/call.ts`:

```ts
import { createSignal } from "solid-js";
import { WebRTCCall } from "../lib/webrtc";
import { wsClient } from "../lib/ws";

export type CallStatus = "idle" | "calling" | "incoming" | "connected";

const [callStatus, setCallStatus] = createSignal<CallStatus>("idle");
const [activeCall, setActiveCall] = createSignal<WebRTCCall | null>(null);
const [localStream, setLocalStream] = createSignal<MediaStream | null>(null);
const [remoteStream, setRemoteStream] = createSignal<MediaStream | null>(null);
const [callTargetId, setCallTargetId] = createSignal<number | null>(null);

export function useCall() {
  function setupCallListeners() {
    wsClient.on("call-offer", async (data) => {
      setCallTargetId(data.senderId);
      setCallStatus("incoming");

      // Store offer for when user accepts
      (window as any).__pendingOffer = data.offer;
      (window as any).__pendingSenderId = data.senderId;
    });

    wsClient.on("call-answer", async (data) => {
      const call = activeCall();
      if (call) {
        await call.handleAnswer(data.answer);
        setCallStatus("connected");
      }
    });

    wsClient.on("ice-candidate", async (data) => {
      const call = activeCall();
      if (call) await call.handleIceCandidate(data.candidate);
    });

    wsClient.on("call-end", () => {
      endCall();
    });
  }

  async function startCall(targetId: number) {
    const call = new WebRTCCall(targetId);
    call.onRemoteStream = (s) => setRemoteStream(s);
    call.onEnded = () => endCall();

    const stream = await call.startLocalMedia();
    setLocalStream(stream);
    setActiveCall(call);
    setCallTargetId(targetId);
    setCallStatus("calling");

    await call.createOffer();
  }

  async function acceptCall() {
    const senderId = (window as any).__pendingSenderId;
    const offer = (window as any).__pendingOffer;
    if (!senderId || !offer) return;

    const call = new WebRTCCall(senderId);
    call.onRemoteStream = (s) => setRemoteStream(s);
    call.onEnded = () => endCall();

    const stream = await call.startLocalMedia();
    setLocalStream(stream);
    setActiveCall(call);

    await call.handleOffer(offer);
    setCallStatus("connected");

    delete (window as any).__pendingOffer;
    delete (window as any).__pendingSenderId;
  }

  function rejectCall() {
    const senderId = (window as any).__pendingSenderId;
    if (senderId) wsClient.send({ type: "call-end", targetId: senderId });
    setCallStatus("idle");
    setCallTargetId(null);
    delete (window as any).__pendingOffer;
    delete (window as any).__pendingSenderId;
  }

  function endCall() {
    activeCall()?.end();
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus("idle");
    setCallTargetId(null);
  }

  return {
    callStatus,
    activeCall,
    localStream,
    remoteStream,
    callTargetId,
    setupCallListeners,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}
```

**Step 3: Commit**

```bash
git add client/src/lib/webrtc.ts client/src/store/call.ts
git commit -m "feat: webrtc call service + call state management"
```

---

### Task 14: Video Call UI

**Files:**
- Create: `client/src/components/VideoCall.tsx`
- Create: `client/src/components/IncomingCall.tsx`
- Modify: `client/src/components/ChatWindow.tsx` (add call button)
- Modify: `client/src/pages/Chat.tsx` (add call overlay)

**Step 1: Create VideoCall component**

Create `client/src/components/VideoCall.tsx`:

```tsx
import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useCall } from "../store/call";

export default function VideoCall() {
  const { localStream, remoteStream, activeCall, endCall, callStatus } = useCall();
  const [videoOn, setVideoOn] = createSignal(true);
  const [audioOn, setAudioOn] = createSignal(true);
  let localRef: HTMLVideoElement | undefined;
  let remoteRef: HTMLVideoElement | undefined;

  onMount(() => {
    if (localRef && localStream()) localRef.srcObject = localStream();
  });

  // Update remote stream reactively
  const updateRemote = () => {
    if (remoteRef && remoteStream()) remoteRef.srcObject = remoteStream();
  };

  return (
    <div class="video-call-overlay">
      <div class="video-call">
        <div class="video-remote">
          <Show when={remoteStream()} fallback={<div class="video-placeholder">Connecting...</div>}>
            <video ref={(el) => { remoteRef = el; updateRemote(); }} autoplay playsinline />
          </Show>
        </div>

        <div class="video-local">
          <video ref={(el) => { localRef = el; if (localStream()) el.srcObject = localStream(); }} autoplay playsinline muted />
        </div>

        <div class="call-controls">
          <button
            class={`call-btn ${videoOn() ? "" : "off"}`}
            onClick={() => { const on = activeCall()?.toggleVideo(); setVideoOn(!!on); }}
          >
            {videoOn() ? "Cam On" : "Cam Off"}
          </button>
          <button
            class={`call-btn ${audioOn() ? "" : "off"}`}
            onClick={() => { const on = activeCall()?.toggleAudio(); setAudioOn(!!on); }}
          >
            {audioOn() ? "Mic On" : "Mic Off"}
          </button>
          <button class="call-btn end" onClick={endCall}>End Call</button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create IncomingCall component**

Create `client/src/components/IncomingCall.tsx`:

```tsx
import { useCall } from "../store/call";

export default function IncomingCall() {
  const { acceptCall, rejectCall, callTargetId } = useCall();

  return (
    <div class="incoming-call-overlay">
      <div class="incoming-call">
        <p>Incoming call from user #{callTargetId()}</p>
        <div class="incoming-actions">
          <button class="call-btn accept" onClick={acceptCall}>Accept</button>
          <button class="call-btn end" onClick={rejectCall}>Decline</button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Add call button to ChatWindow header**

Modify `client/src/components/ChatWindow.tsx` — add to the `.chat-header` div:

```tsx
<button class="btn-call" onClick={() => props.onStartCall?.(props.friendId)}>
  Call
</button>
```

Update the props interface:

```tsx
export default function ChatWindow(props: {
  friendId: number;
  onBack: () => void;
  onStartCall?: (friendId: number) => void;
}) {
```

**Step 4: Integrate calls into Chat page**

Update `client/src/pages/Chat.tsx` to include call overlays:

```tsx
import { onMount, Show, createSignal } from "solid-js";
import { useAuth } from "../store/auth";
import { useChat } from "../store/chat";
import { useCall } from "../store/call";
import { wsClient } from "../lib/ws";
import FriendList from "../components/FriendList";
import AddFriend from "../components/AddFriend";
import PendingRequests from "../components/PendingRequests";
import ChatWindow from "../components/ChatWindow";
import VideoCall from "../components/VideoCall";
import IncomingCall from "../components/IncomingCall";

export default function Chat() {
  const { user, token, logout } = useAuth();
  const { state, setActiveFriend, initKeys, setupListeners } = useChat();
  const { callStatus, setupCallListeners, startCall } = useCall();
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  onMount(async () => {
    wsClient.connect(token()!);
    await initKeys();
    setupListeners();
    setupCallListeners();
  });

  return (
    <div class="chat-layout">
      <Show when={callStatus() === "incoming"}>
        <IncomingCall />
      </Show>
      <Show when={callStatus() === "calling" || callStatus() === "connected"}>
        <VideoCall />
      </Show>

      <aside class={`sidebar ${sidebarOpen() ? "open" : ""}`}>
        <div class="sidebar-header">
          <h2>Whisper</h2>
          <span class="user-name">{user()?.displayName}</span>
          <button onClick={logout} class="btn-logout">Logout</button>
        </div>
        <AddFriend />
        <PendingRequests />
        <FriendList
          onSelect={(id) => { setActiveFriend(id); setSidebarOpen(false); }}
          activeId={state.activeFriend}
        />
      </aside>
      <main class="chat-main">
        <Show when={state.activeFriend} fallback={<p class="placeholder">Select a friend to chat</p>}>
          <ChatWindow
            friendId={state.activeFriend!}
            onBack={() => { setActiveFriend(null); setSidebarOpen(true); }}
            onStartCall={(id) => startCall(id)}
          />
        </Show>
      </main>
    </div>
  );
}
```

**Step 5: Add video call styles to global.css**

Append to `client/src/styles/global.css`:

```css
/* Video call overlay */
.video-call-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: var(--bg);
  display: flex; align-items: center; justify-content: center;
}
.video-call {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  position: relative;
}
.video-remote {
  flex: 1; background: #000;
  display: flex; align-items: center; justify-content: center;
}
.video-remote video { width: 100%; height: 100%; object-fit: cover; }
.video-placeholder { color: var(--text-muted); font-size: 1.2rem; }
.video-local {
  position: absolute; top: 20px; right: 20px;
  width: 200px; aspect-ratio: 4/3;
  border-radius: 12px; overflow: hidden;
  border: 2px solid var(--border);
}
.video-local video { width: 100%; height: 100%; object-fit: cover; }

.call-controls {
  position: absolute; bottom: 30px; left: 50%;
  transform: translateX(-50%);
  display: flex; gap: 12px;
}
.call-btn {
  padding: 12px 24px; border: none; border-radius: 50px;
  font-size: 0.95rem; font-weight: 600; cursor: pointer;
  background: var(--surface-2); color: var(--text);
}
.call-btn.off { background: var(--danger); color: white; }
.call-btn.end { background: var(--danger); color: white; }
.call-btn.accept { background: var(--success); color: white; }
.btn-call {
  padding: 6px 16px; background: var(--success); color: white;
  border: none; border-radius: var(--radius); cursor: pointer;
  font-weight: 600; margin-left: auto;
}

/* Incoming call */
.incoming-call-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.8);
  display: flex; align-items: center; justify-content: center;
}
.incoming-call {
  background: var(--surface); padding: 32px;
  border-radius: 16px; text-align: center;
  display: flex; flex-direction: column; gap: 20px;
}
.incoming-actions { display: flex; gap: 16px; justify-content: center; }
```

**Step 6: Commit**

```bash
git add client/src/components/VideoCall.tsx client/src/components/IncomingCall.tsx client/src/components/ChatWindow.tsx client/src/pages/Chat.tsx client/src/styles/global.css
git commit -m "feat: video call ui w/ incoming/outgoing call overlays"
```

---

## Phase 6: PWA & Docker

### Task 15: PWA Service Worker + Push Notifications

**Files:**
- Modify: `client/vite.config.ts` (already has PWA config)
- Create: `client/src/lib/push.ts`
- Create: `server/src/routes/push.ts`
- Modify: `server/src/index.ts` (add push route)

**Step 1: Implement client push subscription**

Create `client/src/lib/push.ts`:

```ts
import { api } from "./api";

export async function subscribeToPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    // Fetch VAPID public key from server
    const { publicKey } = await api("/api/push/vapid-key");
    const keyBytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes,
    });
  }

  const json = sub.toJSON();
  await api("/api/push/subscribe", {
    method: "POST",
    body: {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
  });
}
```

**Step 2: Implement server push routes**

Create `server/src/routes/push.ts`:

```ts
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

  app.get("/vapid-key", (c) => c.json({ publicKey: VAPID_PUBLIC }));

  app.post("/subscribe", async (c) => {
    const userId = c.get("userId") as number;
    const { endpoint, p256dh, auth } = await c.req.json();

    db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = ?, auth = ?`,
    ).run(userId, endpoint, p256dh, auth, p256dh, auth);

    return c.json({ ok: true });
  });

  return app;
}

export async function sendPushNotification(db: Database, userId: number, payload: { title: string; body: string }) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const subs = db
    .query("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
    .all(userId) as Array<{ endpoint: string; p256dh: string; auth: string }>;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
    } catch (err: any) {
      if (err.statusCode === 410) {
        db.query("DELETE FROM push_subscriptions WHERE endpoint = ?").run(sub.endpoint);
      }
    }
  }
}
```

**Step 3: Add push route to server index**

Add to `server/src/index.ts`:

```ts
import { pushRoutes } from "./routes/push";
// ... after other routes:
app.route("/api/push", pushRoutes(db));
```

**Step 4: Commit**

```bash
git add client/src/lib/push.ts server/src/routes/push.ts server/src/index.ts
git commit -m "feat: web push notifications w/ vapid"
```

---

### Task 16: Docker Production Setup

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Create: `.env.example`

**Step 1: Rewrite Dockerfile for Bun**

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb* ./
COPY server/package.json server/
COPY client/package.json client/
RUN bun install --frozen-lockfile
COPY . .
RUN cd client && bun run build
RUN cd server && bun build src/index.ts --outdir dist --target bun

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/migrations ./server/migrations
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/package.json ./server/
RUN cd server && bun install --production
EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "run", "server/dist/index.js"]
```

**Step 2: Update docker-compose.yml**

```yaml
version: '3.8'
services:
  app:
    build: .
    container_name: whisper
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=${JWT_SECRET}
      - VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
      - VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
      - VAPID_MAILTO=${VAPID_MAILTO}
    volumes:
      - app-data:/app/data
    restart: unless-stopped

volumes:
  app-data:
```

**Step 3: Create .env.example**

```env
JWT_SECRET=change-me-to-a-random-string
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_MAILTO=mailto:you@example.com
```

**Step 4: Update .gitignore**

Append to `.gitignore`:

```
.env
data/
dist/
```

**Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example .gitignore
git commit -m "feat: docker prod setup w/ bun + volume for sqlite"
```

---

### Task 17: Serve Client Static Files from Server

**Files:**
- Modify: `server/src/index.ts`

**Step 1: Add static file serving for production**

Add to `server/src/index.ts` before the `Bun.serve` call:

```ts
import { existsSync } from "fs";
import { join } from "path";

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
```

**Step 2: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: serve client static files in prod"
```

---

## Phase 7: Polish

### Task 18: Online Status Indicators

**Files:**
- Modify: `server/src/ws.ts` (broadcast online status)
- Modify: `client/src/store/chat.ts` (track online users)
- Modify: `client/src/components/FriendList.tsx` (show status dot)

**Step 1: Add presence broadcasting to server ws.ts**

In `server/src/ws.ts`, after successful auth in the `message` handler, broadcast to all friends:

```ts
// After: onlineUsers.set(payload.sub, { ... })
// Broadcast presence to friends
const friends = db.query(
  `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as friend_id
   FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'`
).all(payload.sub, payload.sub, payload.sub) as Array<{friend_id: number}>;

for (const f of friends) {
  const friendWs = onlineUsers.get(f.friend_id);
  if (friendWs) {
    friendWs.ws.send(JSON.stringify({ type: "presence", userId: payload.sub, online: true }));
  }
}
```

In the `close` handler, broadcast offline status similarly.

**Step 2: Track presence in client chat store**

In `client/src/store/chat.ts`, add a presence listener in `setupListeners`:

```ts
wsClient.on("presence", (data) => {
  setState("onlineUsers", (prev) => {
    const next = new Set(prev);
    data.online ? next.add(data.userId) : next.delete(data.userId);
    return next;
  });
});
```

**Step 3: Show status dot in FriendList**

In `FriendList.tsx`, accept `onlineUsers` prop and show a green/gray dot next to each friend's avatar.

**Step 4: Commit**

```bash
git add server/src/ws.ts client/src/store/chat.ts client/src/components/FriendList.tsx
git commit -m "feat: online presence indicators"
```

---

### Task 19: Generate VAPID Keys + Setup Script

**Files:**
- Create: `scripts/generate-vapid.ts`

**Step 1: Create script**

```ts
import webpush from "web-push";

const vapid = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${vapid.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapid.privateKey}`);
```

**Step 2: Commit**

```bash
git add scripts/
git commit -m "feat: vapid key generation script"
```

---

### Task 20: README + Final Verification

**Files:**
- Modify: `README.md`

**Step 1: Rewrite README**

```markdown
# Whisper — Encrypted Chat & Video Calls

E2E encrypted messaging + WebRTC video calls. PWA.

## Stack
- **Client:** SolidJS + Vite + Web Crypto API
- **Server:** Hono + Bun + SQLite
- **Encryption:** X25519 + AES-256-GCM (browser-native)
- **Video:** WebRTC P2P

## Dev

```bash
bun install
bun run dev
```

Server: http://localhost:3000 | Client: http://localhost:5173

## Prod

```bash
cp .env.example .env
bun run scripts/generate-vapid.ts >> .env
# Edit .env with JWT_SECRET

docker compose up -d
```

## Architecture

```
Client A <--WS(E2E encrypted)--> Hono/Bun Server <--WS--> Client B
   |                                                          |
   +------------------WebRTC (P2P video/audio)----------------+
```

Messages encrypted client-side before sending. Server relays ciphertext blindly.
Video/audio goes directly peer-to-peer via WebRTC.
```

**Step 2: Run full build verification**

```bash
bun install
cd client && bun run build
cd ../server && bun test
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: readme w/ setup + architecture"
```

---

## Summary

| Phase | Tasks | What's Built |
|-------|-------|-------------|
| 1 - Bootstrap | 1-6 | Bun monorepo, SQLite schema, auth, friends API, WS signaling |
| 2 - Client | 7 | SolidJS app shell, auth pages, routing, PWA manifest |
| 3 - Crypto | 8-9 | X25519+AES-GCM encryption, IndexedDB key storage |
| 4 - Chat UI | 10-12 | WebSocket client, friends UI, encrypted chat window |
| 5 - Video | 13-14 | WebRTC call service, video call UI |
| 6 - PWA/Docker | 15-17 | Push notifications, Docker prod, static serving |
| 7 - Polish | 18-20 | Online presence, VAPID setup, README |

**Total: 20 tasks, ~40 files**

**Zero-dependency highlights:** Encryption (Web Crypto), WebRTC (browser-native), SQLite (bun:sqlite), password hashing (Bun.password), WebSocket (Bun native).
