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
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Call state tracking for system events
const pendingOffers = new Map<string, { callerId: number; calleeId: number; offeredAt: number }>();
const activeCalls = new Map<string, { callerId: number; calleeId: number; startedAt: number }>();

function callKey(a: number, b: number) {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

export function getPendingOffers() { return pendingOffers; }
export function getActiveCalls() { return activeCalls; }

interface WsRateEntry { count: number; resetAt: number }
const wsRateLimit = new Map<number, WsRateEntry>();

function checkWsRate(userId: number): boolean {
  const now = Date.now();
  const entry = wsRateLimit.get(userId);
  if (!entry || now >= entry.resetAt) {
    wsRateLimit.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 60;
}

export function getOnlineUsers() {
  return onlineUsers;
}

export function getWsRateLimit() {
  return wsRateLimit;
}

export function createWsHandlers(db: Database) {
  return {
    async message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try {
        data = JSON.parse(typeof message === "string" ? message : message.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      // Auth handshake must be first message
      if (!ws.data.authenticated) {
        if (data.type === "auth") {
          try {
            const payload = await verifyToken(data.token);
            ws.data.userId = payload.sub;
            ws.data.email = payload.email;
            ws.data.authenticated = true;

            // Close previous connection if user opens another tab
            const existing = onlineUsers.get(payload.sub);
            if (existing) {
              existing.ws.send(JSON.stringify({ type: "session-replaced" }));
              existing.ws.close(4000, "Session replaced");
            }

            onlineUsers.set(payload.sub, { userId: payload.sub, email: payload.email, ws });
            db.query("UPDATE users SET last_seen = unixepoch() WHERE id = ?").run(payload.sub);

            ws.send(JSON.stringify({ type: "authenticated", userId: payload.sub }));

            // Deliver queued offline messages
            const queued = db
              .query("SELECT id, sender_id, ciphertext, nonce, created_at FROM messages WHERE recipient_id = ? AND delivered = 0 ORDER BY created_at")
              .all(payload.sub) as Array<{ id: number; sender_id: number; ciphertext: string; nonce: string; created_at: number }>;

            for (const msg of queued) {
              ws.send(JSON.stringify({ type: "chat", from: msg.sender_id, id: msg.id, ciphertext: msg.ciphertext, nonce: msg.nonce, timestamp: msg.created_at }));
              db.query("UPDATE messages SET delivered = 1 WHERE id = ?").run(msg.id);
            }

            // Deliver queued system events
            const queuedEvents = db
              .query("SELECT id, user1_id, user2_id, event_type, metadata, target_id, created_at FROM system_events WHERE (user1_id = ? OR user2_id = ?) AND delivered = 0 ORDER BY created_at")
              .all(payload.sub, payload.sub) as Array<{ id: number; user1_id: number; user2_id: number; event_type: string; metadata: string | null; target_id: number | null; created_at: number }>;
            for (const evt of queuedEvents) {
              // rate_limited events only visible to sender
              if (evt.event_type === "rate_limited" && evt.user1_id !== payload.sub) continue;
              ws.send(JSON.stringify({ type: "system-event", event: evt }));
              db.query("UPDATE system_events SET delivered = 1 WHERE id = ?").run(evt.id);
            }

            // Broadcast online status to friends
            const friends = db.query(
              `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as friend_id
               FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'`
            ).all(payload.sub, payload.sub, payload.sub) as Array<{friend_id: number}>;

            for (const f of friends) {
              const friendWs = onlineUsers.get(f.friend_id);
              if (friendWs) {
                friendWs.ws.send(JSON.stringify({ type: "presence", userId: payload.sub, online: true }));
                ws.send(JSON.stringify({ type: "presence", userId: f.friend_id, online: true }));
              }
            }
          } catch {
            ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
            ws.close();
          }
        }
        return;
      }

      const userId = ws.data.userId!;

      const isFriend = (targetId: number) => {
        const row = db.query(
          "SELECT 1 FROM friendships WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted'"
        ).get(userId, targetId, targetId, userId);
        return !!row;
      };

      // Max payload size for ciphertext/nonce (64KB)
      const MAX_PAYLOAD = 65536;
      const MAX_SDP = 8192;
      const MAX_ICE = 2048;

      switch (data.type) {
        case "chat": {
          if (!checkWsRate(userId)) break;
          if (typeof data.to !== "number" || !Number.isInteger(data.to)) break;
          if (typeof data.ciphertext !== "string" || data.ciphertext.length > MAX_PAYLOAD) break;
          if (typeof data.nonce !== "string" || data.nonce.length < 12 || data.nonce.length > 64) break;
          if (!isFriend(data.to)) {
            ws.send(JSON.stringify({ type: "error", message: "Not friends" }));
            break;
          }
          const recipient = onlineUsers.get(data.to);
          const timestamp = Math.floor(Date.now() / 1000);

          db.query("INSERT INTO messages (sender_id, recipient_id, ciphertext, nonce, delivered) VALUES (?, ?, ?, ?, ?)").run(
            userId, data.to, data.ciphertext, data.nonce, recipient ? 1 : 0,
          );
          const { id: msgId } = db.query("SELECT last_insert_rowid() as id").get() as { id: number };

          // ACK sender with server-assigned ID
          ws.send(JSON.stringify({ type: "chat-ack", clientId: data.clientId, serverId: msgId, timestamp }));

          if (recipient) {
            recipient.ws.send(JSON.stringify({ type: "chat", from: userId, id: msgId, ciphertext: data.ciphertext, nonce: data.nonce, timestamp }));
          }
          break;
        }

        case "call-offer": {
          if (typeof data.targetId !== "number" || !isFriend(data.targetId)) break;
          if (typeof data.offer?.sdp !== "string" || data.offer.sdp.length > MAX_SDP) break;
          pendingOffers.set(callKey(userId, data.targetId), { callerId: userId, calleeId: data.targetId, offeredAt: Date.now() });
          const target = onlineUsers.get(data.targetId);
          if (target) {
            target.ws.send(JSON.stringify({ type: "call-offer", senderId: userId, offer: data.offer }));
          }
          break;
        }
        case "call-answer": {
          if (typeof data.targetId !== "number" || !isFriend(data.targetId)) break;
          if (typeof data.answer?.sdp !== "string" || data.answer.sdp.length > MAX_SDP) break;
          const key = callKey(userId, data.targetId);
          const pending = pendingOffers.get(key);
          if (pending) {
            pendingOffers.delete(key);
            activeCalls.set(key, { ...pending, startedAt: Date.now() });
          }
          const target = onlineUsers.get(data.targetId);
          if (target) {
            target.ws.send(JSON.stringify({ type: "call-answer", senderId: userId, answer: data.answer }));
          }
          break;
        }
        case "ice-candidate": {
          if (typeof data.targetId !== "number" || !isFriend(data.targetId)) break;
          if (typeof data.candidate?.candidate !== "string" || data.candidate.candidate.length > MAX_ICE) break;
          const target = onlineUsers.get(data.targetId);
          if (target) {
            target.ws.send(JSON.stringify({ type: "ice-candidate", senderId: userId, candidate: data.candidate }));
          }
          break;
        }
        case "call-end": {
          if (typeof data.targetId !== "number" || !isFriend(data.targetId)) break;
          const key = callKey(userId, data.targetId);
          if (activeCalls.has(key)) {
            const { callerId, calleeId, startedAt } = activeCalls.get(key)!;
            activeCalls.delete(key);
            const duration = Math.round((Date.now() - startedAt) / 1000);
            const meta = JSON.stringify({ duration });
            db.query("INSERT INTO system_events (user1_id, user2_id, event_type, metadata) VALUES (?, ?, 'call_ended', ?)").run(calleeId, callerId, meta);
            const { id: evtId } = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
            const evt = { id: evtId, event_type: "call_ended", user1_id: calleeId, user2_id: callerId, metadata: meta, created_at: Math.floor(Date.now() / 1000) };
            const evtMsg = JSON.stringify({ type: "system-event", event: evt });
            const ws1 = onlineUsers.get(calleeId);
            const ws2 = onlineUsers.get(callerId);
            if (ws1) ws1.ws.send(evtMsg);
            if (ws2) ws2.ws.send(evtMsg);
            if (ws1 || ws2) db.query("UPDATE system_events SET delivered = 1 WHERE id = ?").run(evtId);
          } else if (pendingOffers.has(key)) {
            const { callerId, calleeId } = pendingOffers.get(key)!;
            pendingOffers.delete(key);
            db.query("INSERT INTO system_events (user1_id, user2_id, event_type) VALUES (?, ?, 'missed_call')").run(calleeId, callerId);
            const { id: evtId } = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
            const evt = { id: evtId, event_type: "missed_call", user1_id: calleeId, user2_id: callerId, metadata: null, created_at: Math.floor(Date.now() / 1000) };
            const evtMsg = JSON.stringify({ type: "system-event", event: evt });
            const ws1 = onlineUsers.get(calleeId);
            const ws2 = onlineUsers.get(callerId);
            if (ws1) ws1.ws.send(evtMsg);
            if (ws2) ws2.ws.send(evtMsg);
            if (ws1 || ws2) db.query("UPDATE system_events SET delivered = 1 WHERE id = ?").run(evtId);
          }
          const target = onlineUsers.get(data.targetId);
          if (target) {
            target.ws.send(JSON.stringify({ type: "call-end", senderId: userId }));
          }
          break;
        }

        case "read": {
          if (data.senderId === userId) break;
          if (typeof data.messageId !== "number" || !Number.isInteger(data.messageId)) break;
          if (typeof data.senderId !== "number" || !Number.isInteger(data.senderId)) break;
          if (!isFriend(data.senderId)) break;
          const msgRow = db.query(
            "SELECT id FROM messages WHERE id = ? AND sender_id = ? AND recipient_id = ?"
          ).get(data.messageId, data.senderId, userId);
          if (!msgRow) break;
          db.query("UPDATE messages SET read_at = unixepoch() WHERE id = ?").run(data.messageId);
          const sender = onlineUsers.get(data.senderId);
          if (sender) {
            sender.ws.send(JSON.stringify({ type: "read", messageId: data.messageId }));
          }
          break;
        }

        case "ping": {
          ws.send(JSON.stringify({ type: "pong" }));
          break;
        }

        case "typing": {
          if (typeof data.to !== "number" || !isFriend(data.to)) break;
          if (!checkWsRate(userId)) break;
          const target = onlineUsers.get(data.to);
          if (target) {
            const isTyping = !!data.isTyping;
            target.ws.send(JSON.stringify({ type: "typing", from: userId, isTyping }));
            const key = `${userId}->${data.to}`;
            clearTimeout(typingTimers.get(key));
            if (isTyping) {
              typingTimers.set(key, setTimeout(() => {
                typingTimers.delete(key);
                const t = onlineUsers.get(data.to);
                if (t) t.ws.send(JSON.stringify({ type: "typing", from: userId, isTyping: false }));
              }, 5000));
            } else {
              typingTimers.delete(key);
            }
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
          break;
      }
    },

    open(ws: ServerWebSocket<WsData>) {
      ws.data = { authenticated: false };
    },

    close(ws: ServerWebSocket<WsData>) {
      if (ws.data.userId) {
        const userId = ws.data.userId;
        // Guard: if a new session already replaced this WS, don't evict it
        if (onlineUsers.get(userId)?.ws !== ws) return;
        onlineUsers.delete(userId);
        db.query("UPDATE users SET last_seen = unixepoch() WHERE id = ?").run(userId);

        // Broadcast offline to friends
        const friends = db.query(
          `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as friend_id
           FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'`
        ).all(userId, userId, userId) as Array<{friend_id: number}>;

        for (const f of friends) {
          const friendWs = onlineUsers.get(f.friend_id);
          if (friendWs) {
            friendWs.ws.send(JSON.stringify({ type: "presence", userId, online: false }));
          }
        }
      }
    },
  };
}
