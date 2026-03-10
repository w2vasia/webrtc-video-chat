import type { Context } from "hono";

type IceServer = { urls: string; username?: string; credential?: string };

export async function iceHandler(c: Context) {
  const servers: IceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  if (process.env.TURN_URL) {
    servers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return c.json(servers, 200);
}
