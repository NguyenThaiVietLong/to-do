import { deleteTask, updateTask } from "@/lib/db";
import { parseTaskPatch } from "@/lib/validate";
import { requireSession } from "@/lib/guard";

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

  const updated = await updateTask(id, patch);
  if (updated === null) {
    return Response.json({ error: `No such task: ${id}` }, { status: 404 });
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
