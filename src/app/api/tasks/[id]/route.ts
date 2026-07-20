import { mutate } from "@/lib/db";
import { parseTaskPatch } from "@/lib/validate";
import type { Task } from "@/lib/types";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const { id } = await ctx.params;
  const body: unknown = await request.json().catch(() => null);
  const patch = parseTaskPatch(body);
  if (patch === null) {
    return Response.json({ error: "Invalid task patch." }, { status: 400 });
  }

  const updated = await mutate((s) => {
    const task = s.tasks.find((t) => t.id === id);
    if (task === undefined) return null;
    const next: Task = { ...task, ...patch };
    return {
      state: { ...s, tasks: s.tasks.map((t) => (t.id === id ? next : t)) },
      result: next,
    };
  });

  if (updated === null) {
    return Response.json({ error: `No such task: ${id}` }, { status: 404 });
  }
  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const { id } = await ctx.params;

  const deleted = await mutate((s) =>
    s.tasks.some((t) => t.id === id)
      ? { state: { ...s, tasks: s.tasks.filter((t) => t.id !== id) }, result: id }
      : null,
  );

  if (deleted === null) {
    return Response.json({ error: `No such task: ${id}` }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
