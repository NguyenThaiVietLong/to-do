import { mutate, readState } from "@/lib/db";
import { parseNewTask } from "@/lib/validate";

export async function GET() {
  return Response.json((await readState()).tasks);
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const task = parseNewTask(body);
  if (task === null) {
    return Response.json(
      { error: "Invalid task. `title` and `listId` are required." },
      { status: 400 },
    );
  }

  const created = await mutate((s) =>
    // Reject rather than orphan the task under a list that no longer exists.
    s.lists.some((l) => l.id === task.listId)
      ? { state: { ...s, tasks: [task, ...s.tasks] }, result: task }
      : null,
  );

  if (created === null) {
    return Response.json(
      { error: `No such list: ${task.listId}` },
      { status: 404 },
    );
  }
  return Response.json(created, { status: 201 });
}
