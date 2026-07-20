"use client";

import { useId, useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Every chart ships a table twin. The toggle is not a nicety — a colour-encoded
 * scale is unreadable for some people and unprintable for others, so the values
 * must always be reachable as text.
 */
export function ChartCard({
  title,
  subtitle,
  chart,
  table,
  aside,
  className,
}: {
  title: string;
  subtitle?: string;
  chart: React.ReactNode;
  table: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const bodyId = useId();

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-lg border bg-card p-5 shadow-xs",
        className,
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {aside}
        <button
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          aria-controls={bodyId}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {asTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
          {asTable ? "Chart" : "Table"}
        </button>
      </div>

      <div id={bodyId} className="min-w-0 flex-1">
        {asTable ? table : chart}
      </div>
    </section>
  );
}

/** Shared table styling so both twins read as one component. */
export function DataTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="thin-scroll max-h-72 overflow-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-secondary/80 backdrop-blur">
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={cn(
                  "px-3 py-2 text-xs font-medium text-muted-foreground",
                  i === 0 ? "text-left" : "text-right",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "px-3 py-1.5",
                    ci === 0 ? "text-left" : "text-right tabular-nums",
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
