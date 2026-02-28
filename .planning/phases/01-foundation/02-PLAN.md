---
phase: 01-foundation
plan: 02
type: execute
wave: 2
depends_on:
  - "01-PLAN"
files_modified:
  - src/lib/auth.ts
  - src/app/api/auth/[...nextauth]/route.ts
  - src/app/(auth)/login/page.tsx
  - proxy.ts
autonomous: true
requirements:
  - AUTH-01
  - AUTH-02
  - AUTH-04

must_haves:
  truths:
    - "Visiting /login shows a Google Sign-in button"
    - "Unauthenticated requests to any non-auth route redirect to /login"
    - "Session cookie is named auth_session (not authjs.session-token)"
    - "proxy.ts (not middleware.ts) handles route protection"
  artifacts:
    - path: "src/lib/auth.ts"
      provides: "Auth.js v5 config: Google provider, Prisma adapter, database sessions, auth_session cookie"
      exports: ["handlers", "auth", "signIn", "signOut"]
    - path: "src/app/api/auth/[...nextauth]/route.ts"
      provides: "OAuth callback handler for Google"
      exports: ["GET", "POST"]
    - path: "src/app/(auth)/login/page.tsx"
      provides: "Login page with Google OAuth sign-in button"
    - path: "proxy.ts"
      provides: "Route protection — redirects unauthenticated requests to /login"
  key_links:
    - from: "proxy.ts"
      to: "src/lib/auth.ts"
      via: "export { auth as proxy }"
      pattern: "auth as proxy"
    - from: "src/app/api/auth/[...nextauth]/route.ts"
      to: "src/lib/auth.ts"
      via: "import { handlers }"
      pattern: "handlers"
    - from: "src/lib/auth.ts"
      to: "lib/db.ts"
      via: "PrismaAdapter(prisma)"
      pattern: "PrismaAdapter"

user_setup:
  - service: google-oauth
    why: "OAuth 2.0 credentials for Google sign-in"
    env_vars:
      - name: AUTH_GOOGLE_ID
        source: "Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs -> your client -> Client ID"
      - name: AUTH_GOOGLE_SECRET
        source: "Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs -> your client -> Client Secret"
    dashboard_config:
      - task: "Add authorized redirect URI for local dev"
        location: "Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs -> your client -> Authorized redirect URIs"
        value: "http://localhost:3000/api/auth/callback/google"
  - service: auth-secret
    why: "Auth.js requires AUTH_SECRET for session signing"
    env_vars:
      - name: AUTH_SECRET
        source: "Run: npx auth secret — copies the generated value to .env.local automatically"
---

<objective>
Wire Auth.js v5 with the Google provider, Prisma adapter (using the schema from Plan 01), and custom cookie name. Create the OAuth route handler, login page, and proxy.ts route guard.

Purpose: Delivers AUTH-01 (Google OAuth sign-in), AUTH-02 (auth_session cookie readable in DevTools), and AUTH-04 (unauthenticated route protection). This plan builds on the database layer from Plan 01.
Output: A working Google OAuth flow with database-persisted sessions, protected routes, and the auth_session cookie.
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

<interfaces>
<!-- Key exports from Plan 01 that this plan depends on -->

From lib/db.ts:
```typescript
import { PrismaClient } from "@prisma/client"
export const prisma: PrismaClient   // singleton — import this in auth.ts
```

From prisma/schema.prisma (deployed to Neon):
```
model Session {
  id           String   @id
  sessionToken String   @unique   // This IS the auth_session cookie value
  userId       String
  expires      DateTime
  user         User
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Auth.js v5 config and OAuth route handler</name>
  <files>src/lib/auth.ts, src/app/api/auth/[...nextauth]/route.ts</files>
  <action>
    **Pre-check: Generate AUTH_SECRET**
    ```bash
    npx auth secret
    ```
    This writes `AUTH_SECRET=<value>` to `.env.local`. Verify it was written:
    ```bash
    grep "AUTH_SECRET" .env.local
    ```

    Also verify AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are set in .env.local (user must have filled them in). If empty, these are in user_setup — do not proceed with OAuth testing until set.

    **Create src/lib/auth.ts**

    Note: The research confirmed Auth.js v5 auto-infers `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` from env — do NOT manually pass them to Google(). The `session: { strategy: "database" }` is required for fingerprint binding in Phase 3.

    ```typescript
    // src/lib/auth.ts
    import NextAuth from "next-auth"
    import Google from "next-auth/providers/google"
    import { PrismaAdapter } from "@auth/prisma-adapter"
    import { prisma } from "@/lib/db"

    export const { handlers, auth, signIn, signOut } = NextAuth({
      adapter: PrismaAdapter(prisma),
      providers: [Google],
      session: { strategy: "database" },
      cookies: {
        sessionToken: {
          name: "auth_session",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: process.env.NODE_ENV === "production",
          },
        },
      },
      pages: {
        signIn: "/login",
      },
      callbacks: {
        authorized: async ({ auth }) => {
          // Returning true allows the request; false redirects to pages.signIn
          return !!auth
        },
      },
    })
    ```

    IMPORTANT: The `cookies.sessionToken.name: "auth_session"` is what satisfies AUTH-02. The `httpOnly: true` still allows DevTools Application panel visibility — httpOnly prevents JavaScript access, not DevTools. `SameSite=Lax` is correct for the cookie copy simulation (not Strict, which would block cross-site navigation).

    **Create src/app/api/auth/[...nextauth]/route.ts**

    The directory name must be `[...nextauth]` (square brackets included) — this is a Next.js catch-all route:
    ```typescript
    // src/app/api/auth/[...nextauth]/route.ts
    import { handlers } from "@/lib/auth"
    export const { GET, POST } = handlers
    ```

    Do NOT add any custom logic here — let Auth.js handle all OAuth callbacks.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - src/lib/auth.ts compiles without TypeScript errors
    - src/app/api/auth/[...nextauth]/route.ts compiles without errors
    - `npx tsc --noEmit` exits 0 (or only produces warnings, not errors)
    - AUTH_SECRET is set in .env.local (run `grep AUTH_SECRET .env.local`)
  </done>
</task>

<task type="auto">
  <name>Task 2: Create login page and proxy.ts route guard</name>
  <files>src/app/(auth)/login/page.tsx, proxy.ts</files>
  <action>
    **Create src/app/(auth)/login/page.tsx**

    The `(auth)` route group is a Next.js convention — the parentheses make it a layout group that does NOT affect the URL. The login page is accessible at `/login`, not `/auth/login`.

    ```tsx
    // src/app/(auth)/login/page.tsx
    import { signIn } from "@/lib/auth"

    export default function LoginPage() {
      return (
        <main className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="mb-2 text-center text-2xl font-semibold text-gray-900">
              Sentinel
            </h1>
            <p className="mb-8 text-center text-sm text-gray-500">
              Session hijack detection dashboard
            </p>
            <form
              action={async () => {
                "use server"
                await signIn("google", { redirectTo: "/" })
              }}
            >
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Sign in with Google
              </button>
            </form>
          </div>
        </main>
      )
    }
    ```

    **Create proxy.ts at the project root** (NOT in src/ — Next.js reads proxy.ts from the root):

    ```typescript
    // proxy.ts  (root of project, same level as package.json)
    // Source: Next.js 16 proxy.ts convention (renamed from middleware.ts)
    // Auth.js docs: https://authjs.dev/getting-started/session-management/protecting
    export { auth as proxy } from "@/lib/auth"

    export const config = {
      matcher: [
        /*
         * Match all request paths EXCEPT:
         * - api/auth (Auth.js OAuth routes — must be public)
         * - login (sign-in page — must be public)
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico
         */
        "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
      ],
    }
    ```

    Do NOT create middleware.ts. The Next.js 16 convention is proxy.ts. Creating both would cause unpredictable behavior.

    CRITICAL: The proxy imports `auth` from `@/lib/auth` (the configured instance with `auth_session` cookie name) — NOT from `next-auth` directly. This ensures the cookie name override in auth.ts is used for session lookup in the proxy. If `auth` were imported from `next-auth` directly, it would look for the default cookie name and fail to find the session.

    **Verify the proxy.ts path alias resolves**

    The `@/` alias in proxy.ts must resolve. Check tsconfig.json — it should have:
    ```json
    "paths": { "@/*": ["./src/*"] }
    ```
    If `lib/db.ts` is at `lib/db.ts` (not `src/lib/db.ts`), the alias won't resolve. Move `lib/db.ts` to `src/lib/db.ts` if needed, and update the import in `src/lib/auth.ts`.

    After moving files, update the import in `src/lib/auth.ts` if `lib/db.ts` moved to `src/lib/db.ts`.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20 && ls -la proxy.ts src/app/\(auth\)/login/page.tsx</automated>
  </verify>
  <done>
    - proxy.ts exists at project root (not in src/)
    - src/app/(auth)/login/page.tsx exists
    - `npx tsc --noEmit` exits 0
    - No middleware.ts exists (run `ls middleware.ts 2>&1` — should say "No such file")
    - `npm run dev` starts without errors; visiting http://localhost:3000/login shows the Sentinel login page with Google button
  </done>
</task>

</tasks>

<verification>
After both tasks complete, run `npm run dev` and verify manually:

```bash
# TypeScript clean compile
npx tsc --noEmit

# No middleware.ts (deprecated in Next.js 16)
ls middleware.ts 2>&1   # Should say: "ls: middleware.ts: No such file or directory"

# proxy.ts exists at root
ls -la proxy.ts         # Should show the file

# Auth route handler exists
ls "src/app/api/auth/[...nextauth]/route.ts"

# Login page exists
ls "src/app/(auth)/login/page.tsx"

# AUTH_SECRET is set
grep "AUTH_SECRET" .env.local | grep -v "^#" | grep -v '=""'
```
</verification>

<success_criteria>
- src/lib/auth.ts exports `{ handlers, auth, signIn, signOut }` from NextAuth with Google provider, Prisma adapter, database sessions, and auth_session cookie config
- proxy.ts at project root uses `export { auth as proxy }` from `@/lib/auth`
- No middleware.ts exists
- Login page renders at /login with Google sign-in button
- `npx tsc --noEmit` is clean
- AUTH_SECRET is set in .env.local
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-02-SUMMARY.md` documenting:
- Auth.js config structure
- Cookie name configured as auth_session
- proxy.ts matcher pattern used
- Any TypeScript issues encountered and resolved
- Whether AUTH_GOOGLE_ID/SECRET were set (or left for checkpoint)
</output>
