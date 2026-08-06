"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { todayISO } from "./date";
import type { AppState, Recurrence, Roadmap, Step, Task, TaskList } from "./types";

/* -------------------------------------------------------------------------- */
/* External store, backed by the API                                           */
/*                                                                             */
/* State lives on the server now (data/db.json). The client keeps a mirror and  */
/* applies every change locally first, then sends it — a to-do list should      */
/* never feel like it is waiting on a network. If a write fails, we refetch      */
/* rather than try to unpick the optimistic edit, so the mirror can't drift.    */
/*                                                                             */
/* Actions stay synchronous and ids are minted client-side, which keeps every    */
/* calling component unchanged from the localStorage version.                   */
/* -------------------------------------------------------------------------- */

const LEGACY_STORAGE_KEY = "mstodo.state.v1";

const EMPTY: AppState = { lists: [], tasks: [], roadmaps: [], recurrences: [] };

let cache: AppState = EMPTY;
let ready = false;
let booted = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(next: AppState) {
  cache = next;
  emit();
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} /api${path} → ${res.status}`);
  }
  return res;
}

async function refresh(): Promise<void> {
  const state = (await (await api("/state")).json()) as AppState;
  ready = true;
  setState(state);
}

/** Fire a write; on failure fall back to whatever the server actually has. */
function send(work: Promise<unknown>) {
  work.catch((err: unknown) => {
    console.error("[store] write failed, resyncing", err);
    void refresh().catch(() => undefined);
  });
}

/* -------------------------------------------------------------------------- */
/* Day rollover                                                                */
/*                                                                             */
/* My Day, Overdue and every "Today" label are answers to "what day is it",     */
/* and the server only works that out while serving `/api/state`. Since that is */
/* fetched on boot, a tab left open overnight kept showing yesterday's My Day —  */
/* nothing due today ever moved into it — until someone reloaded by hand.       */
/*                                                                             */
/* So watch the clock and refetch on the tick where the date actually changes.  */
/* The refetch is what makes the server run its sweeps, and the new snapshot    */
/* re-renders everything that reads `todayISO()` at render time.                */
/* -------------------------------------------------------------------------- */

const DAY_CHECK_MS = 60_000;

let currentDay = "";

function checkDayRollover() {
  const today = todayISO();
  if (today === currentDay) return;
  currentDay = today;
  refresh().catch((err: unknown) => {
    console.error("[store] day rollover resync failed", err);
  });
}

function boot() {
  if (booted) return;
  booted = true;

  // Data moved to the server; the old browser copy is dead weight that would
  // only confuse anyone who goes looking in devtools.
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage blocked — nothing to clean up.
  }

  currentDay = todayISO();
  refresh().catch((err: unknown) => {
    console.error("[store] initial load failed", err);
    // Let the UI render empty instead of hanging on the loading state forever.
    ready = true;
    emit();
  });

  window.setInterval(checkDayRollover, DAY_CHECK_MS);
  // A background tab has its timers throttled and a sleeping laptop has none at
  // all, so the minute tick can be hours late. Coming back to the tab is the
  // moment the date on screen has to be right, so check then as well.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkDayRollover();
  });
  window.addEventListener("focus", checkDayRollover);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  boot();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => cache;
const getServerSnapshot = () => EMPTY;
const getReady = () => ready;
const getServerReady = () => false;

function mapTask(id: string, fn: (t: Task) => Task) {
  setState({ ...cache, tasks: cache.tasks.map((t) => (t.id === id ? fn(t) : t)) });
}

/**
 * Local edit + PATCH, the shape almost every task action takes.
 *
 * Completing a repeating task, or scheduling a repeat onto a finished one,
 * spawns the next occurrence server-side — a row the optimistic mirror can't
 * predict. Pass `resyncAfter` for those writes so fresh state is pulled once
 * the PATCH lands, and the new task shows up without a manual reload.
 */
function patchTask(id: string, patch: Partial<Task>, resyncAfter = false) {
  mapTask(id, (t) => ({ ...t, ...patch }));
  const work = api(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  send(resyncAfter ? work.then(() => refresh()) : work);
}

function withSteps(taskId: string, fn: (steps: Step[]) => Step[]) {
  const task = cache.tasks.find((t) => t.id === taskId);
  if (task === undefined) return;
  patchTask(taskId, { steps: fn(task.steps) });
}

function makeId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* -------------------------------------------------------------------------- */
/* Actions — plain functions; none of them need React.                          */
/* -------------------------------------------------------------------------- */

const actions = {
  addTask(listId: string, title: string, opts?: Partial<Task>) {
    const task: Task = {
      id: makeId("t"),
      listId,
      title,
      note: "",
      completed: false,
      completedAt: null,
      createdAt: todayISO(),
      dueDate: null,
      myDay: false,
      important: false,
      steps: [],
      repeat: null,
      ...opts,
    };
    setState({ ...cache, tasks: [task, ...cache.tasks] });
    const work = api("/tasks", { method: "POST", body: JSON.stringify(task) });
    // A task dated today is put into My Day server-side. Only the server knows
    // whether that applies, so pull the answer back rather than guess at it.
    send(task.dueDate === todayISO() ? work.then(() => refresh()) : work);
  },

  toggleTask(id: string) {
    const task = cache.tasks.find((t) => t.id === id);
    if (task === undefined) return;
    const completing = !task.completed;
    patchTask(
      id,
      { completed: completing, completedAt: completing ? todayISO() : null },
      // Ticking a repeating task off spawns its next occurrence.
      completing && task.repeat !== null,
    );
  },

  updateTask(id: string, patch: Partial<Task>) {
    const task = cache.tasks.find((t) => t.id === id);
    // A repeat landing on a finished task spawns its next occurrence.
    const maySpawn =
      patch.repeat !== undefined && patch.repeat !== null && task?.completed === true;
    // Moving a task to today's date can put it into My Day, a decision made
    // server-side off `my_day_set_on` — which the mirror does not carry.
    const mayJoinMyDay = patch.myDay === undefined && patch.dueDate === todayISO();
    patchTask(id, patch, maySpawn || mayJoinMyDay);
  },

  deleteTask(id: string) {
    setState({ ...cache, tasks: cache.tasks.filter((t) => t.id !== id) });
    send(api(`/tasks/${id}`, { method: "DELETE" }));
  },

  addStep(taskId: string, title: string) {
    withSteps(taskId, (steps) => [...steps, { id: makeId("s"), title, done: false }]);
  },

  toggleStep(taskId: string, stepId: string) {
    withSteps(taskId, (steps) =>
      steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)),
    );
  },

  renameStep(taskId: string, stepId: string, title: string) {
    withSteps(taskId, (steps) =>
      steps.map((s) => (s.id === stepId ? { ...s, title } : s)),
    );
  },

  deleteStep(taskId: string, stepId: string) {
    withSteps(taskId, (steps) => steps.filter((s) => s.id !== stepId));
  },

  addList(name: string): string {
    const list: TaskList = { id: makeId("l"), name, icon: "📋" };
    setState({ ...cache, lists: [...cache.lists, list] });
    send(api("/lists", { method: "POST", body: JSON.stringify(list) }));
    return list.id;
  },

  renameList(id: string, name: string) {
    setState({
      ...cache,
      lists: cache.lists.map((l) => (l.id === id ? { ...l, name } : l)),
    });
    send(api(`/lists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }));
  },

  /** Deleting a list takes its tasks with it, the same as To Do does. */
  deleteList(id: string) {
    setState({
      lists: cache.lists.filter((l) => l.id !== id),
      tasks: cache.tasks.filter((t) => t.listId !== id),
      // Mirrors ON DELETE CASCADE, so the optimistic view matches the server.
      roadmaps: cache.roadmaps.filter((r) => r.listId !== id),
      recurrences: cache.recurrences.filter((r) => r.listId !== id),
    });
    send(api(`/lists/${id}`, { method: "DELETE" }));
  },

  addRoadmap(listId: string, target: number, deadline: string): string {
    const roadmap: Roadmap = {
      id: makeId("r"),
      listId,
      target,
      deadline,
      startedAt: todayISO(),
    };
    setState({ ...cache, roadmaps: [...cache.roadmaps, roadmap] });
    send(api("/roadmaps", { method: "POST", body: JSON.stringify(roadmap) }));
    return roadmap.id;
  },

  updateRoadmap(id: string, patch: Partial<Pick<Roadmap, "target" | "deadline">>) {
    setState({
      ...cache,
      roadmaps: cache.roadmaps.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
    send(api(`/roadmaps/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
  },

  deleteRoadmap(id: string) {
    setState({ ...cache, roadmaps: cache.roadmaps.filter((r) => r.id !== id) });
    send(api(`/roadmaps/${id}`, { method: "DELETE" }));
  },

  addRecurrence(
    listId: string,
    title: string,
    weekdays: number[],
    startsOn: string,
    endsOn: string | null,
  ): string {
    const rule: Recurrence = {
      id: makeId("rr"),
      listId,
      title,
      weekdays,
      startsOn,
      endsOn,
      lastGeneratedOn: null,
    };
    setState({ ...cache, recurrences: [...cache.recurrences, rule] });
    // Refetch after the write: the server generates tasks from the new rule,
    // and the optimistic cache has no way to know which ones.
    send(api("/recurrences", { method: "POST", body: JSON.stringify(rule) }).then(refresh));
    return rule.id;
  },

  deleteRecurrence(id: string) {
    setState({ ...cache, recurrences: cache.recurrences.filter((r) => r.id !== id) });
    send(api(`/recurrences/${id}`, { method: "DELETE" }));
  },

  /** Back to the default lists with no tasks. */
  resetAll() {
    send(api("/reset", { method: "POST" }).then(refresh));
  },
};

/* -------------------------------------------------------------------------- */
/* React binding                                                               */
/* -------------------------------------------------------------------------- */

type StoreValue = AppState & typeof actions & { ready: boolean };

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isReady = useSyncExternalStore(subscribe, getReady, getServerReady);

  const value = useMemo<StoreValue>(
    () => ({ ...state, ...actions, ready: isReady }),
    [state, isReady],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
