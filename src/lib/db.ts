import { promises as fs } from "node:fs";
import path from "node:path";
import { LISTS } from "./seed";
import type { AppState } from "./types";

/* -------------------------------------------------------------------------- */
/* JSON file store                                                             */
/*                                                                             */
/* Server-side only — never import this from a "use client" module. The whole  */
/* state is one file: small enough to rewrite on every mutation, and readable   */
/* by eye when something looks wrong.                                          */
/* -------------------------------------------------------------------------- */

// DATA_DIR points at the mounted volume when deployed; locally it is ./data.
// Resolved once per process — the file must not move under a running server.
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

/** A fresh install: the default lists, no tasks. */
export function emptyState(): AppState {
  return { lists: LISTS.map((l) => ({ ...l })), tasks: [] };
}

function isValid(state: unknown): state is AppState {
  if (typeof state !== "object" || state === null) return false;
  const s = state as AppState;
  return Array.isArray(s.lists) && Array.isArray(s.tasks);
}

async function readRaw(): Promise<AppState> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
    return isValid(parsed) ? parsed : emptyState();
  } catch {
    // Missing on first run, or corrupt — either way, start from empty rather
    // than failing every request.
    return emptyState();
  }
}

async function writeRaw(state: AppState): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  // Write-then-rename: a crash mid-write leaves the old file intact instead of
  // a half-written one.
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, DB_PATH);
}

// Read-modify-write is not atomic on its own, so every access goes through one
// promise chain. Two requests arriving together queue instead of interleaving —
// otherwise the second read sees pre-first-write state and drops that change.
let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export function readState(): Promise<AppState> {
  return withLock(readRaw);
}

/**
 * Read, transform, write — all inside the lock. Return `null` from `fn` to
 * abort the write (used for "not found", which must not rewrite the file).
 */
export function mutate<T>(
  fn: (state: AppState) => { state: AppState; result: T } | null,
): Promise<T | null> {
  return withLock(async () => {
    const next = fn(await readRaw());
    if (next === null) return null;
    await writeRaw(next.state);
    return next.result;
  });
}

export function writeState(state: AppState): Promise<AppState> {
  return withLock(async () => {
    await writeRaw(state);
    return state;
  });
}
