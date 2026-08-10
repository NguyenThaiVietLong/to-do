"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Star, Sun } from "lucide-react";
import { useStore } from "@/lib/store";
import { Checkbox } from "@/components/ui/checkbox";
import { MOSCOW_BUCKETS, listName, moscowBoard } from "@/lib/selectors";
import { formatDue, formatLong, isOverdue, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Moscow, Task } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* MoSCoW board                                                                */
/*                                                                             */
/* The four buckets side by side, plus a tray for everything not sorted yet.    */
/* A card is moved by dragging it, or by the select on the card — dragging is   */
/* the fast path on a desktop, and it is the only one, so the select is what    */
/* keeps the board usable by keyboard and on a phone.                          */
/* -------------------------------------------------------------------------- */

/** Where a card can be dropped. "none" is the untriaged tray. */
type Slot = Moscow | "none";

/**
 * The buckets are ordinal — must outranks should outranks could — so the accent
 * runs hot to cold rather than being four unrelated hues. "Won't" is grey on
 * purpose: it is the one bucket that is not work waiting to be done.
 */
const TONE: Record<Moscow, string> = {
  must: "bg-red-500",
  should: "bg-amber-500",
  could: "bg-sky-500",
  wont: "bg-muted-foreground/50",
};

export default function MoscowPage() {
  const store = useStore();
  const board = useMemo(() => moscowBoard(store), [store]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Slot | null>(null);

  const move = (taskId: string, to: Moscow | null) => {
    const task = store.tasks.find((t) => t.id === taskId);
    if (task === undefined || task.moscow === to) return;
    store.updateTask(taskId, { moscow: to });
  };

  if (!store.ready) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Loading your board…
      </div>
    );
  }

  const total = board.columns.reduce((n, c) => n + c.tasks.length, 0) + board.untriaged.length;

  /** The drop handlers every column and the tray share. */
  const dropZone = (slot: Slot, to: Moscow | null) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(slot);
    },
    // relatedTarget is where the pointer went. Crossing onto a card inside this
    // zone is not leaving it, and clearing on that would make the highlight
    // flicker the whole way across the column.
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(null);
      setDragging(null);
      const id = e.dataTransfer.getData("text/plain");
      if (id) move(id, to);
    },
  });

  const card = (task: Task) => (
    <BoardCard
      key={task.id}
      task={task}
      listLabel={listName(store.lists, task.listId)}
      dragging={dragging === task.id}
      onDragStart={() => setDragging(task.id)}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
      onToggle={() => store.toggleTask(task.id)}
      onMove={(to) => move(task.id, to)}
    />
  );

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <span aria-hidden>🧭</span>
            MoSCoW
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatLong(todayISO())} · open tasks only — what is finished no
            longer needs prioritising
          </p>
        </header>

        {total === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-4xl" aria-hidden>
              🎉
            </p>
            <p className="mt-3 font-medium">Nothing left to prioritise</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every task is done. Add one from any list and it turns up here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {board.columns.map((col) => (
                <section
                  key={col.id}
                  {...dropZone(col.id, col.id)}
                  className={cn(
                    "flex flex-col rounded-lg border bg-card p-4 shadow-xs transition-colors",
                    over === col.id && "border-primary bg-accent/40",
                  )}
                >
                  <header className="mb-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <span
                        aria-hidden
                        className={cn("size-2.5 shrink-0 rounded-full", TONE[col.id])}
                      />
                      <span className="min-w-0 flex-1 truncate">{col.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {col.tasks.length}
                      </span>
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">{col.hint}</p>
                  </header>

                  {col.tasks.length === 0 ? (
                    <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                      Drop a task here
                    </p>
                  ) : (
                    <ul className="space-y-2">{col.tasks.map(card)}</ul>
                  )}

                  {col.done > 0 && (
                    <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground tabular-nums">
                      {col.done} completed
                    </p>
                  )}
                </section>
              ))}
            </div>

            {/* The tray is the board's real job: an empty one means every task
                has been given an answer. */}
            <section
              {...dropZone("none", null)}
              className={cn(
                "mt-4 rounded-lg border border-dashed p-4 transition-colors",
                over === "none" && "border-primary bg-accent/40",
              )}
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className="min-w-0 flex-1 truncate">Not prioritised</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {board.untriaged.length}
                </span>
              </h2>
              <p className="mt-1 mb-3 text-xs text-muted-foreground">
                {board.untriaged.length === 0
                  ? "Nothing waiting — every open task has a bucket."
                  : "Give each one a bucket. Dropping a card back here clears its priority."}
              </p>
              {board.untriaged.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {board.untriaged.map(card)}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function BoardCard({
  task,
  listLabel,
  dragging,
  onDragStart,
  onDragEnd,
  onToggle,
  onMove,
}: {
  task: Task;
  listLabel: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggle: () => void;
  onMove: (to: Moscow | null) => void;
}) {
  const overdue = isOverdue(task.dueDate);

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-md border bg-background p-2.5 shadow-xs transition-opacity active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={task.completed}
          onCheckedChange={onToggle}
          aria-label={`Mark ${task.title} as done`}
          className="mt-0.5 size-4 shrink-0 rounded-full"
        />
        <p className="min-w-0 flex-1 text-sm">{task.title}</p>
        {task.important && (
          <Star className="mt-0.5 size-3.5 shrink-0 fill-primary text-primary" aria-hidden />
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{listLabel}</span>
        {task.myDay && (
          <span className="inline-flex shrink-0 items-center gap-1">
            <Sun className="size-3" aria-hidden />
            My Day
          </span>
        )}
        {task.dueDate !== null && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1",
              overdue && "text-destructive",
            )}
          >
            <CalendarDays className="size-3" aria-hidden />
            {formatDue(task.dueDate)}
          </span>
        )}
      </div>

      <select
        value={task.moscow ?? "none"}
        onChange={(e) =>
          onMove(e.target.value === "none" ? null : (e.target.value as Moscow))
        }
        aria-label={`Priority for ${task.title}`}
        className="mt-2 ml-6 rounded-md border bg-transparent px-1.5 py-0.5 text-xs text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <option value="none">Not prioritised</option>
        {MOSCOW_BUCKETS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </li>
  );
}
