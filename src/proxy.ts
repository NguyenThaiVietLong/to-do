import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isMisconfigured, verifySessionToken } from "@/lib/auth";

/**
 * Gate every page and API route behind the shared password.
 *
 * The docs warn against using Proxy as a whole authorisation layer, so the API
 * route handlers check the session again themselves. This is the outer layer:
 * it keeps unauthenticated traffic away from the app and sends browsers to the
 * login page, but it is not the only thing standing between the internet and
 * the data.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isMisconfigured()) {
    const message =
      "APP_PASSWORD is not set. Refusing to serve an unprotected app in production.";
    return isApi
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
  }

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  // Come back to whatever was being opened once the password is accepted.
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login screen itself, the endpoint that signs you in,
  // and Next's own static output.
  matcher: [
    "/((?!login|api/login|_next/static|_next/image|favicon.ico).*)",
  ],
};
