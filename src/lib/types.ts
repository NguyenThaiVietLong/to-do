export interface Step {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  listId: string;
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

export interface AppState {
  lists: TaskList[];
  tasks: Task[];
}
