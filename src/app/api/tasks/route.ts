import { insertTask, listExists, readTasks } from "@/lib/db";
import { parseNewTask } from "@/lib/validate";
import { requireSession } from "@/lib/guard";

export async function GET() {
  const denied = await requireSession();
  if (denied !== null) return denied;

  return Response.json(await readTasks());
}

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied !== null) return denied;

  const body: unknown = await request.json().catch(() => null);
  const task = parseNewTask(body);
  if (task === null) {
    return Response.json(
      { error: "Invalid task. `title` and `listId` are required." },
      { status: 400 },
    );
  }

  // Checked up front so a missing list reads as 404 rather than surfacing as a
  // foreign-key violation.
  if (!(await listExists(task.listId))) {
    return Response.json(
      { error: `No such list: ${task.listId}` },
      { status: 404 },
    );
  }

  return Response.json(await insertTask(task), { status: 201 });
}
