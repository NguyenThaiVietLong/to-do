import { mutate, readState } from "@/lib/db";
import { parseNewList } from "@/lib/validate";
import { requireSession } from "@/lib/guard";

export async function GET() {
  const denied = await requireSession();
  if (denied !== null) return denied;

  return Response.json((await readState()).lists);
}

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const body: unknown = await request.json().catch(() => null);
  const list = parseNewList(body);
  if (list === null) {
    return Response.json(
      { error: "Invalid list. `name` is required." },
      { status: 400 },
    );
  }

  await mutate((s) => ({
    state: { ...s, lists: [...s.lists, list] },
    result: list,
  }));

  return Response.json(list, { status: 201 });
}
