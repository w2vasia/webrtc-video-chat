# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev              # start server + client concurrently
bun run dev:server       # server only (port 3000, --watch)
bun run dev:client       # client only (Vite, port 5173)
bun run build            # production build (both)
bun run test             # all tests
bun test server/         # server tests only (bun:test)
bun test server/src/routes/auth.test.ts  # single test file
cd client && bunx vitest run             # client tests (vitest)
bun run seed             # seed DB with test data
```

## Architecture

Monorepo: `server/` (Hono + Bun) and `client/` (SolidJS + Vite). Package manager: **bun**.

**Server** is a Hono app served by `Bun.serve()` with both HTTP routes and WebSocket on the same port. Routes accept a `db: Database` parameter (bun:sqlite). Auth uses JWT (HS256, 24h) + Argon2id password hashing. All `/api/*` routes (except `/api/auth`) are protected by `authMiddleware()`.

**Client** is a SolidJS SPA. Vite proxies `/api` and `/ws` to `localhost:3000` in dev. State lives in module-level signals/stores (`store/auth.ts`, `store/chat.ts`, `store/call.ts`). Uses `@solidjs/router` for pages.

**E2E encryption**: X25519 ECDH key exchange + AES-256-GCM via Web Crypto API (zero dependencies). Server relays ciphertext blindly — never decrypts. Private keys stored in IndexedDB. Static keys per user (no forward secrecy).

**WebSocket flow**: Client connects to `/ws`, sends `{type:"auth", token}` first. Server then delivers queued offline messages and broadcasts presence. Chat messages are `{type:"chat", to, ciphertext, nonce, clientId}` → server persists + relays → ACKs with `serverId`. WebRTC signaling (offer/answer/ICE/end) also goes through WS with whitelisted fields.

**Message conventions**: `msg.from === 0` means outgoing (sent by current user), `msg.from !== 0` means received (sender's actual user ID).

## Key Constraints

- bun:sqlite `db.exec()` only executes the first SQL statement in bun 1.0.4 — migrations split on `;` instead
- bun:sqlite `.run()` returns `undefined` in 1.0.4 — use `SELECT changes()` after mutations
- X25519 not supported in bun's crypto — client crypto tests fail in bun test runner (pass in browser)
- Server tests use in-memory SQLite (`:memory:`) for isolation
- Rate limiting on auth routes: 20 req/15min per IP

## Environment

Copy `.env.example` → `.env`. Required in production: `JWT_SECRET`. Optional: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_MAILTO` for push notifications, `CLIENT_ORIGIN` for CORS, `PORT` (default 3000).

## Style

- Tailwind CSS v4 — `@import "tailwindcss"` + `@theme {}` block in `client/src/styles/global.css`, `@tailwindcss/vite` plugin (no `tailwind.config.js`)
- Custom design tokens defined in `@theme {}`: `--color-primary`, `--color-surface-2`, `--color-chat-bg`, etc.
- SolidJS: use `class=` not `className=`
