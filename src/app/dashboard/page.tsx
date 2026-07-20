"use client";

import { useMemo } from "react";
import { Flame, RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  completionsByDay,
  heatGrid,
  streakInfo,
  tasksByList,
} from "@/lib/selectors";
import { formatLong, todayISO } from "@/lib/date";
import { ChartCard, DataTable } from "@/components/charts/chart-card";
import { TasksByList } from "@/components/charts/tasks-by-list";
import { StreakHeatmap } from "@/components/charts/streak-heatmap";

export default function DashboardPage() {
  const store = useStore();

  const model = useMemo(() => {
    const byDay = completionsByDay(store.tasks);
    return {
      byList: tasksByList(store),
      byDay,
      streak: streakInfo(byDay),
      grid: heatGrid(byDay, 53),
    };
  }, [store]);

  if (!store.ready) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Loading your dashboard…
      </div>
    );
  }

  const { byList, byDay, streak, grid } = model;

  // Newest first — the recent days are the ones anyone actually checks.
  const dayRows = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, count]) => [formatLong(date), count]);

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatLong(todayISO())}
            </p>
          </div>
          <button
            onClick={() => {
              if (confirm("Replace everything with fresh sample data?")) {
                store.resetAll();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            Reset sample data
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Hero figure — exactly one per view. */}
          <section className="flex flex-col rounded-lg border bg-card p-5 shadow-xs">
            <h2 className="text-sm font-semibold">Current streak</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Days in a row with at least one task done
            </p>

            <div className="mt-4 flex items-baseline gap-2">
              <Flame
                className="size-8 shrink-0 self-center text-[var(--chart-bar)]"
                aria-hidden
              />
              <span className="text-5xl leading-none font-semibold">
                {streak.current}
              </span>
              <span className="text-sm text-muted-foreground">
                {streak.current === 1 ? "day" : "days"}
              </span>
            </div>

            <dl className="mt-auto grid grid-cols-3 gap-3 pt-6 text-center">
              <Stat label="Longest" value={streak.longest} unit="days" />
              <Stat label="Active days" value={streak.activeDays} unit="total" />
              <Stat label="Completed" value={streak.totalCompleted} unit="tasks" />
            </dl>
          </section>

          <ChartCard
            className="lg:col-span-2"
            title="Open tasks by list"
            subtitle="Which list needs attention first"
            chart={<TasksByList data={byList} />}
            table={
              <DataTable
                head={["List", "Open", "Done", "Total"]}
                rows={byList.map((d) => [d.name, d.open, d.done, d.total])}
              />
            }
          />
        </div>

        <ChartCard
          className="mt-4"
          title="Productivity heatmap"
          subtitle="Tasks completed each day over the last 53 weeks"
          chart={<StreakHeatmap grid={grid} />}
          table={
            dayRows.length > 0 ? (
              <DataTable head={["Day", "Tasks completed"]} rows={dayRows} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No completed tasks yet.
              </p>
            )
          }
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="rounded-md bg-secondary/60 px-2 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg leading-none font-semibold">{value}</dd>
      <dd className="mt-0.5 text-[10px] text-muted-foreground">{unit}</dd>
    </div>
  );
}
