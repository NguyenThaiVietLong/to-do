import { insertRoadmap, listExists, readRoadmaps } from "@/lib/db";
import { parseNewRoadmap } from "@/lib/validate";
import { requireSession } from "@/lib/guard";
import { todayISO } from "@/lib/date";

export async function GET() {
  const denied = await requireSession();
  if (denied !== null) return denied;

  return Response.json(await readRoadmaps());
}

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const body: unknown = await request.json().catch(() => null);
  const roadmap = parseNewRoadmap(body, todayISO());
  if (roadmap === null) {
    return Response.json(
      {
        error:
          "Invalid roadmap. `listId`, an integer `target` of 1 or more, and a `deadline` after the start date are required.",
      },
      { status: 400 },
    );
  }

  if (!(await listExists(roadmap.listId))) {
    return Response.json(
      { error: `No such list: ${roadmap.listId}` },
      { status: 404 },
    );
  }

  const created = await insertRoadmap(roadmap);
  if (created === null) {
    return Response.json(
      { error: "That list already has a roadmap." },
      { status: 409 },
    );
  }
  return Response.json(created, { status: 201 });
}
