/**
 * All dates in this app are local-calendar `YYYY-MM-DD` strings, never
 * timestamps. A task ticked off at 11pm belongs to that day for the person who
 * ticked it, so parsing must stay in local time — `new Date("2026-07-19")`
 * would parse as UTC and slide the day backwards west of Greenwich.
 */

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(aISO: string, bISO: string): number {
  const MS = 86_400_000;
  // Round, don't floor: a DST shift makes the gap 23 or 25 hours.
  return Math.round((fromISO(bISO).getTime() - fromISO(aISO).getTime()) / MS);
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Today" / "Tomorrow" / "Yesterday" / "Mon, 21 Jul" — the To Do date style. */
export function formatDue(iso: string, today = todayISO()): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = fromISO(iso);
  const base = `${WEEKDAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]}`;
  return d.getFullYear() === fromISO(today).getFullYear()
    ? base
    : `${base} ${d.getFullYear()}`;
}

export function formatLong(iso: string): string {
  const d = fromISO(iso);
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthShort(monthIndex: number): string {
  return MONTH[monthIndex];
}

export function isOverdue(iso: string | null, today = todayISO()): boolean {
  return iso !== null && daysBetween(today, iso) < 0;
}

/** Monday-first weekday index (0 = Mon … 6 = Sun), matching the heatmap rows. */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}
