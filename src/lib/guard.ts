import { cookies } from "next/headers";
import { SESSION_COOKIE, isMisconfigured, verifySessionToken } from "./auth";

/**
 * Second line of defence for the data routes. Proxy already turns away
 * unauthenticated traffic, but a mistake in its matcher would otherwise expose
 * the whole API, so every handler checks for itself.
 *
 * Returns a Response to send back, or null when the request may proceed.
 */
export async function requireSession(): Promise<Response | null> {
  if (isMisconfigured()) {
    return Response.json(
      { error: "APP_PASSWORD is not set on the server." },
      { status: 503 },
    );
  }
  const jar = await cookies();
  if (await verifySessionToken(jar.get(SESSION_COOKIE)?.value)) return null;
  return Response.json({ error: "Not signed in." }, { status: 401 });
}
