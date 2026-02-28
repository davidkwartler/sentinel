# Phase 1: Foundation - Research

**Researched:** 2026-02-28
**Domain:** Google OAuth, Auth.js v5, Prisma, Neon/Postgres, Next.js 16 route protection
**Confidence:** HIGH (npm version checks + official docs verified via WebFetch/WebSearch)

---

## Summary

Phase 1 establishes the authentication and database layer that all subsequent phases depend on. The goal is: user signs in with Google, lands on a protected page, the `auth_session` cookie is visible in DevTools, and navigating between protected pages does not trigger re-authentication. Unauthenticated access to protected routes must redirect to login. All session state must be persisted to a Neon Postgres database via Prisma.

The stack is Next.js 16 (current stable, not 15), Auth.js v5 (still in beta at `5.0.0-beta.30` — no stable release yet), Prisma 7 with the `@auth/prisma-adapter`, and Neon Postgres accessed via `DATABASE_URL` (pooled). The critical version surprise is that Next.js moved from v15 to v16 stable, and with it, `middleware.ts` was renamed to `proxy.ts` and now **defaults to the Node.js runtime** (not Edge). This changes two prior architecture assumptions: (1) the file is now `proxy.ts`, not `middleware.ts`; and (2) the runtime constraint that previously prevented database access in middleware no longer applies by default — though the proxy layer should still be kept thin for performance reasons.

Auth.js v5 remains in beta but is considered production-stable by the maintainers and explicitly supports Next.js 16 (`peerDependencies: next: "^14.0.0-0 || ^15.0.0 || ^16.0.0"`). The Google provider now uses `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` env var names (not `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). The session cookie name can be customized to `auth_session` via the `cookies.sessionToken.name` config option. Database sessions are required for this project (fingerprint binding requires mutable server state) and are supported by the `@auth/prisma-adapter`.

**Primary recommendation:** Scaffold with `create-next-app@latest` (which produces Next.js 16), install `next-auth@beta`, configure the Prisma adapter for database sessions, rename the cookie to `auth_session`, and use `proxy.ts` (not `middleware.ts`) for route protection.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can sign in via Google OAuth | Auth.js v5 Google provider with `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`; database sessions via Prisma adapter |
| AUTH-02 | Session cookie named `auth_session` is readable in DevTools Application panel (SameSite=Lax; enables manual cookie copy for simulation) | `cookies.sessionToken.name: "auth_session"` in Auth.js config; `SameSite=Lax` is the default and correct setting; HttpOnly=true still allows DevTools visibility |
| AUTH-03 | Session persists across page navigations without re-authenticating | Database sessions (not JWT) stored in Neon via Prisma; Auth.js handles token refresh automatically |
| AUTH-04 | Unauthenticated requests to protected routes are redirected to the login page | `proxy.ts` with Auth.js `authorized` callback; matcher excludes auth routes and static assets |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.1.6 | Full-stack React framework, App Router, Route Handlers | Current stable release; Turbopack by default; requires Node.js 20.9+; React 19 peer dep |
| react / react-dom | 19.x | UI runtime | Next.js 16 peer dep; React 19.2 is the canary used internally |
| typescript | 5.x | Type safety | Next.js 16 requires TypeScript 5.1+ minimum; scaffolded by default |
| next-auth | 5.0.0-beta.30 | Google OAuth, session management, Prisma adapter integration | Still in beta but stable enough for production; explicitly supports Next.js 16; database session strategy needed for fingerprint binding |
| @auth/prisma-adapter | 2.11.1 | Connects Auth.js v5 to Prisma ORM | Official adapter; creates Account, Session, User, VerificationToken tables; compatible with Prisma 6/7 |
| prisma | 7.4.2 | ORM, schema migrations | Type-safe queries, migration tooling; Auth.js Prisma adapter requires it; Prisma 7 is current stable |
| @prisma/client | 7.4.2 | Runtime Prisma client | Required alongside prisma dev dep |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.3.6 | Runtime schema validation | Validate env vars at startup; validate session data shapes in Route Handlers |
| tailwindcss | 4.2.1 | Utility CSS | Next.js 16 scaffolds Tailwind v4 by default now; use it for the login page and nav shell |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-auth@beta (Auth.js v5) | better-auth | Better Auth is now the recommended successor as Auth.js is merging into Better Auth; however, Auth.js v5 is still actively maintained and has the Prisma adapter and Google provider ready today. Better Auth is a viable alternative but has a steeper migration path for developers familiar with NextAuth. |
| next-auth@beta (Auth.js v5) | next-auth@4 (latest stable 4.24.13) | v4 works but is not designed for Next.js 16 App Router and does not support `proxy.ts`; AUTH-SECRET env var naming is different; migration debt is inevitable |
| Neon via DATABASE_URL | @vercel/postgres | `@vercel/postgres` is deprecated (0.10.0 is its last release); Neon native integration now provides `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` directly |
| Prisma | Drizzle ORM | Drizzle is lighter and TypeScript-native; Auth.js v5 has a Drizzle adapter but Prisma adapter is more mature; Prisma is the safer choice for Auth.js v5 compatibility |

**Installation:**
```bash
npx create-next-app@latest sentinel --typescript --tailwind --eslint --app --src-dir
npm install next-auth@beta @auth/prisma-adapter
npm install prisma @prisma/client zod
npm install -D prisma
npx prisma init
npx auth secret
```

---

## Architecture Patterns

### Recommended Project Structure

```
sentinel/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # Google OAuth sign-in page with signIn() call
│   ├── (shop)/                   # Route group for protected e-commerce pages
│   │   └── layout.tsx            # Phase 2+ will add FingerprintReporter here
│   └── api/
│       └── auth/
│           └── [...nextauth]/
│               └── route.ts      # Auth.js route handler (handlers.GET, handlers.POST)
├── lib/
│   ├── auth.ts                   # NextAuth config: Google provider, Prisma adapter, cookie config
│   └── db.ts                     # Prisma client singleton (prevent multiple instances in dev)
├── prisma/
│   └── schema.prisma             # Auth.js required tables + Sentinel extension columns
├── proxy.ts                      # Auth gate: authorized callback + matcher (NOT middleware.ts)
└── .env.local                    # Local dev only — never committed
```

### Pattern 1: Auth.js v5 Configuration with Database Sessions and Custom Cookie

**What:** Single `auth.ts` file that configures Google provider, Prisma adapter (database sessions), and the `auth_session` cookie name override.

**When to use:** Always — this is the central config consumed by `proxy.ts`, Route Handlers, and Server Components.

**Example:**
```typescript
// lib/auth.ts
// Source: https://authjs.dev/getting-started/installation + https://authjs.dev/reference/nextjs#cookies
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
})
```

### Pattern 2: proxy.ts for Route Protection (Next.js 16 Pattern)

**What:** `proxy.ts` (renamed from `middleware.ts` in Next.js 16) with Auth.js `authorized` callback. The proxy runs in Node.js runtime by default in Next.js 16 — no more Edge Runtime constraint on this file.

**When to use:** Always. This is the single point where unauthenticated requests are intercepted and redirected to `/login`.

**Example:**
```typescript
// proxy.ts
// Source: https://authjs.dev/getting-started/session-management/protecting
export { auth as proxy } from "@/lib/auth"

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
}
```

For custom redirect logic (if the simple re-export isn't sufficient):
```typescript
// proxy.ts (advanced version)
import { auth } from "@/lib/auth"

export const proxy = auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== "/login") {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    return Response.redirect(loginUrl)
  }
})

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
}
```

**Critical:** Auth.js docs use `export { auth as proxy }` to match the new Next.js 16 `proxy` function naming convention. The old `export { auth as middleware }` pattern still works due to backward compatibility but generates deprecation warnings.

### Pattern 3: Prisma Client Singleton

**What:** Export a single Prisma client instance from `lib/db.ts` to prevent multiple connections during Next.js hot reload in development.

**When to use:** Always — without this, hot reload creates a new PrismaClient on every module evaluation.

**Example:**
```typescript
// lib/db.ts
// Source: https://authjs.dev/getting-started/adapters/prisma
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
```

### Pattern 4: Auth.js Prisma Schema

**What:** The minimum Prisma schema that satisfies Auth.js adapter requirements. Extended in later phases with `Fingerprint` and `DetectionEvent` models.

**When to use:** Phase 1. Later phases add models but never modify the Auth.js-required tables (to avoid migration conflicts).

**Example:**
```prisma
// prisma/schema.prisma
// Source: https://authjs.dev/getting-started/adapters/prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // Sentinel-specific columns added here in Phase 3+:
  // flagged          Boolean  @default(false)
  // confidenceScore  Int?
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

**Important:** The `Session.sessionToken` column is the value stored in the `auth_session` cookie. Never expose this value in API responses.

### Pattern 5: Auth.js Route Handler

**What:** The catch-all route that handles all OAuth callbacks, sign-in/sign-out actions.

**Example:**
```typescript
// app/api/auth/[...nextauth]/route.ts
// Source: https://authjs.dev/getting-started/installation
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

### Pattern 6: Login Page with Server Action

**What:** A login page that triggers the Google OAuth flow via Auth.js `signIn()` server action.

**Example:**
```tsx
// app/(auth)/login/page.tsx
import { signIn } from "@/lib/auth"

export default function LoginPage() {
  return (
    <form
      action={async () => {
        "use server"
        await signIn("google", { redirectTo: "/" })
      }}
    >
      <button type="submit">Sign in with Google</button>
    </form>
  )
}
```

### Anti-Patterns to Avoid

- **Using `middleware.ts` instead of `proxy.ts`:** In Next.js 16, `middleware.ts` is deprecated. It still works but generates console warnings. Rename to `proxy.ts` from the start.
- **Using `next-auth@4` (latest stable) with Next.js 16:** v4 is the latest stable release on the `latest` tag but is not compatible with Next.js 16's App Router patterns. Always install `next-auth@beta` for v5.
- **Using `GOOGLE_CLIENT_ID` env var name:** Auth.js v5 auto-infers `AUTH_GOOGLE_ID` (not `GOOGLE_CLIENT_ID`). The old naming requires manual configuration.
- **Using `NEXTAUTH_SECRET` instead of `AUTH_SECRET`:** v5 uses `AUTH_SECRET` (not `NEXTAUTH_SECRET`). `npx auth secret` generates the correct variable name.
- **Using `NEXTAUTH_URL` in production:** Auth.js v5 uses `AUTH_URL` (or auto-detects on Vercel). `NEXTAUTH_URL` is a v4 convention.
- **Storing `sessionToken` in API responses:** The `Session.sessionToken` value IS the auth cookie — returning it from any API endpoint is equivalent to exposing the cookie value. Always omit it from query responses.
- **Using `@vercel/postgres` package:** This package is deprecated (v0.10.0 final). Use Neon's native integration which provides `DATABASE_URL` directly.
- **Using JWT sessions instead of database sessions:** JWT sessions cannot be enriched with fingerprint data server-side without decoding on every request. Phase 3 will need to write `fingerprintId` to the Session row — database sessions are required.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Google OAuth flow | Custom OAuth redirect/callback handler | Auth.js v5 Google provider | OAuth PKCE, state parameter, CSRF, token exchange — all handled. Missing state validation is a common security bug in manual implementations. |
| Session cookie management | Custom cookie read/write logic | Auth.js `cookies.sessionToken` config | Cookie chunking (4KB limit), SameSite/Secure flags per environment, cookie rotation — all handled by Auth.js |
| Database session persistence | Custom session table and CRUD | `@auth/prisma-adapter` | Adapter creates all required tables with correct foreign keys, cascade deletes, and unique constraints |
| JWT validation in proxy | Custom Web Crypto JWT decode | Auth.js `auth()` export used as proxy | Auth.js `auth()` handles session token lookup (database session = DB lookup, not JWT decode) in proxy |
| Prisma schema for auth tables | Custom User/Account/Session models | Auth.js adapter schema (copy-paste) | Adapter expects specific field names and relations; deviating causes runtime errors |

**Key insight:** Auth.js handles the entire OAuth security surface — state parameters, PKCE, token rotation, session cookie flags, and database adapter wiring. Hand-rolling any of these is days of work and produces worse security posture.

---

## Common Pitfalls

### Pitfall 1: `middleware.ts` vs `proxy.ts` Confusion

**What goes wrong:** Developer scaffolds project, creates `middleware.ts` as documented in older tutorials, gets deprecation warnings or the wrong behavior.

**Why it happens:** The rename to `proxy.ts` is new in Next.js 16. All tutorials from 2025 and earlier reference `middleware.ts`. Even some Auth.js docs show the old pattern.

**How to avoid:** Always create `proxy.ts`. Run the codemod if starting from existing code: `npx @next/codemod@canary middleware-to-proxy .`

**Warning signs:** Console warning about deprecated `middleware` convention on `next dev` startup.

---

### Pitfall 2: `next-auth` Latest Tag Installs v4, Not v5

**What goes wrong:** `npm install next-auth` installs `4.24.13` (latest stable). The project uses v5 patterns (no `authOptions`, different imports, different env vars) and nothing works.

**Why it happens:** npm's `latest` tag points to the last stable release, which is v4. v5 is on the `beta` tag.

**How to avoid:** Always install `npm install next-auth@beta`. Confirm the version is `5.0.0-beta.x` after install.

**Warning signs:** `import { authOptions } from "@/lib/auth"` — this is a v4 pattern. v5 exports `{ handlers, auth, signIn, signOut }`.

---

### Pitfall 3: Cookie Name Override Breaks Proxy Session Detection

**What goes wrong:** Renaming the session cookie to `auth_session` causes the Auth.js proxy helper to fail to detect the session, because it looks for the default cookie name.

**Why it happens:** Auth.js proxy reads the session cookie by name. If the cookie name is customized in `auth.ts` but the proxy uses the default name lookup, it finds nothing and redirects everyone to login.

**How to avoid:** When using `cookies.sessionToken.name: "auth_session"` in `auth.ts`, the `auth()` export used in `proxy.ts` reads from the same config object — as long as both proxy and config come from the same `lib/auth.ts` import, the name is automatically consistent. Do not configure the cookie name in multiple places.

**Warning signs:** Every page redirects to `/login` even after successful OAuth sign-in. Check that `proxy.ts` imports `auth` from `@/lib/auth` (the configured instance), not directly from `next-auth`.

---

### Pitfall 4: `AUTH_SECRET` Not Set in Production

**What goes wrong:** Auth.js works in local development without `AUTH_SECRET` (it uses a default) but fails silently in production (Vercel), causing all sessions to be invalid.

**Why it happens:** Auth.js generates a random secret for development if `AUTH_SECRET` is not set. In production, it requires the secret to be set or throws an error. The error may not surface clearly.

**How to avoid:** Run `npx auth secret` before any deployment. This generates a secure `AUTH_SECRET` value. Set it in Vercel environment variables. Verify the Vercel deployment logs show no auth configuration errors.

**Warning signs:** OAuth sign-in completes but user is immediately redirected back to login. `AUTH_SECRET` missing error in Vercel function logs.

---

### Pitfall 5: `DATABASE_URL` vs `DATABASE_URL_UNPOOLED` for Prisma Migrations

**What goes wrong:** Neon provides two connection strings: `DATABASE_URL` (pooled via PgBouncer) and `DATABASE_URL_UNPOOLED` (direct). Prisma migrations MUST use the direct connection (unpooled); the pooled connection does not support the `BEGIN`/`COMMIT` transactions required by `prisma migrate deploy`.

**Why it happens:** Developers set only `DATABASE_URL` and run `prisma migrate deploy`. The migration fails with a cryptic transaction error.

**How to avoid:** Configure both in `schema.prisma`:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")       // pooled — used by app at runtime
  directUrl = env("DATABASE_URL_UNPOOLED") // direct — used by Prisma CLI for migrations
}
```
Set both env vars in Vercel and in `.env.local`.

**Warning signs:** `Error: can't use an implicit transaction` during `prisma migrate deploy` on Vercel.

---

### Pitfall 6: Google OAuth Callback URL Misconfigured

**What goes wrong:** OAuth works locally but fails on Vercel with a redirect_uri_mismatch error from Google.

**Why it happens:** The Google Cloud Console OAuth app has an Authorized Redirect URI that must exactly match the callback URL. The local URL (`http://localhost:3000/api/auth/callback/google`) and the Vercel URL (`https://your-app.vercel.app/api/auth/callback/google`) must both be registered.

**How to avoid:** In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs, add BOTH:
- `http://localhost:3000/api/auth/callback/google` (local dev)
- `https://your-app.vercel.app/api/auth/callback/google` (production)

**Warning signs:** `redirect_uri_mismatch` error on the Google OAuth consent screen during Vercel deployment testing.

---

### Pitfall 7: Node.js Version Requirement (Next.js 16)

**What goes wrong:** Build fails with Node.js version incompatibility.

**Why it happens:** Next.js 16 requires Node.js 20.9.0 minimum. Node 18 is no longer supported.

**How to avoid:** Verify local Node.js version with `node --version`. Set Node.js 20 in Vercel project settings (Settings → General → Node.js Version).

**Warning signs:** Build error mentioning Node.js version requirement during `npm run build`.

---

## Code Examples

Verified patterns from official sources:

### Auth.js v5 Initialization with Google Provider

```typescript
// lib/auth.ts
// Source: https://authjs.dev/getting-started/providers/google
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
      return !!auth
    },
  },
})
```

### proxy.ts for Route Protection

```typescript
// proxy.ts
// Source: https://authjs.dev/getting-started/session-management/protecting
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
export { auth as proxy } from "@/lib/auth"

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
}
```

### Auth.js Route Handler

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

### Session Access in Server Component

```typescript
// Any Server Component or Route Handler
import { auth } from "@/lib/auth"

export default async function ProtectedPage() {
  const session = await auth()
  if (!session) {
    // This shouldn't happen if proxy.ts is configured correctly
    redirect("/login")
  }
  return <div>Hello {session.user?.name}</div>
}
```

### Environment Variables (Phase 1 only)

```bash
# .env.local (never committed)
AUTH_SECRET=<generated by npx auth secret>
AUTH_GOOGLE_ID=<from Google Cloud Console>
AUTH_GOOGLE_SECRET=<from Google Cloud Console>
DATABASE_URL=<Neon pooled connection string>
DATABASE_URL_UNPOOLED=<Neon direct connection string>
```

Note: `AUTH_URL` (equivalent to old `NEXTAUTH_URL`) is auto-detected on Vercel. Set it in `.env.local` for local dev if needed: `AUTH_URL=http://localhost:3000`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` (Node.js runtime by default) | Next.js 16 (Dec 2025) | File must be renamed; Edge Runtime no longer default; import needs update for Auth.js integration |
| `NEXTAUTH_SECRET` env var | `AUTH_SECRET` env var | Auth.js v5 | Wrong var name causes production auth failure |
| `NEXTAUTH_URL` env var | `AUTH_URL` env var (auto-detected on Vercel) | Auth.js v5 | Less configuration needed; only set for local dev |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Auth.js v5 | Auto-inferred from `AUTH_` prefix convention |
| `import { authOptions } from "@/lib/auth"` | `export const { handlers, auth, signIn, signOut } = NextAuth(...)` | Auth.js v5 | Entire import pattern changed |
| `getServerSession(authOptions)` | `await auth()` | Auth.js v5 | Simpler, no need to pass authOptions |
| `@vercel/postgres` package | Neon native integration with `DATABASE_URL` | Vercel deprecated `@vercel/postgres` | Use `DATABASE_URL` directly; `@vercel/postgres` package is at end-of-life (v0.10.0) |
| Next.js 15 App Router | Next.js 16 App Router (stable) | Dec 2025 | Turbopack default; `cacheComponents`; async-only Dynamic APIs |

**Deprecated/outdated:**
- `next-auth@4`: Still maintained at 4.24.13 but not designed for Next.js 16; use `next-auth@beta` (v5)
- `@vercel/postgres`: End-of-life; use Neon native integration
- `middleware.ts`: Deprecated in Next.js 16; rename to `proxy.ts`
- `withAuth` from `next-auth/middleware`: v4 pattern; in v5 use `export { auth as proxy }`

---

## Open Questions

1. **Auth.js v5 stable release**
   - What we know: v5 is at `5.0.0-beta.30`; the Auth.js project is merging into Better Auth; the maintainers say it's "stable enough for production"
   - What's unclear: Whether Better Auth will eventually absorb the `next-auth` package name; whether v5 will ever have a formal stable tag or the beta will be maintained indefinitely
   - Recommendation: Use `next-auth@beta` (v5) for this project; pin the exact version to avoid breaking changes between beta releases; check https://github.com/nextauthjs/next-auth/releases before starting

2. **proxy.ts and Auth.js `authorized` callback — does it do a DB lookup?**
   - What we know: Database sessions require a DB lookup to validate; proxy.ts now runs in Node.js runtime so Prisma CAN be called; the official Auth.js pattern uses `export { auth as proxy }` which triggers session validation on every request
   - What's unclear: Whether Auth.js's proxy integration does a full DB lookup on every proxied request (which would slow every page load) or uses a lightweight cookie check
   - Recommendation: Use the simple `export { auth as proxy }` pattern; if performance is a concern, test with `authorized: async ({ auth }) => !!auth` which may use a cached session

3. **Neon connection string variable names in current Vercel integration**
   - What we know: Neon native integration provides `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct); old `@vercel/postgres` used `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING`
   - What's unclear: Whether the Vercel-managed Neon integration (vs Neon-managed integration) uses the same variable names
   - Recommendation: Check the actual env vars injected by the Vercel Neon integration after connecting; configure `schema.prisma` to match

---

## Sources

### Primary (HIGH confidence)

- `npm show next-auth dist-tags` — confirmed v5 is `5.0.0-beta.30` (beta tag), latest stable is `4.24.13`
- `npm show next dist-tags` — confirmed Next.js latest stable is `16.1.6`
- `npm show @auth/prisma-adapter version` — confirmed `2.11.1`
- `npm show prisma version` — confirmed `7.4.2`
- `npm show @anthropic-ai/sdk version` — confirmed `0.78.0` (for later phases)
- https://nextjs.org/docs/app/guides/upgrading/version-16 — official upgrade guide; confirmed `middleware.ts` → `proxy.ts` rename; Node.js runtime default for proxy; Node.js 20.9+ requirement
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy — official proxy.ts API reference; confirmed Node.js runtime by default; `waitUntil` available
- https://authjs.dev/getting-started/installation — confirmed installation command `npm install next-auth@beta`; `AUTH_SECRET` env var; `npx auth secret` generator
- https://authjs.dev/getting-started/providers/google — confirmed `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` env var names
- https://authjs.dev/getting-started/adapters/prisma — confirmed Prisma adapter schema; singleton pattern; `DATABASE_URL` + `DATABASE_URL_UNPOOLED` config
- https://authjs.dev/getting-started/session-management/protecting — confirmed `export { auth as proxy }` pattern for Next.js 16; `authorized` callback pattern
- https://authjs.dev/reference/nextjs#cookies — confirmed `cookies.sessionToken.name` config for custom cookie name

### Secondary (MEDIUM confidence)

- https://neon.com/docs/guides/vercel-overview — Neon/Vercel integration provides `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct)
- https://github.com/nextauthjs/next-auth/discussions/13252 — Auth.js merging into Better Auth; v5 beta stable for production use confirmed by maintainers

### Tertiary (LOW confidence)

- WebSearch results on Next.js 16 and Auth.js v5 patterns — some community articles; cross-referenced with official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm; core packages confirmed via official docs
- Architecture: HIGH — proxy.ts behavior confirmed from official Next.js 16 upgrade guide and proxy.ts API reference
- Pitfalls: HIGH — mostly derived from official docs and confirmed version changes; cookie name pitfall is verified from authjs.dev reference

**Research date:** 2026-02-28
**Valid until:** 2026-04-01 (next-auth@beta moves fast; re-verify beta version before starting implementation)
