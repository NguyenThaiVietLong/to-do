import { deleteTask, readTask, spawnNextOccurrence, updateTask } from "@/lib/db";
import { parseTaskPatch } from "@/lib/validate";
import { requireSession } from "@/lib/guard";
import { todayISO } from "@/lib/date";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const { id } = await ctx.params;
  const body: unknown = await request.json().catch(() => null);
  const patch = parseTaskPatch(body);
  if (patch === null) {
    return Response.json({ error: "Invalid task patch." }, { status: 400 });
  }

  // Read first: spawning the next occurrence needs the repeat rule as it was
  // before this patch, and whether the task was already complete.
  const before = await readTask(id);
  if (before === null) {
    return Response.json({ error: `No such task: ${id}` }, { status: 404 });
  }

  const updated = await updateTask(id, patch);
  if (updated === null) {
    return Response.json({ error: `No such task: ${id}` }, { status: 404 });
  }

  // A finished task must not keep a live repeat rule — spawning the next
  // occurrence clears it. Two edges lead here:
  //   1. Ticking a repeating task off (the not-done → done transition). Re-saving
  //      a finished task can't spawn a second copy: its rule is already gone.
  //   2. A repeat set on an already-finished task. The tick has already happened,
  //      so honour "ticking this off creates the next one" now instead of leaving
  //      it stuck with no next occurrence forever.
  // The branches are mutually exclusive on before.repeat, and each spawn is
  // idempotent (repeat is cleared + the occurrence id is deterministic).
  if (!before.completed && updated.completed && before.repeat !== null) {
    await spawnNextOccurrence(before, todayISO());
  } else if (updated.completed && before.repeat === null && updated.repeat !== null) {
    await spawnNextOccurrence(updated, todayISO());
  }

  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const { id } = await ctx.params;
  if (!(await deleteTask(id))) {
    return Response.json({ error: `No such task: ${id}` }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
