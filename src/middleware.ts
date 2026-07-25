import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Deliberate demo affordance, not a bug: pre-creating an "anonymous"
  // placeholder cookie under the real session-cookie name makes it easy to
  // paste a stolen session value over it in DevTools when reproducing the
  // hijack walkthrough. Auth.js just fails the lookup for the placeholder, so
  // it never grants a session.
  if (!request.cookies.get("auth_session")) {
    response.cookies.set("auth_session", "anonymous", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    })
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/auth).*)",
  ],
}
