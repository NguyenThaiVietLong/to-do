import { readState } from "@/lib/db";

/** The whole app state in one request — what the client loads on boot. */
export async function GET() {
  return Response.json(await readState());
}
