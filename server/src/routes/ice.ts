import { Hono } from "hono";

type IceServer = { urls: string; username?: string; credential?: string };

export function iceRoutes() {
  const app = new Hono();

  app.get("/", (c) => {
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
    return c.json(servers);
  });

  return app;
}
