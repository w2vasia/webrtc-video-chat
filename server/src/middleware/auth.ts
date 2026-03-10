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
