# Whisper — Encrypted Chat & Video Calls

E2E encrypted messaging + WebRTC video calls. PWA.

## Stack

- **Client:** SolidJS + Vite + Web Crypto API (X25519 + AES-256-GCM)
- **Server:** Hono + Bun + SQLite (bun:sqlite)
- **Auth:** Argon2id (Bun.password) + JWT
- **Video:** WebRTC peer-to-peer
- **Push:** Web Push API (VAPID)

## Local Development

### Prerequisites

- [Bun](https://bun.sh/) v1.0+

### Setup

```bash
# Install dependencies
bun install

# Create env file (optional — defaults work for dev)
cp .env.example .env
```

### Run

```bash
# Start both server and client
bun run dev

# Or start separately:
bun run dev:server   # API + WebSocket at http://localhost:3000
bun run dev:client   # Vite dev server at http://localhost:5173 (proxies /api + /ws to :3000)
```

### Other commands

```bash
bun run build        # Production build (client + server)
bun run test         # Run all tests
bun run seed         # Seed DB with test data
bun run lint         # ESLint
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
- WS client auto-reconnects with exponential backoff (1s → 30s max); pending messages are queued and replayed on reconnect. Reconnects on tab visibility change. Keepalive ping every 25s. Opening a second session closes the first (code 4000).

## Features

- Email registration + JWT auth
- Friend search by email, friend requests, accept/reject
- E2E encrypted text chat (X25519 + AES-256-GCM)
- Offline message queue (delivered on reconnect)
- Read receipts
- Typing indicators (auto-cleared server-side after 5s)
- WebRTC video/audio calls with cam/mic toggle, ringtone
- Online presence indicators (broadcast on connect/disconnect)
- Toast notifications
- PWA (installable, offline-capable)
- Web push notifications (VAPID)
- Rate limiting on auth routes (20 req / 15 min per IP)
- Responsive (mobile + desktop)

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
│   │   │   ├── ice.ts        # ICE server config
│   │   │   ├── keys.ts       # Public key exchange
│   │   │   ├── messages.ts   # Message history
│   │   │   └── push.ts       # Push subscription
│   │   └── middleware/
│   │       ├── auth.ts       # JWT verification
│   │       └── rateLimit.ts  # IP-based rate limiting
│   └── migrations/
│       ├── 001_init.sql      # Schema
│       └── 002_read_receipts.sql
├── client/
│   ├── src/
│   │   ├── index.tsx         # SolidJS entry
│   │   ├── App.tsx           # Router
│   │   ├── pages/            # Login, Register, Chat
│   │   ├── components/       # FriendList, ChatWindow, VideoCall, IncomingCall, Toast, etc.
│   │   ├── store/            # auth.ts, chat.ts, call.ts
│   │   ├── lib/              # api.ts, ws.ts, crypto.ts, keystore.ts, webrtc.ts, push.ts, ringtone.ts, utils.ts
│   │   └── styles/
│   └── vite.config.ts
├── scripts/
│   └── generate-vapid.ts
├── .github/
│   └── workflows/ci.yml      # GitHub Actions: bun test + vitest on push/PR
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Glossary

**ICE (Interactive Connectivity Establishment)** — protocol WebRTC uses to find a working network path between two peers. It collects "candidates" (possible routes) and picks the best one.

**STUN (Session Traversal Utilities for NAT)** — server that tells a client its public IP/port as seen from the internet. Enables direct P2P connections through most NATs. Free public servers exist (e.g. Google's).

**TURN (Traversal Using Relays around NAT)** — fallback relay server when direct P2P fails (symmetric NAT, firewall). Traffic is proxied through the TURN server. Requires hosting/paying for bandwidth.

**NAT (Network Address Translation)** — router technique that maps many private IPs to one public IP. Causes WebRTC connectivity problems because peers can't reach each other's private addresses directly.

**SDP (Session Description Protocol)** — text format describing a media session (codecs, ICE candidates, DTLS fingerprint). Exchanged as "offer" and "answer" during WebRTC negotiation.

**DTLS-SRTP** — security layer for WebRTC media. DTLS establishes keys, SRTP encrypts the actual audio/video stream. Mandatory in WebRTC — media is always encrypted in transit.

**ECDH (Elliptic Curve Diffie-Hellman)** — key agreement protocol. Two parties each generate a key pair; combining one's private key with the other's public key produces the same shared secret without ever transmitting it. Used here via X25519 curve.

## License

MIT
