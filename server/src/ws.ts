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

            onlineUsers.set(payload.sub, { userId: payload.sub, email: payload.email, ws });
            db.query("UPDATE users SET last_seen = unixepoch() WHERE id = ?").run(payload.sub);

            ws.send(JSON.stringify({ type: "authenticated", userId: payload.sub }));

            // Deliver queued offline messages
            const queued = db
              .query("SELECT id, sender_id, ciphertext, nonce, created_at FROM messages WHERE recipient_id = ? AND delivered = 0 ORDER BY created_at")
              .all(payload.sub) as Array<{ id: number; sender_id: number; ciphertext: string; nonce: string; created_at: number }>;

            for (const msg of queued) {
              ws.send(JSON.stringify({ type: "chat", id: msg.id, from: msg.sender_id, ciphertext: msg.ciphertext, nonce: msg.nonce, timestamp: msg.created_at }));
              db.query("UPDATE messages SET delivered = 1 WHERE id = ?").run(msg.id);
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

      switch (data.type) {
        case "chat": {
          if (!data.to || !data.ciphertext || !data.nonce) break;
          const recipient = onlineUsers.get(data.to);
          const timestamp = Math.floor(Date.now() / 1000);
          const msg = { type: "chat", from: userId, ciphertext: data.ciphertext, nonce: data.nonce, timestamp };

          // Always persist
          const result = db.query("INSERT INTO messages (sender_id, recipient_id, ciphertext, nonce, delivered) VALUES (?, ?, ?, ?, ?)").run(
            userId, data.to, data.ciphertext, data.nonce, recipient ? 1 : 0,
          );

          // ACK to sender with server-assigned ID
          ws.send(JSON.stringify({ type: "chat-ack", clientId: data.clientId, serverId: Number(result.lastInsertRowid), timestamp }));

          if (recipient) {
            recipient.ws.send(JSON.stringify({ ...msg, id: Number(result.lastInsertRowid) }));
          }
          break;
        }

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
        const userId = ws.data.userId;
        onlineUsers.delete(userId);

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
