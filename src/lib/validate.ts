import { todayISO } from "./date";
import type { Recurrence, Repeat, Roadmap, Step, Task, TaskList } from "./types";

/* -------------------------------------------------------------------------- */
/* Request body validation                                                     */
/*                                                                             */
/* Request bodies are untrusted, so nothing is spread straight onto a stored    */
/* record. Each field is checked by name; anything unrecognised is dropped.     */
/* -------------------------------------------------------------------------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `undefined` means "invalid" — `null` is a legitimate value for these fields. */
function dateOrNull(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v === "string" && ISO_DATE.test(v)) return v;
  return undefined;
}

function parseSteps(v: unknown): Step[] | null {
  if (!Array.isArray(v)) return null;
  const out: Step[] = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) return null;
    const { id, title, done } = raw as Record<string, unknown>;
    if (typeof id !== "string" || !id) return null;
    if (typeof title !== "string") return null;
    if (typeof done !== "boolean") return null;
    out.push({ id, title, done });
  }
  return out;
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** `undefined` means invalid; `null` means "clear the repeat". */
function parseRepeat(v: unknown): Repeat | null | undefined {
  if (v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) return undefined;
  const r = v as Record<string, unknown>;
  if (r.kind === "daily" || r.kind === "monthly") return { kind: r.kind };
  if (r.kind === "weekdays") {
    if (!Array.isArray(r.days) || r.days.length === 0) return undefined;
    const days = new Set<number>();
    for (const d of r.days) {
      if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) return undefined;
      days.add(d);
    }
    return { kind: "weekdays", days: [...days].sort((a, b) => a - b) };
  }
  return undefined;
}

/** Fields a client may change on a task. Returns null if any is malformed. */
export function parseTaskPatch(body: unknown): Partial<Task> | null {
  const b = asRecord(body);
  if (b === null) return null;
  const patch: Partial<Task> = {};

  if ("title" in b) {
    // Deliberately not trimmed or required here: the detail pane PATCHes on
    // every keystroke, so rejecting "" would revert a cleared field mid-retype
    // and trimming would swallow the space the user just typed.
    if (typeof b.title !== "string") return null;
    patch.title = b.title;
  }
  if ("note" in b) {
    if (typeof b.note !== "string") return null;
    patch.note = b.note;
  }
  if ("listId" in b) {
    if (typeof b.listId !== "string" || !b.listId) return null;
    patch.listId = b.listId;
  }
  for (const key of ["completed", "myDay", "important"] as const) {
    if (key in b) {
      if (typeof b[key] !== "boolean") return null;
      patch[key] = b[key];
    }
  }
  for (const key of ["completedAt", "dueDate"] as const) {
    if (key in b) {
      const d = dateOrNull(b[key]);
      if (d === undefined) return null;
      patch[key] = d;
    }
  }
  if ("createdAt" in b) {
    if (typeof b.createdAt !== "string" || !ISO_DATE.test(b.createdAt)) return null;
    patch.createdAt = b.createdAt;
  }
  if ("steps" in b) {
    const steps = parseSteps(b.steps);
    if (steps === null) return null;
    patch.steps = steps;
  }
  if ("repeat" in b) {
    const rep = parseRepeat(b.repeat);
    if (rep === undefined) return null;
    patch.repeat = rep;
  }
  return patch;
}

let counter = 0;

function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * Build a complete task from a create body. The client sends the id it already
 * applied optimistically, so both sides agree without a round trip.
 */
export function parseNewTask(body: unknown): Task | null {
  const b = asRecord(body);
  if (b === null) return null;
  if (typeof b.title !== "string" || !b.title.trim()) return null;
  if (typeof b.listId !== "string" || !b.listId) return null;

  const patch = parseTaskPatch(body);
  if (patch === null) return null;

  return {
    id: typeof b.id === "string" && b.id ? b.id : makeId("t"),
    listId: b.listId,
    note: "",
    completed: false,
    completedAt: null,
    createdAt: todayISO(),
    dueDate: null,
    myDay: false,
    important: false,
    steps: [],
    repeat: null,
    ...patch,
    // After the spread: a new task always gets a real, trimmed title, even
    // though PATCH allows the field to be blank while it is being edited.
    title: b.title.trim(),
  };
}

export function parseNewList(body: unknown): TaskList | null {
  const b = asRecord(body);
  if (b === null) return null;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  return {
    id: typeof b.id === "string" && b.id ? b.id : makeId("l"),
    name: b.name.trim(),
    icon: typeof b.icon === "string" && b.icon ? b.icon : "📋",
  };
}

function parseTarget(v: unknown): number | null {
  // Reject 0 and negatives outright: they are the denominator of the
  // percentage, so anything below 1 divides by zero or goes negative.
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null;
}

export function parseNewRoadmap(body: unknown, today: string): Roadmap | null {
  const b = asRecord(body);
  if (b === null) return null;
  if (typeof b.listId !== "string" || !b.listId) return null;

  const target = parseTarget(b.target);
  if (target === null) return null;

  if (typeof b.deadline !== "string" || !ISO_DATE.test(b.deadline)) return null;
  // startedAt is always today: progress and pace both begin when the roadmap is
  // switched on, never from the list's older history.
  const startedAt = typeof b.startedAt === "string" && ISO_DATE.test(b.startedAt)
    ? b.startedAt
    : today;
  // A deadline on or before the start makes every pace figure meaningless.
  if (b.deadline <= startedAt) return null;

  return {
    id: typeof b.id === "string" && b.id ? b.id : makeId("r"),
    listId: b.listId,
    target,
    deadline: b.deadline,
    startedAt,
  };
}

export function parseRoadmapPatch(body: unknown): Partial<Roadmap> | null {
  const b = asRecord(body);
  if (b === null) return null;
  const patch: Partial<Roadmap> = {};
  if ("target" in b) {
    const target = parseTarget(b.target);
    if (target === null) return null;
    patch.target = target;
  }
  if ("deadline" in b) {
    if (typeof b.deadline !== "string" || !ISO_DATE.test(b.deadline)) return null;
    patch.deadline = b.deadline;
  }
  return patch;
}

/** Monday-first weekday indices, deduped and sorted. */
function parseWeekdays(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out = new Set<number>();
  for (const x of v) {
    if (typeof x !== "number" || !Number.isInteger(x) || x < 0 || x > 6) return null;
    out.add(x);
  }
  return [...out].sort((a, b) => a - b);
}

export function parseNewRecurrence(
  body: unknown,
  today: string,
): Recurrence | null {
  const b = asRecord(body);
  if (b === null) return null;
  if (typeof b.listId !== "string" || !b.listId) return null;
  if (typeof b.title !== "string" || !b.title.trim()) return null;

  const weekdays = parseWeekdays(b.weekdays);
  if (weekdays === null) return null;

  const startsOn =
    typeof b.startsOn === "string" && ISO_DATE.test(b.startsOn) ? b.startsOn : today;

  let endsOn: string | null = null;
  if (b.endsOn !== undefined && b.endsOn !== null) {
    if (typeof b.endsOn !== "string" || !ISO_DATE.test(b.endsOn)) return null;
    // An end before the start would generate nothing — reject rather than
    // silently create a rule that can never fire.
    if (b.endsOn < startsOn) return null;
    endsOn = b.endsOn;
  }

  return {
    id: typeof b.id === "string" && b.id ? b.id : makeId("rr"),
    listId: b.listId,
    title: b.title.trim(),
    weekdays,
    startsOn,
    endsOn,
    lastGeneratedOn: null,
  };
}

export function parseRecurrencePatch(body: unknown): Partial<Recurrence> | null {
  const b = asRecord(body);
  if (b === null) return null;
  const patch: Partial<Recurrence> = {};
  if ("title" in b) {
    if (typeof b.title !== "string" || !b.title.trim()) return null;
    patch.title = b.title.trim();
  }
  if ("weekdays" in b) {
    const w = parseWeekdays(b.weekdays);
    if (w === null) return null;
    patch.weekdays = w;
  }
  if ("startsOn" in b) {
    if (typeof b.startsOn !== "string" || !ISO_DATE.test(b.startsOn)) return null;
    patch.startsOn = b.startsOn;
  }
  if ("endsOn" in b) {
    if (b.endsOn === null) patch.endsOn = null;
    else if (typeof b.endsOn === "string" && ISO_DATE.test(b.endsOn)) patch.endsOn = b.endsOn;
    else return null;
  }
  return patch;
}

export function parseListPatch(body: unknown): Partial<TaskList> | null {
  const b = asRecord(body);
  if (b === null) return null;
  const patch: Partial<TaskList> = {};
  if ("name" in b) {
    if (typeof b.name !== "string" || !b.name.trim()) return null;
    patch.name = b.name.trim();
  }
  if ("icon" in b) {
    if (typeof b.icon !== "string" || !b.icon) return null;
    patch.icon = b.icon;
  }
  return patch;
}
