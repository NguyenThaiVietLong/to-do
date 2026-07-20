"use client";

import { useRef, useState } from "react";
import { formatLong } from "@/lib/date";
import type { HeatGrid } from "@/lib/selectors";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const ROW_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

interface Tip {
  x: number;
  y: number;
  text: string;
}

/**
 * Completions per day, Monday-first, one column per week.
 *
 * Magnitude, not identity — so this is a SEQUENTIAL ramp: one hue, light to
 * dark, anchored the other way round in dark mode. A day with nothing done is
 * absence rather than a small amount, so level 0 is a neutral cell outside the
 * ramp. 371 cells is far too many to tab through, so the grid is exposed as a
 * single labelled image and the table twin carries the values for keyboard and
 * screen-reader users.
 */
export function StreakHeatmap({ grid }: { grid: HeatGrid }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const handleMove = (e: React.MouseEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-label]");
    const wrap = wrapRef.current;
    if (!cell || !wrap) {
      setTip(null);
      return;
    }
    const wrapBox = wrap.getBoundingClientRect();
    const cellBox = cell.getBoundingClientRect();
    const rawX = cellBox.left + cellBox.width / 2 - wrapBox.left;
    setTip({
      // Keep the bubble inside the card instead of letting it overhang.
      x: Math.min(Math.max(rawX, 72), wrapBox.width - 72),
      y: cellBox.top - wrapBox.top,
      text: cell.dataset.label ?? "",
    });
  };

  const total = grid.weeks
    .flat()
    .reduce((sum, c) => sum + (c.future ? 0 : c.count), 0);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseMove={handleMove}
      onMouseLeave={() => setTip(null)}
    >
      {/* The wide grid scrolls inside its own box; the page never scrolls
          sideways because of it. */}
      <div className="thin-scroll overflow-x-auto pb-1">
        <div className="flex gap-2" style={{ width: "max-content" }}>
          {/* Weekday gutter */}
          <div
            aria-hidden
            className="grid shrink-0 pt-5 text-[10px] text-[var(--chart-ink-muted)]"
            style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP }}
          >
            {ROW_LABELS.map((l, i) => (
              <span key={i} className="flex items-center leading-none">
                {l}
              </span>
            ))}
          </div>

          <div>
            {/* Month scale */}
            <div
              aria-hidden
              className="relative mb-1 h-4 text-[10px] text-[var(--chart-ink-muted)]"
              style={{ width: grid.weekCount * STEP }}
            >
              {grid.monthLabels.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="absolute top-0 leading-4"
                  style={{ left: m.col * STEP }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            {/* Cells */}
            <div
              role="img"
              aria-label={`Task completion heatmap. ${total} tasks completed over the last ${grid.weekCount} weeks. Use the table view for the daily numbers.`}
              className="grid grid-flow-col"
              style={{
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gap: GAP,
              }}
            >
              {grid.weeks.map((week) =>
                week.map((cell) =>
                  cell.future ? (
                    <span key={cell.date} style={{ width: CELL, height: CELL }} />
                  ) : (
                    <span
                      key={cell.date}
                      className="heat-cell rounded-[2px]"
                      data-level={cell.level}
                      data-label={`${cell.count === 0 ? "No tasks" : cell.count === 1 ? "1 task" : `${cell.count} tasks`} · ${formatLong(cell.date)}`}
                      style={{
                        width: CELL,
                        height: CELL,
                        backgroundColor: `var(--heat-${cell.level})`,
                      }}
                    />
                  ),
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend — the scale key, always visible, never only in a tooltip. */}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-[var(--chart-ink-muted)]">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span
            key={l}
            className="rounded-[2px]"
            style={{ width: CELL, height: CELL, backgroundColor: `var(--heat-${l})` }}
          />
        ))}
        <span>More</span>
        <span className="ml-auto tabular-nums">
          {total} completed · busiest day {grid.max}
        </span>
      </div>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background"
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
