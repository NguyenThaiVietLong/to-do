/* -------------------------------------------------------------------------- */
/* Shared-password auth                                                        */
/*                                                                             */
/* One password for the whole app, set as APP_PASSWORD. Enough to keep the      */
/* internet out of a personal to-do list; it is not multi-user auth and every   */
/* visitor who knows the password sees the same data.                          */
/*                                                                             */
/* The session cookie is `<expiry>.<hmac>`, signed with the password itself.    */
/* Nothing is stored server-side, so restarts don't log you out, and changing   */
/* APP_PASSWORD invalidates every existing session for free.                    */
/*                                                                             */
/* Web Crypto rather than node:crypto, so this works unchanged whichever        */
/* runtime the host gives Proxy.                                                */
/* -------------------------------------------------------------------------- */

export const SESSION_COOKIE = "todo_session";

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
  // Set over HTTPS in production; leaving it off in dev keeps http://localhost
  // working, where a `secure` cookie would simply be dropped.
  secure: process.env.NODE_ENV === "production",
} as const;

const encoder = new TextEncoder();

function password(): string | null {
  const value = process.env.APP_PASSWORD;
  return value === undefined || value === "" ? null : value;
}

/** True when a password is set, i.e. the app is actually protected. */
export function isAuthEnabled(): boolean {
  return password() !== null;
}

/**
 * Fail closed: a production build with no APP_PASSWORD would otherwise put an
 * unauthenticated read/write API on the public internet. In development the app
 * stays open so `npm run dev` needs no setup.
 */
export function isMisconfigured(): boolean {
  return process.env.NODE_ENV === "production" && !isAuthEnabled();
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Constant-time over the compared strings; only safe for fixed-length digests. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(candidate: unknown): Promise<boolean> {
  const secret = password();
  if (secret === null || typeof candidate !== "string") return false;
  // Compare digests, not the passwords: equal-length hashes mean the comparison
  // can't leak how long the real password is.
  const [a, b] = await Promise.all([sha256(candidate), sha256(secret)]);
  return safeEqual(a, b);
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const secret = password();
  if (secret === null) throw new Error("APP_PASSWORD is not set");
  const expiry = String(now + SESSION_MS);
  return `${expiry}.${await sign(expiry, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  const secret = password();
  if (secret === null) return true; // Auth disabled — nothing to verify.
  if (token === undefined) return false;

  const dot = token.indexOf(".");
  if (dot === -1) return false;

  const expiry = token.slice(0, dot);
  const digest = token.slice(dot + 1);
  if (!safeEqual(digest, await sign(expiry, secret))) return false;

  const expiresAt = Number(expiry);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
