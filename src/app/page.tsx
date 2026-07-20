"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { useView } from "@/components/app-shell";
import { TaskItem } from "@/components/task-item";
import { TaskDetail } from "@/components/task-detail";
import { listName, sortTasks, viewMeta, viewTasks } from "@/lib/selectors";
import { formatLong, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

export default function TasksPage() {
  const store = useStore();
  const { view, query, setQuery } = useView();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(true);

  const meta = viewMeta(view, store.lists);
  const searching = query.trim().length > 0;

  const { open, done } = useMemo(() => {
    const base = searching
      ? store.tasks.filter((t) =>
          t.title.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : viewTasks(store, view);
    const sorted = sortTasks(base);
    return {
      open: sorted.filter((t) => !t.completed),
      done: sorted.filter((t) => t.completed),
    };
  }, [store, view, query, searching]);

  const selected = store.tasks.find((t) => t.id === selectedId) ?? null;

  // Where a task typed in a smart view should land, and which flags it inherits.
  const addTarget = () => {
    const inbox = store.lists[0]?.id ?? "tasks";
    switch (view) {
      case "myday":
        return { listId: inbox, extra: { myDay: true } };
      case "important":
        return { listId: inbox, extra: { important: true } };
      case "planned":
        return { listId: inbox, extra: { dueDate: todayISO() } };
      case "all":
      case "completed":
        return { listId: inbox, extra: {} };
      default:
        return { listId: view, extra: {} };
    }
  };

  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    const { listId, extra } = addTarget();
    store.addTask(listId, title, extra);
    setDraft("");
  };

  if (!store.ready) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Loading your tasks…
      </div>
    );
  }

  const renderTask = (t: (typeof open)[number]) => (
    <TaskItem
      key={t.id}
      task={t}
      listLabel={listName(store.lists, t.listId)}
      showList={meta.isSmart || searching}
      showMyDay={view !== "myday"}
      selected={t.id === selectedId}
      onSelect={() => setSelectedId(t.id === selectedId ? null : t.id)}
      onToggle={() => store.toggleTask(t.id)}
      onToggleImportant={() => store.updateTask(t.id, { important: !t.important })}
    />
  );

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="px-4 pt-4 pb-3 sm:px-8 sm:pt-8">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <span aria-hidden>{searching ? "🔍" : meta.icon}</span>
            {searching ? `Search: ${query}` : meta.name}
          </h1>
          {view === "myday" && !searching && (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatLong(todayISO())}
            </p>
          )}
        </header>

        {/* Add box is hidden while searching, where it would have no target. */}
        {!searching && view !== "completed" && (
          <div className="px-4 sm:px-8">
            <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-3 shadow-xs focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-ring/25">
              <Plus className="size-4 shrink-0 text-primary" />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Add a task"
                aria-label="Add a task"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        )}

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-8 sm:px-8">
          {open.length === 0 && done.length === 0 ? (
            <EmptyState searching={searching} onClear={() => setQuery("")} />
          ) : (
            <>
              <ul className="space-y-1">{open.map(renderTask)}</ul>

              {done.length > 0 && (
                <>
                  <button
                    onClick={() => setShowDone((v) => !v)}
                    aria-expanded={showDone}
                    className="mt-4 mb-1 inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-secondary/70"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform",
                        !showDone && "-rotate-90",
                      )}
                    />
                    Completed
                    <span className="text-muted-foreground tabular-nums">
                      {done.length}
                    </span>
                  </button>
                  {showDone && (
                    <>
                      <ul className="space-y-1">
                        {done.slice(0, 100).map(renderTask)}
                      </ul>
                      {done.length > 100 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Showing the 100 most recent of {done.length} completed
                          tasks.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-40 bg-background lg:static lg:z-auto lg:w-96 lg:shrink-0">
          <TaskDetail task={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}

function EmptyState({
  searching,
  onClear,
}: {
  searching: boolean;
  onClear: () => void;
}) {
  return (
    <div className="grid place-items-center py-20 text-center">
      <p className="text-4xl" aria-hidden>
        {searching ? "🔍" : "🎉"}
      </p>
      <p className="mt-3 text-sm font-medium">
        {searching ? "No tasks match your search" : "Nothing here yet"}
      </p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {searching
          ? "Try a different word, or clear the search box."
          : "Add a task above to get started."}
      </p>
      {searching && (
        <button
          onClick={onClear}
          className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          Clear search
        </button>
      )}
    </div>
  );
}
