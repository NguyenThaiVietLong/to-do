import { insertRecurrence, listExists, readRecurrences } from "@/lib/db";
import { parseNewRecurrence } from "@/lib/validate";
import { requireSession } from "@/lib/guard";
import { todayISO } from "@/lib/date";

export async function GET() {
  const denied = await requireSession();
  if (denied !== null) return denied;

  return Response.json(await readRecurrences());
}

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const body: unknown = await request.json().catch(() => null);
  const rule = parseNewRecurrence(body, todayISO());
  if (rule === null) {
    return Response.json(
      {
        error:
          "Invalid recurrence. `listId`, a non-empty `title`, and `weekdays` (0–6, Monday first) are required; `endsOn` must not precede `startsOn`.",
      },
      { status: 400 },
    );
  }

  if (!(await listExists(rule.listId))) {
    return Response.json({ error: `No such list: ${rule.listId}` }, { status: 404 });
  }

  return Response.json(await insertRecurrence(rule), { status: 201 });
}
