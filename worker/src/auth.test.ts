import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, issueToken, verifyToken, sha256Hex } from "./auth";

describe("password hashing", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("same-password", h1)).toBe(true);
    expect(await verifyPassword("same-password", h2)).toBe(true);
  });

  it("rejects malformed stored hash", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});

describe("session tokens", () => {
  const secret = "test-session-secret";

  it("issues a token that verifies successfully", async () => {
    const { token } = await issueToken(secret);
    const payload = await verifyToken(token, secret);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("admin");
  });

  it("rejects a token signed with a different secret", async () => {
    const { token } = await issueToken(secret);
    const payload = await verifyToken(token, "wrong-secret");
    expect(payload).toBeNull();
  });

  it("rejects a tampered token payload", async () => {
    const { token } = await issueToken(secret);
    const [payloadB64, sig] = token.split(".");
    const tampered = `${payloadB64}x.${sig}`;
    expect(await verifyToken(tampered, secret)).toBeNull();
  });

  it("rejects an expired token", async () => {
    // Issue a token, then verify against a manually expired payload by checking exp logic directly:
    // simulate by crafting a token with exp in the past using the same signing path.
    const past = Math.floor(Date.now() / 1000) - 10;
    const payload = { sub: "admin" as const, iat: past - 100, exp: past, jti: "x" };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
    const sig = Buffer.from(sigBuf).toString("base64url");
    const token = `${payloadB64}.${sig}`;
    expect(await verifyToken(token, secret)).toBeNull();
  });

  it("rejects malformed token", async () => {
    expect(await verifyToken("not-a-token", secret)).toBeNull();
  });
});

describe("sha256Hex", () => {
  it("produces a stable 64-char hex digest", async () => {
    const h = await sha256Hex("1.2.3.4");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("1.2.3.4")).toBe(h);
  });
});
