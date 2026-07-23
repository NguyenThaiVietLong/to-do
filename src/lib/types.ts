export interface Step {
  id: string;
  title: string;
  done: boolean;
}

/**
 * How a task repeats. Completion-driven, the way To Do itself works: ticking a
 * repeating task spawns the next occurrence rather than a scheduler filling the
 * calendar in advance. Skip a day and the chain waits for you.
 */
export type Repeat =
  | { kind: "daily" }
  /** Monday-first weekday indices (0 = Mon … 6 = Sun). */
  | { kind: "weekdays"; days: number[] }
  /** A plain 7-day cadence from the anchor — the due date, or the completion
   *  date if the task has none. */
  | { kind: "weekly" }
  | { kind: "monthly" };

export interface Task {
  id: string;
  listId: string;
  repeat: Repeat | null;
  title: string;
  note: string;
  completed: boolean;
  /** Local date (YYYY-MM-DD) the task was ticked off. Drives the streak heatmap. */
  completedAt: string | null;
  createdAt: string;
  dueDate: string | null;
  myDay: boolean;
  important: boolean;
  steps: Step[];
}

export interface TaskList {
  id: string;
  name: string;
  /** Emoji shown next to the list name in the sidebar. */
  icon: string;
}

export type SmartListId =
  | "myday"
  | "important"
  | "planned"
  | "all"
  | "completed";

export type ViewId = SmartListId | string;

export interface Roadmap {
  id: string;
  /** The list whose completions count towards this target. One per list. */
  listId: string;
  /** How many completed tasks count as done. Fixed, so adding a task to the
   *  list never drags the percentage backwards. */
  target: number;
  deadline: string;
  /** Set when the roadmap is switched on. Progress and pace both start here,
   *  so a list with months of history still opens at 0% and day zero. */
  startedAt: string;
}

export interface Recurrence {
  id: string;
  listId: string;
  /** Title given to every task this rule creates. */
  title: string;
  /** Monday-first weekday indices (0 = Mon … 6 = Sun). */
  weekdays: number[];
  startsOn: string;
  /** null = runs forever. */
  endsOn: string | null;
  /**
   * The furthest date already generated. Generation only ever moves forward
   * from here, so deleting a generated task does not bring it back.
   */
  lastGeneratedOn: string | null;
}

export interface AppState {
  lists: TaskList[];
  tasks: Task[];
  roadmaps: Roadmap[];
  recurrences: Recurrence[];
}
