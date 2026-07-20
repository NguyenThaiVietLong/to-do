"use client";

import type { ListCount } from "@/lib/selectors";

/**
 * Open tasks per list.
 *
 * List names are NOMINAL — "Work" is not greater than "Groceries" — so every
 * bar wears the same slot-1 hue. Shading bars by their value would double-encode
 * the length as colour and spend the identity channel on nothing.
 * One series, so no legend: the title says what is plotted.
 */
export function TasksByList({ data }: { data: ListCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.open));

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No lists yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const pct = (d.open / max) * 100;
        return (
          <li key={d.listId} className="group relative flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-xs text-[var(--chart-ink-secondary)] sm:w-28">
              <span className="mr-1" aria-hidden>
                {d.icon}
              </span>
              {d.name}
            </span>

            {/* Track. The baseline hairline sits at x=0, where bars grow from.
                Capped: counts this small stretched across a full-width card
                turn into a wall of saturated fill and stop being comparable. */}
            <span className="relative min-w-0 flex-1 border-l border-[var(--chart-axis)] py-0.5 sm:max-w-[360px]">
              <span
                className="block h-5 rounded-r-[4px] transition-[width,background-color] duration-300 group-hover:bg-[var(--chart-bar-hover)]"
                style={{
                  width: d.open === 0 ? 2 : `max(3px, ${pct}%)`,
                  backgroundColor:
                    d.open === 0 ? "var(--chart-grid)" : "var(--chart-bar)",
                }}
              />
            </span>

            {/* Direct label, outside the bar end — never inside, so it can
                never be clipped by a short bar or fail contrast on the fill. */}
            <span className="w-7 shrink-0 text-right text-xs font-medium text-[var(--chart-ink)] tabular-nums">
              {d.open}
            </span>

            {/* Hover detail. Additive only — the open count is already labelled
                and every number lives in the table twin. */}
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 -top-1 z-10 hidden -translate-y-full rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background group-hover:block"
            >
              {d.name}: {d.open} open · {d.done} done · {d.total} total
            </span>
          </li>
        );
      })}
    </ul>
  );
}
