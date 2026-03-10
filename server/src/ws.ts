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
          const recipient = onlineUsers.get(data.to);
          const msg = { type: "chat", from: userId, ciphertext: data.ciphertext, nonce: data.nonce, timestamp: Math.floor(Date.now() / 1000) };

          if (recipient) {
            recipient.ws.send(JSON.stringify(msg));
          } else {
            db.query("INSERT INTO messages (sender_id, recipient_id, ciphertext, nonce) VALUES (?, ?, ?, ?)").run(
              userId, data.to, data.ciphertext, data.nonce,
            );
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
        onlineUsers.delete(ws.data.userId);
      }
    },
  };
}
