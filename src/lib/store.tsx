"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { todayISO } from "./date";
import { buildSeed } from "./seed";
import type { AppState, Step, Task, TaskList } from "./types";

const STORAGE_KEY = "mstodo.state.v1";

/* -------------------------------------------------------------------------- */
/* External store                                                              */
/*                                                                             */
/* localStorage is an external system, so it is read through                    */
/* useSyncExternalStore rather than an effect that calls setState. That keeps    */
/* the server render and the hydration render in agreement without a cascading   */
/* second render, and it lets two open tabs stay in sync for free.              */
/* -------------------------------------------------------------------------- */

const EMPTY: AppState = { lists: [], tasks: [] };

let cache: AppState | null = null;
const listeners = new Set<() => void>();

function isValid(state: unknown): state is AppState {
  if (typeof state !== "object" || state === null) return false;
  const s = state as AppState;
  return Array.isArray(s.lists) && Array.isArray(s.tasks);
}

function load(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isValid(parsed) ? parsed : buildSeed();
  } catch {
    // Corrupt JSON, or storage blocked in private mode — start fresh rather
    // than leaving the app with nothing to render.
    return buildSeed();
  }
}

function getSnapshot(): AppState {
  if (cache === null) cache = load();
  return cache;
}

function getServerSnapshot(): AppState {
  return EMPTY;
}

function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== STORAGE_KEY) return;
  cache = load();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function commit(next: AppState) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Over quota — the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

function update(fn: (s: AppState) => AppState) {
  commit(fn(getSnapshot()));
}

function mapTask(id: string, fn: (t: Task) => Task) {
  update((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? fn(t) : t)) }));
}

function makeId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* -------------------------------------------------------------------------- */
/* Actions — plain functions; none of them need React.                          */
/* -------------------------------------------------------------------------- */

const actions = {
  addTask(listId: string, title: string, opts?: Partial<Task>) {
    update((s) => ({
      ...s,
      tasks: [
        {
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
          ...opts,
        },
        ...s.tasks,
      ],
    }));
  },

  toggleTask(id: string) {
    mapTask(id, (t) => ({
      ...t,
      completed: !t.completed,
      completedAt: t.completed ? null : todayISO(),
    }));
  },

  updateTask(id: string, patch: Partial<Task>) {
    mapTask(id, (t) => ({ ...t, ...patch }));
  },

  deleteTask(id: string) {
    update((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  },

  addStep(taskId: string, title: string) {
    mapTask(taskId, (t) => ({
      ...t,
      steps: [...t.steps, { id: makeId("s"), title, done: false }],
    }));
  },

  toggleStep(taskId: string, stepId: string) {
    mapTask(taskId, (t) => ({
      ...t,
      steps: t.steps.map((s: Step) =>
        s.id === stepId ? { ...s, done: !s.done } : s,
      ),
    }));
  },

  deleteStep(taskId: string, stepId: string) {
    mapTask(taskId, (t) => ({
      ...t,
      steps: t.steps.filter((s) => s.id !== stepId),
    }));
  },

  addList(name: string): string {
    const list: TaskList = { id: makeId("l"), name, icon: "📋" };
    update((s) => ({ ...s, lists: [...s.lists, list] }));
    return list.id;
  },

  renameList(id: string, name: string) {
    update((s) => ({
      ...s,
      lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)),
    }));
  },

  /** Deleting a list takes its tasks with it, the same as To Do does. */
  deleteList(id: string) {
    update((s) => ({
      lists: s.lists.filter((l) => l.id !== id),
      tasks: s.tasks.filter((t) => t.listId !== id),
    }));
  },

  resetAll() {
    commit(buildSeed());
  },
};

/* -------------------------------------------------------------------------- */
/* React binding                                                               */
/* -------------------------------------------------------------------------- */

type StoreValue = AppState & typeof actions & { ready: boolean };

const StoreContext = createContext<StoreValue | null>(null);

// Constant per environment, so this never loops: false while the server HTML
// is being matched, true once the client owns the tree.
const clientReady = () => true;
const serverReady = () => false;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);

  const value = useMemo<StoreValue>(
    () => ({ ...state, ...actions, ready }),
    [state, ready],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
