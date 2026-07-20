import { readState } from "@/lib/db";
import { requireSession } from "@/lib/guard";

/** The whole app state in one request — what the client loads on boot. */
export async function GET() {
  const denied = await requireSession();
  if (denied !== null) return denied;

  return Response.json(await readState());
}
