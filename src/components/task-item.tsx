"use client";

import { CalendarDays, FileText, Star, Sun } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatDue, isOverdue } from "@/lib/date";
import type { Task } from "@/lib/types";

interface Props {
  task: Task;
  listLabel: string;
  /** Hide the list name when the view is already a single list. */
  showList: boolean;
  /** Hide the "My Day" chip inside My Day, where it is true of every row. */
  showMyDay: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onToggleImportant: () => void;
}

export function TaskItem({
  task,
  listLabel,
  showList,
  showMyDay,
  selected,
  onSelect,
  onToggle,
  onToggleImportant,
}: Props) {
  const doneSteps = task.steps.filter((s) => s.done).length;
  const overdue = !task.completed && isOverdue(task.dueDate);

  const meta: React.ReactNode[] = [];
  if (showList) meta.push(<span key="list">{listLabel}</span>);
  if (task.myDay && showMyDay)
    meta.push(
      <span key="myday" className="inline-flex items-center gap-1">
        <Sun className="size-3" aria-hidden />
        My Day
      </span>,
    );
  if (task.steps.length > 0)
    meta.push(
      <span key="steps" className="tabular-nums">
        {doneSteps} of {task.steps.length}
      </span>,
    );
  if (task.dueDate)
    meta.push(
      <span
        key="due"
        className={cn("inline-flex items-center gap-1", overdue && "text-destructive")}
      >
        <CalendarDays className="size-3" aria-hidden />
        {formatDue(task.dueDate)}
      </span>,
    );
  if (task.note)
    meta.push(
      <span key="note" className="inline-flex items-center gap-1">
        <FileText className="size-3" aria-hidden />
        Note
      </span>,
    );

  return (
    <li>
      <div
        className={cn(
          "group flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 shadow-xs transition-colors",
          selected ? "border-primary/50 ring-1 ring-primary/30" : "border-transparent",
        )}
      >
        <Checkbox
          checked={task.completed}
          onCheckedChange={onToggle}
          aria-label={task.completed ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          className="mt-0.5 size-5 shrink-0 rounded-full"
        />

        <button
          onClick={onSelect}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <p
            className={cn(
              "truncate text-sm",
              task.completed && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </p>
          {meta.length > 0 && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {meta.map((m, i) => (
                <span key={i} className="inline-flex items-center gap-2">
                  {i > 0 && <span aria-hidden className="text-muted-foreground/60">·</span>}
                  {m}
                </span>
              ))}
            </p>
          )}
        </button>

        <button
          onClick={onToggleImportant}
          aria-pressed={task.important}
          aria-label={task.important ? `Remove ${task.title} from Important` : `Mark ${task.title} as important`}
          className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Star
            className={cn("size-4", task.important && "fill-primary text-primary")}
          />
        </button>
      </div>
    </li>
  );
}
