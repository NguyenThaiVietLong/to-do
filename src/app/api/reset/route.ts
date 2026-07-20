import { emptyState, writeState } from "@/lib/db";
import { buildSeed } from "@/lib/seed";

/**
 * Wipe the store. Empty by default — the default lists with no tasks.
 * `{"seed": true}` fills it with the year of sample data instead, which is the
 * only thing that makes the dashboard charts worth looking at.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const seed =
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>).seed === true;

  return Response.json(await writeState(seed ? buildSeed() : emptyState()));
}
