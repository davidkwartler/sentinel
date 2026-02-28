---
phase: 01-foundation
plan: 03
type: execute
wave: 3
depends_on:
  - "01-PLAN"
  - "02-PLAN"
files_modified:
  - src/app/page.tsx
  - src/app/layout.tsx
autonomous: false
requirements:
  - AUTH-01
  - AUTH-02
  - AUTH-03
  - AUTH-04

must_haves:
  truths:
    - "User can click Sign in with Google, complete OAuth, and land on a protected page without errors"
    - "The auth_session cookie is visible in DevTools Application -> Cookies after sign-in"
    - "Navigating between protected pages does NOT trigger re-authentication"
    - "Visiting any protected route while signed out redirects to /login"
    - "Session rows exist in the Neon database after sign-in"
  artifacts:
    - path: "src/app/page.tsx"
      provides: "Protected home page showing signed-in user's name and a sign-out button"
    - path: "src/app/layout.tsx"
      provides: "Root layout with html/body — no auth logic here (proxy handles it)"
  key_links:
    - from: "src/app/page.tsx"
      to: "src/lib/auth.ts"
      via: "await auth() to get session"
      pattern: "await auth\\(\\)"
    - from: "auth_session cookie"
      to: "Session table"
      via: "Auth.js Prisma adapter session lookup"
      pattern: "sessionToken"
---

<objective>
Create a minimal protected home page, wire up a sign-out action, and run the end-to-end OAuth verification checkpoint with all five Phase 1 success criteria.

Purpose: This plan closes the loop on all four AUTH requirements. Plans 01 and 02 built the infrastructure; this plan adds the visible protected surface and performs the final human verification that the complete auth flow works.
Output: Verified working Google OAuth flow with database sessions, auth_session cookie, and route protection.
</objective>

<execution_context>
@/Users/davidkwartler/.claude/get-shit-done/workflows/execute-plan.md
@/Users/davidkwartler/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation/01-RESEARCH.md
@.planning/phases/01-foundation/01-01-SUMMARY.md
@.planning/phases/01-foundation/01-02-SUMMARY.md

<interfaces>
<!-- Key exports from Plan 02 that this plan uses -->

From src/lib/auth.ts:
```typescript
export const { handlers, auth, signIn, signOut } = NextAuth(...)

// auth() called in Server Components returns the session or null:
const session = await auth()
// session.user.name, session.user.email, session.user.image are available
// session is null if unauthenticated (proxy redirects before this, so null = bug in proxy)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create protected home page with session display and sign-out</name>
  <files>src/app/page.tsx, src/app/layout.tsx</files>
  <action>
    **Update src/app/layout.tsx** — Keep the default scaffolded layout but ensure it is clean (remove any placeholder content from create-next-app that might cause confusion during verification):

    ```tsx
    // src/app/layout.tsx
    import type { Metadata } from "next"
    import { Inter } from "next/font/google"
    import "./globals.css"

    const inter = Inter({ subsets: ["latin"] })

    export const metadata: Metadata = {
      title: "Sentinel",
      description: "Session hijack detection",
    }

    export default function RootLayout({
      children,
    }: {
      children: React.ReactNode
    }) {
      return (
        <html lang="en">
          <body className={inter.className}>{children}</body>
        </html>
      )
    }
    ```

    **Create src/app/page.tsx** — This is the protected home page. proxy.ts will redirect unauthenticated users to /login before this page renders. The `auth()` call here is a secondary safety check.

    ```tsx
    // src/app/page.tsx
    import { auth, signOut } from "@/lib/auth"
    import { redirect } from "next/navigation"

    export default async function HomePage() {
      const session = await auth()

      // Proxy should handle this, but defensive check:
      if (!session) {
        redirect("/login")
      }

      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-8">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="mb-1 text-2xl font-semibold text-gray-900">Sentinel</h1>
            <p className="mb-6 text-sm text-gray-500">You are authenticated.</p>

            <div className="mb-6 rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Signed in as:</span>{" "}
                {session.user?.name ?? session.user?.email ?? "Unknown"}
              </p>
              <p className="mt-1 text-xs text-gray-400">{session.user?.email}</p>
            </div>

            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: "/login" })
              }}
            >
              <button
                type="submit"
                className="w-full rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
              >
                Sign out
              </button>
            </form>
          </div>

          <p className="text-xs text-gray-400">
            Phase 2 will add product and profile pages here.
          </p>
        </main>
      )
    }
    ```

    Start the dev server and confirm it compiles:
    ```bash
    npm run dev
    ```

    Verify at http://localhost:3000 — should redirect to /login (proxy working). Verify at http://localhost:3000/login — should show the Sentinel sign-in page.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - src/app/page.tsx compiles without errors
    - `npx tsc --noEmit` clean
    - `npm run dev` starts without errors
    - http://localhost:3000 redirects to /login when not signed in
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Complete Phase 1 authentication flow:
    - Next.js 16 app scaffolded with Prisma + Neon database
    - Auth.js v5 with Google OAuth, database sessions, auth_session cookie
    - proxy.ts route guard protecting all non-auth routes
    - Login page at /login with Google sign-in button
    - Protected home page at / showing signed-in user name
    - Sign-out button returning to /login
  </what-built>
  <how-to-verify>
    Run `npm run dev` first (if not already running).

    **Test AUTH-04: Unauthenticated redirect**
    1. Open http://localhost:3000 in a fresh browser tab (or incognito)
    2. Expected: Immediately redirected to http://localhost:3000/login
    3. Expected: Login page shows "Sentinel" heading and "Sign in with Google" button
    4. If you see a 404, Next.js error, or the page loads without redirect → AUTH-04 FAIL

    **Test AUTH-01: Google OAuth sign-in**
    5. Click "Sign in with Google"
    6. Expected: Google OAuth consent screen opens
    7. Select/approve your Google account
    8. Expected: Redirected back to http://localhost:3000/ (home page)
    9. Expected: Home page shows your name and email from Google
    10. If OAuth fails with redirect_uri_mismatch → add http://localhost:3000/api/auth/callback/google to Google Cloud Console Authorized Redirect URIs

    **Test AUTH-02: auth_session cookie visibility**
    11. Open DevTools (F12) → Application tab → Cookies → http://localhost:3000
    12. Expected: Cookie named `auth_session` is visible with a value (long string)
    13. Expected: SameSite column shows "Lax"
    14. Expected: HttpOnly column is checked (but the cookie IS visible in DevTools — HttpOnly only blocks JavaScript access)
    15. If the cookie is named `authjs.session-token` instead → AUTH-02 FAIL (cookie name override not working)

    **Test AUTH-03: Session persistence across navigations**
    16. While signed in, navigate to http://localhost:3000/login directly
    17. Expected: Redirected back to / (already authenticated)
    18. Open a new tab to http://localhost:3000
    19. Expected: Still signed in, same user shown (no re-authentication required)

    **Test AUTH-03: Database session persistence**
    20. Run: `npx prisma studio` (opens at http://localhost:5555)
    21. Open the Session table
    22. Expected: At least one row with your userId, a sessionToken value, and an expires date in the future
    23. The sessionToken value should match (or be derived from) the auth_session cookie value
    24. Run: `npx prisma studio` → Ctrl+C when done

    **Test AUTH-04: Sign-out redirects to login**
    25. On the home page, click "Sign out"
    26. Expected: Redirected to /login
    27. Visit http://localhost:3000 again
    28. Expected: Redirected to /login (session cleared)
  </how-to-verify>
  <resume-signal>
    Type one of:
    - "approved" — all 5 tests pass, Phase 1 complete
    - "auth-04-fail [description]" — unauthenticated redirect not working
    - "auth-01-fail [description]" — Google OAuth failing
    - "auth-02-fail [description]" — cookie name wrong or not visible
    - "auth-03-fail [description]" — session not persisting or no DB row
  </resume-signal>
</task>

</tasks>

<verification>
All Phase 1 success criteria from ROADMAP.md must be TRUE:

1. User can click "Sign in with Google," complete the OAuth flow, and land on a protected page without errors → Verified in checkpoint step 5-9
2. The `auth_session` cookie is visible in DevTools Application panel after sign-in → Verified in checkpoint step 11-15
3. Navigating between protected pages does not trigger re-authentication — the session persists → Verified in checkpoint step 16-19
4. Visiting a protected route while signed out redirects to the login page, not a 404 or unhandled error → Verified in checkpoint step 1-4
5. Prisma schema is deployed to Neon and the Auth.js session tables exist with rows after sign-in → Verified in checkpoint step 20-23
</verification>

<success_criteria>
All four AUTH requirements verified by human checkpoint:
- AUTH-01: Google OAuth sign-in completes successfully
- AUTH-02: auth_session cookie visible in DevTools with SameSite=Lax
- AUTH-03: Session persists across navigations; Session row exists in Neon
- AUTH-04: Unauthenticated requests redirect to /login
Phase 1 Foundation is complete and ready for Phase 2 (E-Commerce Shell).
</success_criteria>

<output>
After checkpoint approval, create `.planning/phases/01-foundation/01-03-SUMMARY.md` documenting:
- Confirmed working: AUTH-01, AUTH-02, AUTH-03, AUTH-04
- Google account used for testing
- Any issues encountered during verification and their resolutions
- Phase 1 complete — ready for Phase 2

Also update .planning/STATE.md:
- Phase 1 plan count: 3/3
- Last activity: today's date — Phase 1 complete
</output>
