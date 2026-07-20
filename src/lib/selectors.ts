import { addDays, daysBetween, fromISO, isOverdue, mondayIndex, todayISO, toISO } from "./date";
import type { AppState, Task, TaskList, ViewId } from "./types";

/* -------------------------------------------------------------------------- */
/* Views                                                                       */
/* -------------------------------------------------------------------------- */

export const SMART_LISTS = [
  { id: "myday", name: "My Day", icon: "☀️" },
  { id: "important", name: "Important", icon: "⭐" },
  { id: "planned", name: "Planned", icon: "🗓️" },
  { id: "all", name: "All", icon: "🗂️" },
  { id: "completed", name: "Completed", icon: "✅" },
] as const;

export function viewTasks(state: AppState, view: ViewId): Task[] {
  const { tasks } = state;
  switch (view) {
    case "myday":
      return tasks.filter((t) => t.myDay);
    case "important":
      return tasks.filter((t) => t.important);
    case "planned":
      return tasks.filter((t) => t.dueDate !== null && !t.completed);
    case "all":
      return tasks.filter((t) => !t.completed);
    case "completed":
      return tasks.filter((t) => t.completed);
    default:
      return tasks.filter((t) => t.listId === view);
  }
}

export function viewMeta(view: ViewId, lists: TaskList[]) {
  const smart = SMART_LISTS.find((s) => s.id === view);
  if (smart) return { name: smart.name, icon: smart.icon, isSmart: true };
  const list = lists.find((l) => l.id === view);
  return { name: list?.name ?? "Tasks", icon: list?.icon ?? "📋", isSmart: false };
}

/** The list a task belongs to, for the secondary line on a task row. */
export function listName(lists: TaskList[], listId: string): string {
  return lists.find((l) => l.id === listId)?.name ?? "Tasks";
}

/** Open tasks first, then completed. Overdue floats to the top of the open set. */
export function sortTasks(tasks: Task[], today = todayISO()): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ao = isOverdue(a.dueDate, today) ? 0 : 1;
    const bo = isOverdue(b.dueDate, today) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (a.important !== b.important) return a.important ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/* -------------------------------------------------------------------------- */
/* Dashboard: tasks by list                                                    */
/* -------------------------------------------------------------------------- */

export interface ListCount {
  listId: string;
  name: string;
  icon: string;
  open: number;
  done: number;
  total: number;
}

export function tasksByList(state: AppState): ListCount[] {
  return state.lists
    .map((l) => {
      const mine = state.tasks.filter((t) => t.listId === l.id);
      const done = mine.filter((t) => t.completed).length;
      return {
        listId: l.id,
        name: l.name,
        icon: l.icon,
        open: mine.length - done,
        done,
        total: mine.length,
      };
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

/* -------------------------------------------------------------------------- */
/* Dashboard: completion history, streaks, heatmap grid                        */
/* -------------------------------------------------------------------------- */

export function completionsByDay(tasks: Task[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tasks) {
    if (!t.completed || !t.completedAt) continue;
    map.set(t.completedAt, (map.get(t.completedAt) ?? 0) + 1);
  }
  return map;
}

export interface StreakInfo {
  current: number;
  longest: number;
  activeDays: number;
  totalCompleted: number;
}

/**
 * A streak is unbroken days with at least one completion. Today counts, but a
 * blank today does not end the run — you may simply not have finished anything
 * yet, so the count is allowed to start at yesterday.
 */
export function streakInfo(
  byDay: Map<string, number>,
  today = todayISO(),
): StreakInfo {
  let current = 0;
  const startOffset = byDay.has(today) ? 0 : 1;
  for (let i = startOffset; ; i++) {
    const day = addDays(today, -i);
    if (!byDay.has(day)) break;
    current++;
  }

  const days = [...byDay.keys()].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev !== null && daysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }

  let totalCompleted = 0;
  for (const n of byDay.values()) totalCompleted += n;

  return { current, longest, activeDays: byDay.size, totalCompleted };
}

export interface HeatCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  /** Days after today — rendered as an empty placeholder, not a zero cell. */
  future: boolean;
}

export interface HeatGrid {
  weeks: HeatCell[][];
  /** Column index -> month label, only where the month changes. */
  monthLabels: { col: number; label: string }[];
  max: number;
  weekCount: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A Monday-first grid of `weeks` columns ending with the current week. Levels
 * are scaled to the busiest day so the ramp uses its full range on any dataset.
 */
export function heatGrid(
  byDay: Map<string, number>,
  weeks = 53,
  today = todayISO(),
): HeatGrid {
  const todayDate = fromISO(today);
  // Walk back to the Monday of the current week, then back `weeks - 1` weeks.
  const startDate = new Date(todayDate);
  startDate.setDate(startDate.getDate() - mondayIndex(todayDate) - (weeks - 1) * 7);
  const start = toISO(startDate);

  let max = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const c = byDay.get(addDays(start, i)) ?? 0;
    if (c > max) max = c;
  }

  const grid: HeatCell[][] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;

  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const count = byDay.get(date) ?? 0;
      col.push({
        date,
        count,
        level: count === 0 || max === 0 ? 0 : (Math.min(4, Math.ceil((count / max) * 4)) as 1 | 2 | 3 | 4),
        future: daysBetween(today, date) > 0,
      });
    }
    grid.push(col);

    // Label a column when its Monday opens a new month — but never so close to
    // the previous label that the two collide.
    const month = fromISO(col[0].date).getMonth();
    if (month !== lastMonth) {
      const prev = monthLabels[monthLabels.length - 1];
      if (!prev || w - prev.col >= 3) monthLabels.push({ col: w, label: MONTHS[month] });
      lastMonth = month;
    }
  }

  return { weeks: grid, monthLabels, max, weekCount: weeks };
}
