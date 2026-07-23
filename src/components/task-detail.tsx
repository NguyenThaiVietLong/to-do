"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Plus, Repeat as RepeatIcon, Star, Sun, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { addDays, formatLong, fromISO, mondayIndex, todayISO, toISO } from "@/lib/date";
import { useStore } from "@/lib/store";
import type { Repeat, Task } from "@/lib/types";

/**
 * "Weekly" is a plain 7-day cadence from the task's anchor — its due date, or
 * the completion date if it has none — so it needs no day picker. "Weekdays"
 * is the separate Mon–Fri rule.
 */
function repeatValue(r: Repeat | null): string {
  if (r === null) return "none";
  if (r.kind === "daily") return "daily";
  if (r.kind === "weekly") return "weekly";
  if (r.kind === "monthly") return "monthly";
  // A five-day rule is "Weekdays"; a legacy single-weekday rule was "Weekly".
  return r.days.length === 5 && r.days.every((d) => d < 5) ? "weekdays" : "weekly";
}

function repeatFrom(value: string): Repeat | null {
  switch (value) {
    case "daily":
      return { kind: "daily" };
    case "weekdays":
      return { kind: "weekdays", days: [0, 1, 2, 3, 4] };
    case "weekly":
      return { kind: "weekly" };
    case "monthly":
      return { kind: "monthly" };
    default:
      return null;
  }
}

/** Mirrors the server's rule so the pane can say when the next one lands. */
function nextDue(task: Task, today: string): string {
  const from = task.dueDate ?? today;
  const r = task.repeat;
  if (r === null) return from;
  if (r.kind === "daily") return addDays(from, 1);
  if (r.kind === "weekly") return addDays(from, 7);
  if (r.kind === "monthly") {
    const d = fromISO(from);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(d.getDate(), lastDay));
    return toISO(next);
  }
  // Legacy single-weekday "Weekly" rules share the plain 7-day cadence.
  if (r.days.length === 1) return addDays(from, 7);
  for (let i = 1; i <= 7; i++) {
    const candidate = addDays(from, i);
    if (r.days.includes(mondayIndex(fromISO(candidate)))) return candidate;
  }
  return addDays(from, 7);
}

export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask, deleteTask, toggleTask, addStep, toggleStep, deleteStep } =
    useStore();
  const [stepText, setStepText] = useState("");
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Keep the title box exactly as tall as its content, no inner scrollbar.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [task.title, task.id]);

  const submitStep = () => {
    const t = stepText.trim();
    if (t) addStep(task.id, t);
    setStepText("");
  };

  return (
    <aside className="flex h-full w-full flex-col border-l bg-sidebar lg:w-96">
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        {/* Title card */}
        <div className="m-3 rounded-md border bg-card shadow-xs">
          <div className="flex items-start gap-3 p-3">
            <Checkbox
              checked={task.completed}
              onCheckedChange={() => toggleTask(task.id)}
              aria-label="Mark task as done"
              className="mt-1 size-5 shrink-0 rounded-full"
            />
            <textarea
              ref={titleRef}
              value={task.title}
              onChange={(e) => updateTask(task.id, { title: e.target.value })}
              rows={1}
              aria-label="Task title"
              className={cn(
                "min-w-0 flex-1 resize-none bg-transparent text-base leading-6 font-medium outline-none",
                task.completed && "text-muted-foreground line-through",
              )}
            />
            <button
              onClick={() => updateTask(task.id, { important: !task.important })}
              aria-pressed={task.important}
              aria-label="Mark as important"
              className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Star className={cn("size-5", task.important && "fill-primary text-primary")} />
            </button>
          </div>

          {/* Steps */}
          {task.steps.length > 0 && (
            <ul className="border-t px-3 py-1">
              {task.steps.map((s) => (
                <li key={s.id} className="group flex items-center gap-3 py-1.5">
                  <Checkbox
                    checked={s.done}
                    onCheckedChange={() => toggleStep(task.id, s.id)}
                    aria-label={`Step: ${s.title}`}
                    className="size-4 shrink-0 rounded-full"
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      s.done && "text-muted-foreground line-through",
                    )}
                  >
                    {s.title}
                  </span>
                  <button
                    onClick={() => deleteStep(task.id, s.id)}
                    aria-label={`Delete step ${s.title}`}
                    className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3 border-t px-3 py-2">
            <Plus className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={stepText}
              onChange={(e) => setStepText(e.target.value)}
              onBlur={submitStep}
              onKeyDown={(e) => e.key === "Enter" && submitStep()}
              placeholder={task.steps.length ? "Next step" : "Add step"}
              aria-label="Add step"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mx-3 divide-y overflow-hidden rounded-md border bg-card shadow-xs">
          <button
            onClick={() => updateTask(task.id, { myDay: !task.myDay })}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-3 text-sm hover:bg-secondary/60",
              task.myDay && "text-primary",
            )}
          >
            <Sun className="size-4 shrink-0" />
            <span className="flex-1 text-left">
              {task.myDay ? "Added to My Day" : "Add to My Day"}
            </span>
            {task.myDay && (
              <X
                className="size-4 text-muted-foreground"
                aria-hidden
                onClick={(e) => {
                  e.stopPropagation();
                  updateTask(task.id, { myDay: false });
                }}
              />
            )}
          </button>

          <label className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm hover:bg-secondary/60">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">{task.dueDate ? "Due" : "Add due date"}</span>
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) =>
                updateTask(task.id, { dueDate: e.target.value || null })
              }
              aria-label="Due date"
              className="bg-transparent text-sm text-muted-foreground outline-none"
            />
          </label>

          <label className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm hover:bg-secondary/60">
            <RepeatIcon
              className={cn(
                "size-4 shrink-0",
                task.repeat ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="flex-1">{task.repeat ? "Repeats" : "Repeat"}</span>
            <select
              value={repeatValue(task.repeat)}
              onChange={(e) =>
                updateTask(task.id, {
                  repeat: repeatFrom(e.target.value),
                })
              }
              aria-label="Repeat"
              className="bg-transparent text-sm text-muted-foreground outline-none"
            >
              <option value="none">Never</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays (Mon–Fri)</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>

        {task.repeat !== null && (
          <p className="mx-3 -mt-1 text-xs text-muted-foreground">
            Ticking this off creates the next one
            {task.dueDate !== null && ` — due ${formatLong(nextDue(task, todayISO()))}`}.
          </p>
        )}

        {/* Note */}
        <div className="m-3 rounded-md border bg-card shadow-xs">
          <textarea
            value={task.note}
            onChange={(e) => updateTask(task.id, { note: e.target.value })}
            placeholder="Add note"
            aria-label="Note"
            rows={4}
            className="thin-scroll w-full resize-none bg-transparent p-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t px-3 py-2">
        <button
          onClick={onClose}
          aria-label="Close detail pane"
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" />
        </button>
        <p className="flex-1 text-center text-xs text-muted-foreground">
          Created {formatLong(task.createdAt)}
        </p>
        <button
          onClick={() => {
            deleteTask(task.id);
            onClose();
          }}
          aria-label="Delete task"
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </aside>
  );
}
