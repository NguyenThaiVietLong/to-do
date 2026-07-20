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

  // Only on the transition into completed, so re-saving a finished task never
  // spawns a second copy.
  if (!before.completed && updated.completed && before.repeat !== null) {
    await spawnNextOccurrence(before, todayISO());
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
