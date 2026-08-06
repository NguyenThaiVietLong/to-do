import {
  demoteOverdueFromMyDay,
  generateRecurringTasks,
  promoteTodayToMyDay,
  purgeStaleOverdue,
  readState,
} from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { todayISO } from "@/lib/date";

/** The whole app state in one request — what the client loads on boot. */
export async function GET() {
  const denied = await requireSession();
  if (denied !== null) return denied;

  // Catch the recurring rules up before reading, so opening the app is what
  // materialises today's tasks. A failure here must not blank the whole app —
  // the existing tasks are still worth serving.
  try {
    const today = todayISO();
    await generateRecurringTasks(today);
    // After generating, so a task created for today lands in My Day on the same
    // request rather than a page load later.
    await promoteTodayToMyDay(today);
    // And clear out what yesterday left behind — those belong to Overdue now.
    await demoteOverdueFromMyDay(today);
    // Last, because it reads the far end of that same list: whatever has been
    // sitting in Overdue for more than 72 hours is dropped for good.
    await purgeStaleOverdue(today);
  } catch (err: unknown) {
    console.error("[recurrences] generation failed", err);
  }

  return Response.json(await readState());
}
