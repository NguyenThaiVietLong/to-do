import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  checkPassword,
  createSessionToken,
  isAuthEnabled,
  isMisconfigured,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (isMisconfigured()) {
    return Response.json(
      { error: "APP_PASSWORD is not set on the server." },
      { status: 503 },
    );
  }
  if (!isAuthEnabled()) {
    // No password configured in development — there is nothing to sign in to.
    return Response.json({ ok: true });
  }

  const body: unknown = await request.json().catch(() => null);
  const candidate =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).password
      : undefined;

  if (!checkPassword(candidate)) {
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(), SESSION_COOKIE_OPTIONS);
  return Response.json({ ok: true });
}

/** Sign out. */
export async function DELETE() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return new Response(null, { status: 204 });
}
