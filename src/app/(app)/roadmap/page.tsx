"use client";

import { useMemo, useState } from "react";
import { Plus, Target, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { roadmapProgress, type RoadmapProgress } from "@/lib/selectors";
import { addDays, formatLong, todayISO } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** One decimal, but no trailing ".0" — 37% reads better than 37.0%. */
function pct(n: number): string {
  return `${Number(n.toFixed(1))}%`;
}

function RoadmapCard({ p }: { p: RoadmapProgress }) {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(String(p.target));
  const [deadline, setDeadline] = useState(p.roadmap.deadline);

  function save() {
    const n = Number(target);
    if (Number.isInteger(n) && n >= 1 && deadline > p.roadmap.startedAt) {
      store.updateRoadmap(p.roadmap.id, { target: n, deadline });
      setEditing(false);
    }
  }

  const status = p.complete
    ? { text: "Target reached", tone: "text-emerald-600 dark:text-emerald-400" }
    : p.overdue
      ? { text: `Overdue by ${Math.abs(p.daysLeft)} days`, tone: "text-red-600 dark:text-red-400" }
      : p.delta >= 0
        ? { text: `Ahead by ${Math.round(p.delta)} tasks`, tone: "text-emerald-600 dark:text-emerald-400" }
        : { text: `Behind by ${Math.round(-p.delta)} tasks`, tone: "text-amber-600 dark:text-amber-400" };

  return (
    <div className="rounded-lg border bg-card p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <span aria-hidden>{p.listIcon}</span>
          {p.listName}
        </h2>
        <div className="flex items-center gap-3 text-sm">
          <span className={cn(p.overdue && "text-red-600 dark:text-red-400")}>
            {p.daysLeft >= 0 ? `${p.daysLeft} days left` : "Past deadline"}
          </span>
          <button
            onClick={() => {
              if (confirm(`Delete the roadmap for ${p.listName}? The list and its tasks stay.`)) {
                store.deleteRoadmap(p.roadmap.id);
              }
            }}
            aria-label={`Delete the roadmap for ${p.listName}`}
            className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </header>

      {/* The two figures the roadmap exists to answer, deliberately the same
          size: where the whole thing stands, and what today added to it. */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{pct(p.percent)}</div>
          <div className="text-xs text-muted-foreground">of the target</div>
        </div>
        <div>
          <div className="text-3xl font-semibold tabular-nums">
            {p.doneToday > 0 ? "+" : ""}
            {pct(p.percentToday)}
          </div>
          <div className="text-xs text-muted-foreground">
            today · {p.doneToday} {p.doneToday === 1 ? "task" : "tasks"}
          </div>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(p.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${p.listName} progress`}
        className="mb-2 h-2.5 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            p.complete ? "bg-emerald-500" : p.overdue ? "bg-red-500" : "bg-primary",
          )}
          style={{ width: `${p.percent}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        {/* The real count, not the capped bar — overshooting the target should
            still be visible rather than flattened to 100%. */}
        <span className="tabular-nums text-muted-foreground">
          {p.done}/{p.target} tasks
        </span>
        <span className={status.tone}>
          {status.text}
          {!p.complete && p.daysLeft > 0 && (
            <span className="text-muted-foreground">
              {" · "}
              {Number(p.neededPerDay.toFixed(1))}/day to finish on time
            </span>
          )}
        </span>
      </div>

      {editing ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Target</span>
            <Input
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-24"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Deadline</span>
            <Input
              type="date"
              min={addDays(p.roadmap.startedAt, 1)}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <Button onClick={save}>Save</Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Started {formatLong(p.roadmap.startedAt)} · due {formatLong(p.roadmap.deadline)} — edit
        </button>
      )}
    </div>
  );
}

function NewRoadmap({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const taken = new Set(store.roadmaps.map((r) => r.listId));
  const available = store.lists.filter((l) => !taken.has(l.id));

  const [listId, setListId] = useState(available[0]?.id ?? "");
  const [target, setTarget] = useState("30");
  const [deadline, setDeadline] = useState(addDays(todayISO(), 30));

  if (available.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Every list already has a roadmap. Add a new list first.
      </p>
    );
  }

  const n = Number(target);
  const valid = listId !== "" && Number.isInteger(n) && n >= 1 && deadline > todayISO();

  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="mb-4 font-semibold">New roadmap</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">List</span>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {available.map((l) => (
              <option key={l.id} value={l.id}>
                {l.icon} {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Target tasks</span>
          <Input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-24"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Deadline</span>
          <Input
            type="date"
            min={addDays(todayISO(), 1)}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <Button
          disabled={!valid}
          onClick={() => {
            store.addRoadmap(listId, n, deadline);
            onDone();
          }}
        >
          Create
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Progress starts at 0% today. Tasks you completed before now do not count
        towards it.
      </p>
    </div>
  );
}

export default function RoadmapPage() {
  const store = useStore();
  const [adding, setAdding] = useState(false);

  const progress = useMemo(
    () => store.roadmaps.map((r) => roadmapProgress(r, store)),
    [store],
  );

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Roadmap</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatLong(todayISO())}
            </p>
          </div>
          {!adding && (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              New roadmap
            </Button>
          )}
        </header>

        <div className="space-y-4">
          {adding && <NewRoadmap onDone={() => setAdding(false)} />}

          {!store.ready ? (
            <p className="text-sm text-muted-foreground">Loading your roadmaps…</p>
          ) : progress.length === 0 && !adding ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <Target className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">No roadmaps yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a list, set how many tasks count as done, and give it a
                deadline.
              </p>
            </div>
          ) : (
            progress.map((p) => <RoadmapCard key={p.roadmap.id} p={p} />)
          )}
        </div>
      </div>
    </div>
  );
}
