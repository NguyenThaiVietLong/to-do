import { createHmac, timingSafeEqual } from "node:crypto";

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

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate: unknown): boolean {
  const secret = password();
  if (secret === null || typeof candidate !== "string") return false;
  return safeEqual(candidate, secret);
}

export function createSessionToken(now = Date.now()): string {
  const secret = password();
  if (secret === null) throw new Error("APP_PASSWORD is not set");
  const expiry = String(now + SESSION_MS);
  return `${expiry}.${sign(expiry, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): boolean {
  const secret = password();
  if (secret === null) return true; // Auth disabled — nothing to verify.
  if (token === undefined) return false;

  const dot = token.indexOf(".");
  if (dot === -1) return false;

  const expiry = token.slice(0, dot);
  const digest = token.slice(dot + 1);
  if (!safeEqual(digest, sign(expiry, secret))) return false;

  const expiresAt = Number(expiry);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
