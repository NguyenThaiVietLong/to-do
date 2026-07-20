import { deleteRoadmap, readRoadmaps, updateRoadmap } from "@/lib/db";
import { parseRoadmapPatch } from "@/lib/validate";
import { requireSession } from "@/lib/guard";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/roadmaps/[id]">,
) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const { id } = await ctx.params;
  const body: unknown = await request.json().catch(() => null);
  const patch = parseRoadmapPatch(body);
  if (patch === null) {
    return Response.json({ error: "Invalid roadmap patch." }, { status: 400 });
  }

  // A deadline moved back before the start would make every pace figure
  // meaningless, so it is checked against the stored start rather than today.
  if (patch.deadline !== undefined) {
    const existing = (await readRoadmaps()).find((r) => r.id === id);
    if (existing !== undefined && patch.deadline <= existing.startedAt) {
      return Response.json(
        { error: "`deadline` must be after the roadmap's start date." },
        { status: 400 },
      );
    }
  }

  const updated = await updateRoadmap(id, patch);
  if (updated === null) {
    return Response.json({ error: `No such roadmap: ${id}` }, { status: 404 });
  }
  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/roadmaps/[id]">,
) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const { id } = await ctx.params;
  if (!(await deleteRoadmap(id))) {
    return Response.json({ error: `No such roadmap: ${id}` }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
