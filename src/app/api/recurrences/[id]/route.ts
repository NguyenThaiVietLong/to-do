import { deleteRecurrence, updateRecurrence } from "@/lib/db";
import { parseRecurrencePatch } from "@/lib/validate";
import { requireSession } from "@/lib/guard";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/recurrences/[id]">,
) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const { id } = await ctx.params;
  const body: unknown = await request.json().catch(() => null);
  const patch = parseRecurrencePatch(body);
  if (patch === null) {
    return Response.json({ error: "Invalid recurrence patch." }, { status: 400 });
  }

  const updated = await updateRecurrence(id, patch);
  if (updated === null) {
    return Response.json({ error: `No such recurrence: ${id}` }, { status: 404 });
  }
  if (updated.endsOn !== null && updated.endsOn < updated.startsOn) {
    return Response.json(
      { error: "`endsOn` must not precede `startsOn`." },
      { status: 400 },
    );
  }
  return Response.json(updated);
}

/** Deleting a rule stops future generation; tasks it already made stay. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/recurrences/[id]">,
) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const { id } = await ctx.params;
  if (!(await deleteRecurrence(id))) {
    return Response.json({ error: `No such recurrence: ${id}` }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
