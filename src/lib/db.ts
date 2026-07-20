import { neon } from "@neondatabase/serverless";
import { LISTS } from "./seed";
import type { AppState, Roadmap, Step, Task, TaskList } from "./types";

/* -------------------------------------------------------------------------- */
/* Postgres store                                                              */
/*                                                                             */
/* Server-side only — never import this from a "use client" module.            */
/*                                                                             */
/* Dates are stored as TEXT, not DATE. Every date in this app is a local        */
/* calendar `YYYY-MM-DD` string (see date.ts); letting the driver hand back a    */
/* Date would reintroduce exactly the UTC slide that convention exists to       */
/* avoid. Steps are JSONB — they are only ever read and written whole.          */
/* -------------------------------------------------------------------------- */

type Sql = ReturnType<typeof neon>;

let client: Sql | null = null;

function sql(): Sql {
  if (client === null) {
    const url = process.env.DATABASE_URL;
    if (url === undefined || url === "") {
      throw new Error("DATABASE_URL is not set.");
    }
    client = neon(url);
  }
  return client;
}

/** The default lists a fresh database starts with. */
export function emptyState(): AppState {
  return { lists: LISTS.map((l) => ({ ...l })), tasks: [], roadmaps: [] };
}

/* -------------------------------------------------------------------------- */
/* Schema                                                                      */
/* -------------------------------------------------------------------------- */

// One-shot per process. The schema is small and stable enough that
// CREATE TABLE IF NOT EXISTS beats carrying a migration tool.
let ready: Promise<void> | null = null;

async function migrate(): Promise<void> {
  const db = sql();

  await db`
    CREATE TABLE IF NOT EXISTS lists (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      seq  BIGSERIAL
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT PRIMARY KEY,
      list_id      TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      note         TEXT NOT NULL DEFAULT '',
      completed    BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at TEXT,
      created_at   TEXT NOT NULL,
      due_date     TEXT,
      my_day       BOOLEAN NOT NULL DEFAULT FALSE,
      important    BOOLEAN NOT NULL DEFAULT FALSE,
      steps        JSONB NOT NULL DEFAULT '[]'::jsonb,
      seq          BIGSERIAL
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS tasks_list_id_idx ON tasks (list_id)`;

  await db`
    CREATE TABLE IF NOT EXISTS roadmaps (
      id         TEXT PRIMARY KEY,
      list_id    TEXT NOT NULL UNIQUE REFERENCES lists(id) ON DELETE CASCADE,
      target     INTEGER NOT NULL CHECK (target >= 1),
      deadline   TEXT NOT NULL,
      started_at TEXT NOT NULL,
      seq        BIGSERIAL
    )
  `;

  // Seed the default lists once, on a genuinely empty database. ON CONFLICT
  // makes this safe to race — two cold starts at once can't duplicate them.
  for (const list of LISTS) {
    await db`
      INSERT INTO lists (id, name, icon) VALUES (${list.id}, ${list.name}, ${list.icon})
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

function init(): Promise<void> {
  if (ready === null) {
    ready = migrate().catch((err: unknown) => {
      // Don't cache a failed migration, or every later request fails with it.
      ready = null;
      throw err;
    });
  }
  return ready;
}

/* -------------------------------------------------------------------------- */
/* Row mapping                                                                 */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

function toList(r: Row): TaskList {
  return { id: r.id as string, name: r.name as string, icon: r.icon as string };
}

function toTask(r: Row): Task {
  return {
    id: r.id as string,
    listId: r.list_id as string,
    title: r.title as string,
    note: r.note as string,
    completed: r.completed as boolean,
    completedAt: (r.completed_at as string | null) ?? null,
    createdAt: r.created_at as string,
    dueDate: (r.due_date as string | null) ?? null,
    myDay: r.my_day as boolean,
    important: r.important as boolean,
    steps: (r.steps as Step[] | null) ?? [],
  };
}

function toRoadmap(r: Row): Roadmap {
  return {
    id: r.id as string,
    listId: r.list_id as string,
    // INTEGER comes back as a number, but be explicit rather than trust it.
    target: Number(r.target),
    deadline: r.deadline as string,
    startedAt: r.started_at as string,
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export async function readState(): Promise<AppState> {
  await init();
  const db = sql();
  // Newest task first, matching the old in-memory prepend.
  const [lists, tasks, roadmaps] = await Promise.all([
    db`SELECT * FROM lists ORDER BY seq ASC`,
    db`SELECT * FROM tasks ORDER BY seq DESC`,
    db`SELECT * FROM roadmaps ORDER BY seq ASC`,
  ]);
  return {
    lists: (lists as Row[]).map(toList),
    tasks: (tasks as Row[]).map(toTask),
    roadmaps: (roadmaps as Row[]).map(toRoadmap),
  };
}

export async function readLists(): Promise<TaskList[]> {
  await init();
  const rows = await sql()`SELECT * FROM lists ORDER BY seq ASC`;
  return (rows as Row[]).map(toList);
}

export async function readTasks(): Promise<Task[]> {
  await init();
  const rows = await sql()`SELECT * FROM tasks ORDER BY seq DESC`;
  return (rows as Row[]).map(toTask);
}

export async function listExists(id: string): Promise<boolean> {
  await init();
  const rows = await sql()`SELECT 1 FROM lists WHERE id = ${id}`;
  return (rows as Row[]).length > 0;
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export async function insertTask(task: Task): Promise<Task> {
  await init();
  const rows = await sql()`
    INSERT INTO tasks
      (id, list_id, title, note, completed, completed_at, created_at, due_date,
       my_day, important, steps)
    VALUES
      (${task.id}, ${task.listId}, ${task.title}, ${task.note}, ${task.completed},
       ${task.completedAt}, ${task.createdAt}, ${task.dueDate}, ${task.myDay},
       ${task.important}, ${JSON.stringify(task.steps)}::jsonb)
    RETURNING *
  `;
  return toTask((rows as Row[])[0]);
}

/**
 * Apply a validated patch. Built as a fixed COALESCE update rather than a
 * dynamic column list: every parameter is bound, and an absent field is simply
 * null, which leaves the column alone.
 *
 * The nullable columns need a separate "is this key present" flag, because for
 * them null is a value the caller may legitimately be setting.
 */
export async function updateTask(
  id: string,
  patch: Partial<Task>,
): Promise<Task | null> {
  await init();
  // Every parameter is cast explicitly. Bound values arrive untyped, and a bare
  // NULL inside COALESCE/CASE makes Postgres give up on inferring the type.
  const rows = await sql()`
    UPDATE tasks SET
      list_id      = COALESCE(${patch.listId ?? null}::text, list_id),
      title        = COALESCE(${patch.title ?? null}::text, title),
      note         = COALESCE(${patch.note ?? null}::text, note),
      completed    = COALESCE(${patch.completed ?? null}::boolean, completed),
      my_day       = COALESCE(${patch.myDay ?? null}::boolean, my_day),
      important    = COALESCE(${patch.important ?? null}::boolean, important),
      created_at   = COALESCE(${patch.createdAt ?? null}::text, created_at),
      completed_at = CASE WHEN ${"completedAt" in patch}::boolean
                       THEN ${patch.completedAt ?? null}::text ELSE completed_at END,
      due_date     = CASE WHEN ${"dueDate" in patch}::boolean
                       THEN ${patch.dueDate ?? null}::text ELSE due_date END,
      steps        = COALESCE(${
        patch.steps === undefined ? null : JSON.stringify(patch.steps)
      }::jsonb, steps)
    WHERE id = ${id}
    RETURNING *
  `;
  const found = (rows as Row[])[0];
  return found === undefined ? null : toTask(found);
}

export async function deleteTask(id: string): Promise<boolean> {
  await init();
  const rows = await sql()`DELETE FROM tasks WHERE id = ${id} RETURNING id`;
  return (rows as Row[]).length > 0;
}

export async function insertList(list: TaskList): Promise<TaskList> {
  await init();
  const rows = await sql()`
    INSERT INTO lists (id, name, icon)
    VALUES (${list.id}, ${list.name}, ${list.icon})
    RETURNING *
  `;
  return toList((rows as Row[])[0]);
}

export async function updateList(
  id: string,
  patch: Partial<TaskList>,
): Promise<TaskList | null> {
  await init();
  const rows = await sql()`
    UPDATE lists SET
      name = COALESCE(${patch.name ?? null}, name),
      icon = COALESCE(${patch.icon ?? null}, icon)
    WHERE id = ${id}
    RETURNING *
  `;
  const found = (rows as Row[])[0];
  return found === undefined ? null : toList(found);
}

/** ON DELETE CASCADE takes the list's tasks with it, the same as To Do does. */
export async function deleteList(id: string): Promise<boolean> {
  await init();
  const rows = await sql()`DELETE FROM lists WHERE id = ${id} RETURNING id`;
  return (rows as Row[]).length > 0;
}

export async function readRoadmaps(): Promise<Roadmap[]> {
  await init();
  const rows = await sql()`SELECT * FROM roadmaps ORDER BY seq ASC`;
  return (rows as Row[]).map(toRoadmap);
}

export async function insertRoadmap(r: Roadmap): Promise<Roadmap | null> {
  await init();
  // One roadmap per list, so a second one on the same list is a conflict the
  // caller reports rather than a crash.
  const rows = await sql()`
    INSERT INTO roadmaps (id, list_id, target, deadline, started_at)
    VALUES (${r.id}, ${r.listId}, ${r.target}, ${r.deadline}, ${r.startedAt})
    ON CONFLICT (list_id) DO NOTHING
    RETURNING *
  `;
  const found = (rows as Row[])[0];
  return found === undefined ? null : toRoadmap(found);
}

export async function updateRoadmap(
  id: string,
  patch: Partial<Roadmap>,
): Promise<Roadmap | null> {
  await init();
  const rows = await sql()`
    UPDATE roadmaps SET
      target   = COALESCE(${patch.target ?? null}::integer, target),
      deadline = COALESCE(${patch.deadline ?? null}::text, deadline)
    WHERE id = ${id}
    RETURNING *
  `;
  const found = (rows as Row[])[0];
  return found === undefined ? null : toRoadmap(found);
}

export async function deleteRoadmap(id: string): Promise<boolean> {
  await init();
  const rows = await sql()`DELETE FROM roadmaps WHERE id = ${id} RETURNING id`;
  return (rows as Row[]).length > 0;
}

/** Wipe everything and write the given state back. */
export async function replaceState(state: AppState): Promise<AppState> {
  await init();
  const db = sql();

  // Truncating lists cascades into tasks.
  await db`TRUNCATE lists CASCADE`;

  for (const list of state.lists) {
    await db`
      INSERT INTO lists (id, name, icon) VALUES (${list.id}, ${list.name}, ${list.icon})
    `;
  }
  // Oldest first, so the BIGSERIAL order matches the array's newest-first read.
  for (const task of [...state.tasks].reverse()) {
    await db`
      INSERT INTO tasks
        (id, list_id, title, note, completed, completed_at, created_at, due_date,
         my_day, important, steps)
      VALUES
        (${task.id}, ${task.listId}, ${task.title}, ${task.note}, ${task.completed},
         ${task.completedAt}, ${task.createdAt}, ${task.dueDate}, ${task.myDay},
         ${task.important}, ${JSON.stringify(task.steps)}::jsonb)
    `;
  }
  for (const r of state.roadmaps) {
    await db`
      INSERT INTO roadmaps (id, list_id, target, deadline, started_at)
      VALUES (${r.id}, ${r.listId}, ${r.target}, ${r.deadline}, ${r.startedAt})
    `;
  }
  return readState();
}
