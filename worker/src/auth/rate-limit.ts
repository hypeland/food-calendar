import type { Env } from "../index";
import { sha256Hex } from "../auth";

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;

/** Returns true if the IP is currently rate-limited (>= MAX_ATTEMPTS failures in the window). */
export async function isRateLimited(env: Env, ip: string): Promise<boolean> {
  const ipHash = await sha256Hex(ip);
  const since = Math.floor(Date.now() / 1000) - WINDOW_SECONDS;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM login_attempts WHERE ip_hash = ? AND ts > ?"
  ).bind(ipHash, since).first<{ n: number }>();
  return (row?.n ?? 0) >= MAX_ATTEMPTS;
}

/** Record a failed login attempt for the given IP. */
export async function recordFailedAttempt(env: Env, ip: string): Promise<void> {
  const ipHash = await sha256Hex(ip);
  const ts = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO login_attempts (ip_hash, ts) VALUES (?, ?)").bind(ipHash, ts).run();
  // Opportunistic cleanup of old rows (best-effort, not critical-path)
  await env.DB.prepare("DELETE FROM login_attempts WHERE ts <= ?").bind(ts - WINDOW_SECONDS).run();
}
