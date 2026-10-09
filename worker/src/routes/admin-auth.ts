import { Hono } from "hono";
import type { Env } from "../index";
import { verifyPassword, issueToken, verifyToken } from "../auth";
import { isRateLimited, recordFailedAttempt } from "../auth/rate-limit";

export const adminAuthRoute = new Hono<{ Bindings: Env }>();

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
}

adminAuthRoute.post("/login", async (c) => {
  const ip = clientIp(c);
  if (await isRateLimited(c.env, ip)) {
    return c.json({ error: "rate_limited", message: "Too many failed attempts. Try again later." }, 429);
  }

  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }

  const password = body.password;
  const hash = c.env.ADMIN_PASSWORD_HASH;
  if (!password || typeof password !== "string" || !hash) {
    await recordFailedAttempt(c.env, ip);
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const valid = await verifyPassword(password, hash);
  if (!valid) {
    await recordFailedAttempt(c.env, ip);
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const { token, expiresAt } = await issueToken(c.env.SESSION_SECRET);
  return c.json({ token, expiresAt });
});

adminAuthRoute.post("/logout", async (c) => {
  // Stateless token: client simply discards it. No server-side revocation store in v1.
  return c.json({ ok: true });
});

/** Middleware: require a valid Bearer session token. Mount on all /api/admin/* write routes. */
export async function adminAuthMiddleware(
  c: { req: { header: (k: string) => string | undefined }; env: Env; json: (body: unknown, status: number) => Response },
  next: () => Promise<void>
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) return c.json({ error: "unauthorized" }, 401);

  const payload = await verifyToken(match[1], c.env.SESSION_SECRET);
  if (!payload) return c.json({ error: "unauthorized" }, 401);

  await next();
}
