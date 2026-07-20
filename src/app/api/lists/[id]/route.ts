import { mutate } from "@/lib/db";
import { parseListPatch } from "@/lib/validate";
import type { TaskList } from "@/lib/types";
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

  const updated = await mutate((s) => {
    const list = s.lists.find((l) => l.id === id);
    if (list === undefined) return null;
    const next: TaskList = { ...list, ...patch };
    return {
      state: { ...s, lists: s.lists.map((l) => (l.id === id ? next : l)) },
      result: next,
    };
  });

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

  const deleted = await mutate((s) =>
    s.lists.some((l) => l.id === id)
      ? {
          state: {
            lists: s.lists.filter((l) => l.id !== id),
            tasks: s.tasks.filter((t) => t.listId !== id),
          },
          result: id,
        }
      : null,
  );

  if (deleted === null) {
    return Response.json({ error: `No such list: ${id}` }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
