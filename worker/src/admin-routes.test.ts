import { describe, it, expect, beforeEach } from "vitest";
import app from "./index";
import type { Env } from "./index";
import { hashPassword } from "./auth";

// Minimal in-memory D1 mock sufficient for admin route integration tests.
function createMockDB() {
  const loginAttempts: Array<{ ip_hash: string; ts: number }> = [];
  const entries: Array<Record<string, unknown>> = [];
  let nextId = 1;

  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (sql.includes("FROM login_attempts")) {
                const [ipHash, since] = params;
                const n = loginAttempts.filter((a) => a.ip_hash === ipHash && a.ts > (since as number)).length;
                return { n } as unknown as T;
              }
              if (sql.startsWith("INSERT INTO entries") && sql.includes("RETURNING")) {
                const row = { id: nextId++, source_type: "admin", created_at: new Date().toISOString() };
                entries.push(row);
                return row as unknown as T;
              }
              if (sql.includes("SELECT * FROM entries WHERE id")) {
                const [id] = params;
                return (entries.find((e) => e.id === id) ?? null) as T | null;
              }
              return null;
            },
            async run() {
              if (sql.startsWith("INSERT INTO login_attempts")) {
                const [ipHash, ts] = params;
                loginAttempts.push({ ip_hash: ipHash as string, ts: ts as number });
              }
              return { meta: { changes: 1 } };
            },
            async all() {
              return { results: entries.filter((e) => e.source_type === "admin") };
            },
          };
        },
      };
    },
  };
  return db as unknown as D1Database;
}

describe("admin auth routes", () => {
  let env: Env;

  beforeEach(async () => {
    env = {
      DB: createMockDB(),
      ADMIN_PASSWORD_HASH: await hashPassword("super-secret-admin-pass"),
      SESSION_SECRET: "test-session-secret",
    };
  });

  it("rejects login with wrong password", async () => {
    const res = await app.request(
      "/api/admin/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "wrong" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it("accepts login with correct password and returns a token", async () => {
    const res = await app.request(
      "/api/admin/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "super-secret-admin-pass" }) },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBeTruthy();
  });

  it("rejects admin entry creation without a token", async () => {
    const res = await app.request(
      "/api/admin/entries",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      env
    );
    expect(res.status).toBe(401);
  });

  it("rejects admin entry creation with an invalid token", async () => {
    const res = await app.request(
      "/api/admin/entries",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer not-a-real-token" },
        body: JSON.stringify({}),
      },
      env
    );
    expect(res.status).toBe(401);
  });

  it("allows admin entry creation with a valid token", async () => {
    const loginRes = await app.request(
      "/api/admin/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "super-secret-admin-pass" }) },
      env
    );
    const { token } = (await loginRes.json()) as { token: string };

    const createRes = await app.request(
      "/api/admin/entries",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name_pl: "Testowy Dzień", name_en: "Test Day", date_month: 6, date_day: 15,
          region: "poland", category: "dish",
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
  });

  it("rejects invalid entry payload with 422", async () => {
    const loginRes = await app.request(
      "/api/admin/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "super-secret-admin-pass" }) },
      env
    );
    const { token } = (await loginRes.json()) as { token: string };

    const createRes = await app.request(
      "/api/admin/entries",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name_pl: "", date_month: 13, region: "mars", category: "dish" }),
      },
      env
    );
    expect(createRes.status).toBe(422);
  });

  it("locks out after 5 failed login attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await app.request(
        "/api/admin/login",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "wrong" }) },
        env
      );
    }
    const res = await app.request(
      "/api/admin/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "wrong" }) },
      env
    );
    expect(res.status).toBe(429);
  });
});
