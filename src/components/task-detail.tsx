"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Plus, Star, Sun, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatLong } from "@/lib/date";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";

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
        </div>

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
