import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Authorization is route-level by design, not enforced here. Every protected
// route (/sessions, /account, /api/fingerprint/health, ...) calls auth()
// directly — the Auth.js v5 pattern, and the one that survives this file
// being renamed, skipped, or matched around differently. A root-level
// proxy.ts (Next resolves the middleware/proxy module next to src/app, since
// this project keeps app under src/) used to sit alongside this file with a
// matcher that looked like it covered everything, but Next only ever loaded
// this one — the root file was dead code. It's gone now; don't re-add a
// second file here expecting it to enforce anything.
export function proxy(request: NextRequest) {
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
