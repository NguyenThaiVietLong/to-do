import { deleteList, updateList } from "@/lib/db";
import { parseListPatch } from "@/lib/validate";
import { requireSession } from "@/lib/guard";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/lists/[id]">,
) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const { id } = await ctx.params;
  const body: unknown = await request.json().catch(() => null);
  const patch = parseListPatch(body);
  if (patch === null) {
    return Response.json({ error: "Invalid list patch." }, { status: 400 });
  }

  const updated = await updateList(id, patch);
  if (updated === null) {
    return Response.json({ error: `No such list: ${id}` }, { status: 404 });
  }
  return Response.json(updated);
}

/** Deleting a list takes its tasks with it, the same as To Do does. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/lists/[id]">,
) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const { id } = await ctx.params;
  if (!(await deleteList(id))) {
    return Response.json({ error: `No such list: ${id}` }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
