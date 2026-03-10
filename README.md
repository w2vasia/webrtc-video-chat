# Whisper — Encrypted Chat & Video Calls

E2E encrypted messaging + WebRTC video calls. PWA.

## Stack

- **Client:** SolidJS + Vite + Web Crypto API (X25519 + AES-256-GCM)
- **Server:** Hono + Bun + SQLite (bun:sqlite)
- **Auth:** Argon2id (Bun.password) + JWT
- **Video:** WebRTC peer-to-peer
- **Push:** Web Push API (VAPID)

## Dev

```bash
bun install
bun run dev:server   # http://localhost:3000
bun run dev:client   # http://localhost:5173 (proxies /api + /ws to server)
```

## Prod

```bash
cp .env.example .env
bun run scripts/generate-vapid.ts >> .env
# Edit .env — set JWT_SECRET

docker compose up -d
# App at http://localhost:3000
```

## Architecture

```
Client A <──WS (E2E encrypted)──> Hono/Bun Server <──WS──> Client B
   │                                                           │
   └──────────────── WebRTC (P2P video/audio) ─────────────────┘
```

- Messages encrypted client-side before sending. Server relays ciphertext blindly.
- Video/audio goes directly peer-to-peer via WebRTC (DTLS-SRTP).
- Keys generated via X25519, shared secret derived via ECDH, messages encrypted with AES-256-GCM.
- All crypto uses browser-native Web Crypto API — zero dependencies.

## Features

- Email registration + JWT auth
- Friend search by email, friend requests, accept/reject
- E2E encrypted text chat (X25519 + AES-256-GCM)
- Offline message queue (delivered on reconnect)
- WebRTC video/audio calls with cam/mic toggle
- Online presence indicators
- PWA (installable, offline-capable)
- Web push notifications (VAPID)
- Dark theme, responsive (mobile + desktop)

## Project Structure

```
├── server/
│   ├── src/
│   │   ├── index.ts          # Hono entrypoint + Bun.serve
│   │   ├── db.ts             # SQLite + migrations
│   │   ├── auth.ts           # Argon2 + JWT helpers
│   │   ├── ws.ts             # WebSocket handlers (chat relay, signaling, presence)
│   │   ├── routes/
│   │   │   ├── auth.ts       # POST /register, /login
│   │   │   ├── friends.ts    # Search, request, accept, list
│   │   │   ├── keys.ts       # Public key exchange
│   │   │   └── push.ts       # Push subscription
│   │   └── middleware/
│   │       └── auth.ts       # JWT verification
│   └── migrations/
│       └── 001_init.sql      # Schema
├── client/
│   ├── src/
│   │   ├── index.tsx         # SolidJS entry
│   │   ├── App.tsx           # Router
│   │   ├── pages/            # Login, Register, Chat
│   │   ├── components/       # FriendList, ChatWindow, VideoCall, etc.
│   │   ├── store/            # auth.ts, chat.ts, call.ts
│   │   ├── lib/              # api.ts, ws.ts, crypto.ts, keystore.ts, webrtc.ts, push.ts
│   │   └── styles/
│   └── vite.config.ts
├── scripts/
│   └── generate-vapid.ts
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## License

MIT
