#!/usr/bin/env node
/**
 * Generates a PBKDF2 password hash for ADMIN_PASSWORD_HASH.
 * The plaintext password is NEVER written to disk or committed — it only
 * exists in this process's memory and is discarded after hashing.
 *
 * Usage:
 *   npx tsx scripts/hash-password.ts
 *   (prompts for password, prints the hash to stdout)
 *
 * Then set it as a Worker secret:
 *   cd worker && npx wrangler secret put ADMIN_PASSWORD_HASH
 *   (paste the printed hash when prompted)
 */
import { createInterface } from "node:readline";
import { webcrypto } from "node:crypto";

const crypto = webcrypto as unknown as Crypto;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, "binary").toString("base64url");
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

async function hashPassword(password: string): Promise<string> {
  const iterations = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // @ts-expect-error — accessing internal _writeToOutput to mask input
    const originalWrite = rl._writeToOutput?.bind(rl);
    let masked = false;
    // @ts-expect-error — override to mask password characters
    rl._writeToOutput = function (str: string) {
      if (masked && str !== "\n" && str !== "\r\n") return originalWrite?.("*");
      originalWrite?.(str);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    masked = true;
  });
}

async function main(): Promise<void> {
  const password = await promptHidden("Enter new admin password (min 16 chars): ");
  process.stdout.write("\n");
  if (password.length < 16) {
    console.error("Password must be at least 16 characters.");
    process.exit(1);
  }
  const hash = await hashPassword(password);
  console.log("\nGenerated hash (set this as the ADMIN_PASSWORD_HASH secret):\n");
  console.log(hash);
  console.log("\nRun: cd worker && npx wrangler secret put ADMIN_PASSWORD_HASH");
}

void main();
