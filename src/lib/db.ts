import { neon } from "@neondatabase/serverless";
import { addDays, daysBetween, fromISO, mondayIndex, toISO } from "./date";
import { LISTS } from "./seed";
import type { AppState, Recurrence, Repeat, Roadmap, Step, Task, TaskList } from "./types";

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
  return { lists: LISTS.map((l) => ({ ...l })), tasks: [], roadmaps: [], recurrences: [] };
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
  // Added after the table shipped, so it has to be an ALTER rather than part of
  // the CREATE above — an existing database never re-runs that.
  await db`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS my_day_set_on TEXT`;
  await db`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat JSONB`;

  await db`
    CREATE TABLE IF NOT EXISTS recurrences (
      id                TEXT PRIMARY KEY,
      list_id           TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title             TEXT NOT NULL,
      weekdays          JSONB NOT NULL,
      starts_on         TEXT NOT NULL,
      ends_on           TEXT,
      last_generated_on TEXT,
      seq               BIGSERIAL
    )
  `;

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
    repeat: (r.repeat as Repeat | null) ?? null,
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

function toRecurrence(r: Row): Recurrence {
  return {
    id: r.id as string,
    listId: r.list_id as string,
    title: r.title as string,
    weekdays: (r.weekdays as number[] | null) ?? [],
    startsOn: r.starts_on as string,
    endsOn: (r.ends_on as string | null) ?? null,
    lastGeneratedOn: (r.last_generated_on as string | null) ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export async function readState(): Promise<AppState> {
  await init();
  const db = sql();
  // Newest task first, matching the old in-memory prepend.
  const [lists, tasks, roadmaps, recurrences] = await Promise.all([
    db`SELECT * FROM lists ORDER BY seq ASC`,
    db`SELECT * FROM tasks ORDER BY seq DESC`,
    db`SELECT * FROM roadmaps ORDER BY seq ASC`,
    db`SELECT * FROM recurrences ORDER BY seq ASC`,
  ]);
  return {
    lists: (lists as Row[]).map(toList),
    tasks: (tasks as Row[]).map(toTask),
    roadmaps: (roadmaps as Row[]).map(toRoadmap),
    recurrences: (recurrences as Row[]).map(toRecurrence),
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
       my_day, important, steps, repeat)
    VALUES
      (${task.id}, ${task.listId}, ${task.title}, ${task.note}, ${task.completed},
       ${task.completedAt}, ${task.createdAt}, ${task.dueDate}, ${task.myDay},
       ${task.important}, ${JSON.stringify(task.steps)}::jsonb,
       ${task.repeat === null ? null : JSON.stringify(task.repeat)}::jsonb)
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
      }::jsonb, steps),
      repeat       = CASE WHEN ${"repeat" in patch}::boolean
                       THEN ${
                         patch.repeat == null ? null : JSON.stringify(patch.repeat)
                       }::jsonb ELSE repeat END
    WHERE id = ${id}
    RETURNING *
  `;
  const found = (rows as Row[])[0];
  return found === undefined ? null : toTask(found);
}

export async function readTask(id: string): Promise<Task | null> {
  await init();
  const rows = await sql()`SELECT * FROM tasks WHERE id = ${id}`;
  const found = (rows as Row[])[0];
  return found === undefined ? null : toTask(found);
}

/** The first date strictly after `from` that the rule allows. */
export function nextOccurrence(repeat: Repeat, from: string): string {
  if (repeat.kind === "daily") return addDays(from, 1);
  if (repeat.kind === "weekly") return addDays(from, 7);
  if (repeat.kind === "monthly") {
    const d = fromISO(from);
    const day = d.getDate();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    // Clamp: the 31st of a 30-day month lands on the last day, not the 1st of
    // the month after.
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
    return toISO(next);
  }
  // Before the dedicated "weekly" kind, "Weekly" was stored as a single
  // weekday. Honour those legacy rules as the same 7-day cadence.
  if (repeat.days.length === 1) return addDays(from, 7);
  if (repeat.days.length === 0) return addDays(from, 1);
  for (let i = 1; i <= 7; i++) {
    const candidate = addDays(from, i);
    if (repeat.days.includes(mondayIndex(fromISO(candidate)))) return candidate;
  }
  return addDays(from, 7);
}

/**
 * Tick a repeating task and the next one appears — the To Do behaviour.
 *
 * The rule moves to the new occurrence and is cleared from the finished task,
 * so un-ticking and re-ticking the same task can't spawn a second copy.
 */
export async function spawnNextOccurrence(
  task: Task,
  today: string,
): Promise<Task | null> {
  if (task.repeat === null) return null;
  await init();

  const base = task.dueDate ?? today;
  const next: Task = {
    ...task,
    id: `${task.id}~${nextOccurrence(task.repeat, base)}`,
    completed: false,
    completedAt: null,
    createdAt: today,
    dueDate: nextOccurrence(task.repeat, base),
    myDay: false,
    // Steps come along, but unticked — it is the same checklist done again.
    steps: task.steps.map((s) => ({ ...s, done: false })),
  };

  const rows = await sql()`
    INSERT INTO tasks
      (id, list_id, title, note, completed, completed_at, created_at, due_date,
       my_day, important, steps, repeat)
    VALUES
      (${next.id}, ${next.listId}, ${next.title}, ${next.note}, FALSE, NULL,
       ${next.createdAt}, ${next.dueDate}, FALSE, ${next.important},
       ${JSON.stringify(next.steps)}::jsonb, ${JSON.stringify(task.repeat)}::jsonb)
    ON CONFLICT (id) DO NOTHING
    RETURNING *
  `;
  const created = (rows as Row[])[0];
  if (created === undefined) return null;

  await sql()`UPDATE tasks SET repeat = NULL WHERE id = ${task.id}`;
  return toTask(created);
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

/* -------------------------------------------------------------------------- */
/* Recurring tasks                                                             */
/* -------------------------------------------------------------------------- */

export async function readRecurrences(): Promise<Recurrence[]> {
  await init();
  const rows = await sql()`SELECT * FROM recurrences ORDER BY seq ASC`;
  return (rows as Row[]).map(toRecurrence);
}

export async function insertRecurrence(r: Recurrence): Promise<Recurrence> {
  await init();
  const rows = await sql()`
    INSERT INTO recurrences (id, list_id, title, weekdays, starts_on, ends_on, last_generated_on)
    VALUES (${r.id}, ${r.listId}, ${r.title}, ${JSON.stringify(r.weekdays)}::jsonb,
            ${r.startsOn}, ${r.endsOn}, ${r.lastGeneratedOn})
    RETURNING *
  `;
  return toRecurrence((rows as Row[])[0]);
}

export async function updateRecurrence(
  id: string,
  patch: Partial<Recurrence>,
): Promise<Recurrence | null> {
  await init();
  const rows = await sql()`
    UPDATE recurrences SET
      title     = COALESCE(${patch.title ?? null}::text, title),
      weekdays  = COALESCE(${
        patch.weekdays === undefined ? null : JSON.stringify(patch.weekdays)
      }::jsonb, weekdays),
      starts_on = COALESCE(${patch.startsOn ?? null}::text, starts_on),
      ends_on   = CASE WHEN ${"endsOn" in patch}::boolean
                    THEN ${patch.endsOn ?? null}::text ELSE ends_on END
    WHERE id = ${id}
    RETURNING *
  `;
  const found = (rows as Row[])[0];
  return found === undefined ? null : toRecurrence(found);
}

export async function deleteRecurrence(id: string): Promise<boolean> {
  await init();
  const rows = await sql()`DELETE FROM recurrences WHERE id = ${id} RETURNING id`;
  return (rows as Row[]).length > 0;
}

// A generated task is never regenerated. Each rule remembers the furthest date
// it has covered and only ever moves forward from there — so deleting a task
// the rule created is permanent, instead of it reappearing on the next load.
// The cap is a backstop: a rule dated far in the past must not spin here.
const MAX_GENERATED_PER_RUN = 400;

export async function generateRecurringTasks(
  today: string,
  lookaheadDays = 7,
): Promise<number> {
  await init();
  const db = sql();
  const rules = await readRecurrences();
  const horizon = addDays(today, lookaheadDays);
  let created = 0;

  for (const r of rules) {
    if (r.weekdays.length === 0) continue;

    let from = r.lastGeneratedOn === null ? r.startsOn : addDays(r.lastGeneratedOn, 1);
    if (daysBetween(from, r.startsOn) > 0) from = r.startsOn;

    let to = horizon;
    if (r.endsOn !== null && daysBetween(r.endsOn, to) > 0) to = r.endsOn;
    if (daysBetween(from, to) < 0) continue;

    const rows: { id: string; date: string }[] = [];
    let day = from;
    for (let i = 0; daysBetween(day, to) >= 0 && i <= MAX_GENERATED_PER_RUN; i++) {
      if (r.weekdays.includes(mondayIndex(fromISO(day)))) {
        rows.push({ id: `${r.id}-${day}`, date: day });
      }
      day = addDays(day, 1);
    }

    for (const row of rows) {
      // The id is derived from rule + date, so a concurrent second generator
      // collides instead of duplicating the day's task.
      const isToday = row.date === today;
      const res = await db`
        INSERT INTO tasks (id, list_id, title, created_at, due_date, my_day, my_day_set_on)
        VALUES (${row.id}, ${r.listId}, ${r.title}, ${today}, ${row.date},
                ${isToday}, ${isToday ? today : null})
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if ((res as Row[]).length > 0) created++;
    }

    await db`UPDATE recurrences SET last_generated_on = ${to} WHERE id = ${r.id}`;
  }
  return created;
}

/**
 * Anything due today belongs in My Day.
 *
 * Tasks are generated up to a week ahead, so being marked at creation is not
 * enough — a task made on Monday for Friday has to be pulled in when Friday
 * arrives. `my_day_set_on` records the day this ran for a given task, so it
 * fires once per task per day: taking something back out of My Day sticks for
 * the rest of that day instead of being undone on the next page load.
 */
export async function promoteTodayToMyDay(today: string): Promise<number> {
  await init();
  const rows = await sql()`
    UPDATE tasks
       SET my_day = TRUE, my_day_set_on = ${today}
     WHERE due_date = ${today}
       AND completed = FALSE
       AND (my_day_set_on IS NULL OR my_day_set_on <> ${today})
    RETURNING id
  `;
  return (rows as Row[]).length;
}

/** Wipe everything and write the given state back. */
export async function replaceState(state: AppState): Promise<AppState> {
  await init();
  const db = sql();

  // Truncating lists cascades into tasks.
  // Cascades into tasks, roadmaps and recurrences.
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
         my_day, important, steps, repeat)
      VALUES
        (${task.id}, ${task.listId}, ${task.title}, ${task.note}, ${task.completed},
         ${task.completedAt}, ${task.createdAt}, ${task.dueDate}, ${task.myDay},
         ${task.important}, ${JSON.stringify(task.steps)}::jsonb,
         ${task.repeat === null ? null : JSON.stringify(task.repeat)}::jsonb)
    `;
  }
  for (const r of state.roadmaps) {
    await db`
      INSERT INTO roadmaps (id, list_id, target, deadline, started_at)
      VALUES (${r.id}, ${r.listId}, ${r.target}, ${r.deadline}, ${r.startedAt})
    `;
  }
  for (const r of state.recurrences) {
    await db`
      INSERT INTO recurrences (id, list_id, title, weekdays, starts_on, ends_on, last_generated_on)
      VALUES (${r.id}, ${r.listId}, ${r.title}, ${JSON.stringify(r.weekdays)}::jsonb,
              ${r.startsOn}, ${r.endsOn}, ${r.lastGeneratedOn})
    `;
  }
  return readState();
}
