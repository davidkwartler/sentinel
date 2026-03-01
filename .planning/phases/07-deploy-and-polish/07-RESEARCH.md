# Phase 7: Deploy and Polish - Research

**Researched:** 2026-02-28
**Domain:** Vercel production deployment, README documentation, hijack simulation walkthrough, unit/integration test infrastructure (Vitest + Prisma mocks)
**Confidence:** HIGH (official docs verified for Auth.js v5 on Vercel, Next.js Vitest setup, Prisma mocking patterns)

---

## Summary

Phase 7 has four distinct work streams: (1) Vercel production deployment with correct environment variable configuration, (2) a complete README rewrite with .env.local template and architecture overview, (3) a step-by-step hijack simulation walkthrough usable by anyone, and (4) a unit/integration test suite using Vitest. There are no new v1 requirements to satisfy — this phase validates and documents the fully assembled system.

The project already deploys to Vercel (postinstall script, @vercel/analytics, @vercel/speed-insights are already installed) and the .env and .env.local files show the environment variables that need to be confirmed as Vercel env vars. The README.md at the repo root is currently the default create-next-app stub and needs to be completely replaced. There are zero existing test files — the test infrastructure is a greenfield setup.

The highest-risk item is the Auth.js v5 / NextAuth v5 environment variable naming. The project uses `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (visible in .env) rather than the older `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` naming — this is the v5 convention. The success criteria in the ROADMAP still reference the older naming (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`), so the phase must reconcile the actual variable names in use vs. what the roadmap documents. Auth.js v5 on Vercel does NOT require `NEXTAUTH_URL` — it infers the URL from the `VERCEL` system env var automatically.

**Primary recommendation:** Work in four focused plans: (1) Vercel env var audit + production smoke test, (2) README rewrite, (3) Vitest infrastructure + pure unit tests (computeSimilarity, runDetection with mocked prisma), (4) route handler and auth guard integration tests.

---

## Standard Stack

### Core (already in project — no new installs except test tooling)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vercel CLI / Dashboard | N/A | Production deployment, env var management | Project constraint — already deployed |
| Auth.js v5 (`next-auth@^5`) | ^5.0.0-beta.30 | Google OAuth, session cookie | Already in use; v5 auto-infers URL on Vercel |
| Prisma 7 | ^7.4.2 | Database ORM | Already in use |
| Next.js | 16.1.6 | Framework | Already in use |

### Test Infrastructure (new — greenfield)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | latest (^3.x) | Test runner | Official Next.js recommended test runner; faster than Jest; ESM-native; works with TypeScript without extra config |
| @vitejs/plugin-react | latest | Vite React plugin for JSX transform | Required for Vitest + React component tests |
| jsdom | latest | Browser DOM environment for Vitest | Enables testing React components without a real browser |
| @testing-library/react | latest | React component testing utilities | Standard companion to Vitest for UI tests |
| @testing-library/dom | latest | DOM query utilities | Peer dep of @testing-library/react |
| vite-tsconfig-paths | latest | Resolves `@/` path alias in tests | Without this, imports like `@/lib/detection` fail in Vitest |
| vitest-mock-extended | latest | Deep mock of Prisma Client | Enables type-safe Prisma mocking without a real database; the Vitest-native analog to jest-mock-extended |

**Installation:**
```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths vitest-mock-extended
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vitest | Jest + ts-jest | Jest requires more config for ESM and TypeScript; Next.js official docs recommend Vitest for new projects; no benefit here |
| vitest-mock-extended | Manual mock objects | Manual mocks don't get Prisma type checking; vitest-mock-extended gives full type-safe deep mocks with one import |
| jsdom | happy-dom | happy-dom is 2-3x faster but has edge cases with some DOM APIs; jsdom is the official Next.js docs recommendation |

---

## Architecture Patterns

### Recommended Project Structure (test files)

```
/Users/davidkwartler/sentinel/
├── vitest.config.mts          # Vitest config (new)
├── src/
│   └── lib/
│       └── __tests__/         # Unit tests (new)
│           ├── detection.test.ts
│           └── claude.test.ts
│   └── app/
│       └── api/
│           └── session/
│               └── record/
│                   └── __tests__/   # Route handler tests (new)
│                       └── route.test.ts
├── README.md                  # Full rewrite (already exists, stub only)
└── .env.local.example         # New: .env template for README
```

### Pattern 1: Vitest Config for Next.js App Router

**What:** `vitest.config.mts` at the project root — the file Vitest looks for by default.
**When to use:** Always. This is the required entry point.

```typescript
// vitest.config.mts
// Source: https://nextjs.org/docs/app/guides/testing/vitest (last updated 2026-02-27)
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

Key points:
- `tsconfigPaths()` resolves `@/lib/detection` imports correctly — without it every test import breaks
- `environment: 'jsdom'` is required for any test that renders React components
- `globals: true` makes `describe`, `it`, `expect` available without explicit imports (optional but convenient)

### Pattern 2: Prisma Mock Singleton for Unit Tests

**What:** A shared `__mocks__/db.ts` file that replaces `src/lib/db.ts` with a deep mock during tests. This is the standard pattern from Prisma's official testing documentation adapted for Vitest.
**When to use:** Any test that imports code which calls `prisma.xxx` — including `runDetection` and route handlers.

```typescript
// src/lib/__mocks__/db.ts
// Source: https://www.prisma.io/docs/orm/prisma-client/testing/unit-testing (Prisma docs, adapted for vitest-mock-extended)
import { vi } from 'vitest'
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@/generated/prisma/client'

// Auto-hoisted: vi.mock replaces the real module before any test imports it
vi.mock('@/lib/db', () => ({
  prisma: mockDeep<PrismaClient>(),
}))

// Import the mocked module — TypeScript knows the shape
import { prisma } from '@/lib/db'

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>

// Reset all mocks before each test to avoid state leakage
beforeEach(() => {
  mockReset(prismaMock)
})
```

**Usage in test file:**
```typescript
// src/lib/__tests__/detection.test.ts
import { describe, it, expect } from 'vitest'
import { prismaMock } from '../__mocks__/db'
import { computeSimilarity, runDetection } from '../detection'

describe('computeSimilarity', () => {
  it('returns 1.0 when all four components match', () => {
    const result = computeSimilarity(
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' },
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' }
    )
    expect(result).toBe(1.0)
  })

  it('returns 0.0 when all four components differ', () => {
    const result = computeSimilarity(
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' },
      { os: 'Windows', browser: 'Firefox', screenRes: '1366x768', timezone: 'Europe/London' }
    )
    expect(result).toBe(0.0)
  })

  it('treats both-null as a match (0.25 contribution)', () => {
    const result = computeSimilarity(
      { os: null, browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' },
      { os: null, browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' }
    )
    expect(result).toBe(1.0) // both null = match on all 4
  })

  it('treats one-side-null as inconclusive (0 contribution)', () => {
    const result = computeSimilarity(
      { os: 'Mac OS', browser: null, screenRes: null, timezone: null },
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' }
    )
    expect(result).toBe(0.25) // only os matches, browser/screenRes/timezone are inconclusive
  })
})

describe('runDetection', () => {
  it('returns detected:false when no original fingerprint exists', async () => {
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock))
    prismaMock.fingerprint.findFirst.mockResolvedValue(null)

    const result = await runDetection({
      sessionId: 'sess-1',
      newVisitorId: 'fp-new',
      newIp: '1.2.3.4',
    })
    expect(result.detected).toBe(false)
  })

  it('returns detected:false when visitorId matches original', async () => {
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock))
    prismaMock.fingerprint.findFirst.mockResolvedValue({
      id: 'fp-1', visitorId: 'fp-same', sessionId: 'sess-1',
      requestId: 'req-1', ip: '1.2.3.4', userAgent: null,
      os: null, browser: null, screenRes: null, timezone: null,
      isOriginal: true, createdAt: new Date(),
    })

    const result = await runDetection({
      sessionId: 'sess-1',
      newVisitorId: 'fp-same', // same as original
      newIp: '1.2.3.4',
    })
    expect(result.detected).toBe(false)
  })

  it('returns detected:true and creates DetectionEvent on mismatch', async () => {
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock))
    prismaMock.fingerprint.findFirst.mockResolvedValue({
      id: 'fp-1', visitorId: 'fp-original', sessionId: 'sess-1',
      requestId: 'req-1', ip: '1.2.3.4', userAgent: null,
      os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York',
      isOriginal: true, createdAt: new Date(),
    })
    prismaMock.detectionEvent.create.mockResolvedValue({
      id: 'event-1', createdAt: new Date(), sessionId: 'sess-1',
      originalVisitorId: 'fp-original', newVisitorId: 'fp-new',
      originalIp: '1.2.3.4', newIp: '9.9.9.9',
      similarityScore: 0.0, status: 'PENDING',
      confidenceScore: null, reasoning: null,
    })

    const result = await runDetection({
      sessionId: 'sess-1',
      newVisitorId: 'fp-new',
      newIp: '9.9.9.9',
      os: 'Windows', browser: 'Firefox', screenRes: '1366x768', timezone: 'Europe/London',
    })
    expect(result.detected).toBe(true)
    expect(result.eventId).toBe('event-1')
    expect(prismaMock.detectionEvent.create).toHaveBeenCalledOnce()
  })
})
```

### Pattern 3: Route Handler Response Shape Testing

**What:** Testing the `/api/session/record` route handler by mocking `auth()`, `prisma`, and `runDetection` — verifying the HTTP response shape and status codes.
**When to use:** Route handler tests. These are integration tests (test the handler with mocked dependencies, not a real HTTP server).

**Key constraint:** Next.js Route Handlers cannot be easily imported and executed in Vitest without mocking `next/server`. The approach is to mock the modules the handler depends on and call the handler function directly.

```typescript
// src/app/api/session/record/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies before importing the handler
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: mockDeep<PrismaClient>() }))
vi.mock('@/lib/detection', () => ({ runDetection: vi.fn() }))

import { POST } from '../route'
import { auth } from '@/lib/auth'

describe('POST /api/session/record', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null)
    const request = new NextRequest('http://localhost/api/session/record', {
      method: 'POST',
      body: JSON.stringify({ visitorId: 'fp-1', requestId: 'req-1' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('returns 400 for invalid payload', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const request = new NextRequest('http://localhost/api/session/record', {
      method: 'POST',
      body: JSON.stringify({ visitorId: '' }), // invalid: empty string
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
```

### Pattern 4: Auth.js v5 Environment Variables on Vercel

**What:** The exact env var names Auth.js v5 expects, and what Vercel handles automatically.
**Why critical:** The success criteria reference `GOOGLE_CLIENT_ID` / `NEXTAUTH_SECRET` — these are v4 names. The actual codebase uses the v5 names `AUTH_GOOGLE_ID` / `AUTH_SECRET`. The README and env template must use the correct v5 names.

Confirmed from the Auth.js v5 deployment docs (https://authjs.dev/getting-started/deployment):

| Variable | Required | Notes |
|----------|----------|-------|
| `AUTH_SECRET` | YES — always | Encrypts cookies and tokens. Generate with `npm exec auth secret`. This is `NEXTAUTH_SECRET` renamed in v5. |
| `AUTH_GOOGLE_ID` | YES | The Google OAuth Client ID. This is `GOOGLE_CLIENT_ID` renamed in v5. |
| `AUTH_GOOGLE_SECRET` | YES | The Google OAuth Client Secret. This is `GOOGLE_CLIENT_SECRET` renamed in v5. |
| `NEXTAUTH_URL` | NO on Vercel | Auth.js v5 infers the URL from the `VERCEL` system env var automatically. Do NOT set this on Vercel — it can cause conflicts. Set it only for local dev as `http://localhost:3000`. |
| `AUTH_TRUST_HOST` | NO on Vercel | Automatically inferred from the `VERCEL` env var. |
| `AUTH_URL` | NO (v5) | Mostly unnecessary in v5 — host inferred from request headers. |

**Verified environment variables visible in .env.local** (keys only, from grep output):
- `DATABASE_URL` (and many Neon Postgres aliases: `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, etc.)
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `NEXT_PUBLIC_FINGERPRINT_API_KEY`
- `ANTHROPIC_API_KEY`

**Missing from what was found in the env files:**
- `ANTHROPIC_MODEL` — not in the env file (the code defaults to `claude-sonnet-4-6` in `src/lib/claude.ts` if absent, so this is optional but should be documented)
- `NEXT_PUBLIC_FINGERPRINT_TTL_MS` — referenced in FingerprintReporter.tsx, defaults to 1,800,000ms (30min) if absent

### Pattern 5: .env.local Template for README

The following is the complete .env.local template based on all variables the codebase references:

```bash
# ============================================================
# Sentinel — Local Development Environment Variables
# Copy this file to .env.local and fill in your values.
# NEVER commit .env.local to git.
# ============================================================

# ---- Database (Neon PostgreSQL) ----------------------------
# Get from: https://console.neon.tech — create a project,
# copy the "Connection string" (pooled) from the dashboard.
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# ---- Authentication (Auth.js v5 / Google OAuth) ------------
# AUTH_SECRET: Generate with: npm exec auth secret
# Copy the output string here.
AUTH_SECRET="your-generated-secret-here"

# AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET:
# Get from: https://console.cloud.google.com
# Create a project → APIs & Services → Credentials → OAuth 2.0 Client
# Authorized redirect URIs: http://localhost:3000/api/auth/callback/google
AUTH_GOOGLE_ID="your-google-client-id.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="your-google-client-secret"

# ---- FingerprintJS Pro -------------------------------------
# Get from: https://dashboard.fingerprint.com
# Create an application, copy the Public API Key.
# The NEXT_PUBLIC_ prefix is required — this key loads in the browser.
NEXT_PUBLIC_FINGERPRINT_API_KEY="your-fingerprintjs-public-api-key"

# ---- Anthropic (Claude AI) ---------------------------------
# Get from: https://console.anthropic.com — API Keys section.
ANTHROPIC_API_KEY="sk-ant-..."

# Model to use for detection analysis (optional).
# Defaults to claude-sonnet-4-6 if not set.
# Options: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
ANTHROPIC_MODEL="claude-sonnet-4-6"
```

### Pattern 6: Vercel Environment Variable Configuration

Vercel env vars are set in the Vercel Dashboard → Project Settings → Environment Variables. Key points:

1. Check "Production" + "Preview" + "Development" for most variables
2. `NEXT_PUBLIC_*` variables are embedded at build time and visible to the browser — do NOT put secrets in them
3. After adding or changing env vars, you MUST redeploy for changes to take effect
4. The Vercel Dashboard provides a "Automatically expose System Environment Variables" checkbox — enable it; Auth.js v5 uses the `VERCEL_URL` system variable for URL inference
5. `DATABASE_URL` on Neon: use the pooled connection string (Neon provides both pooled and direct; always use pooled in serverless)

### Anti-Patterns to Avoid

- **Setting `NEXTAUTH_URL` on Vercel:** Auth.js v5 auto-infers from `VERCEL` env var. Setting `NEXTAUTH_URL` explicitly can cause ERR_INVALID_URL errors in preview deployments because the URL changes per-deployment.
- **Using the non-pooled Neon URL in production:** The project uses `@prisma/adapter-pg` with `DATABASE_URL`. Confirm this is the pooled URL, not the `DATABASE_URL_UNPOOLED` variant — Neon provides both.
- **Testing async Server Components with Vitest:** Vitest cannot test `async` Server Components (e.g., `DashboardPage` which calls `auth()` and `prisma.session.findMany()`). These are correctly tested via manual verification (Phase 6 Plan 02 pattern) or E2E tools (Playwright). Only test pure functions and Client Components with Vitest.
- **Committing the README .env.local template with real values:** The template must use placeholder strings, never real API keys.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prisma mock in tests | Custom mock object with hand-coded method stubs | `vitest-mock-extended` with `mockDeep<PrismaClient>()` | Hand-rolled mocks lose type safety; miss new Prisma methods; break when schema changes. `mockDeep` mirrors the actual client type exactly. |
| Path alias resolution in Vitest | Manually rewrite all `@/` imports | `vite-tsconfig-paths` plugin | Without the plugin every test file fails with "Cannot find module @/lib/detection". The plugin reads tsconfig.json automatically. |
| `.env.local` variable documentation | Prose description of each var | Commented template file (`.env.local.example`) | A runnable template is copy-paste ready; prose descriptions require users to manually construct the file. |

---

## Common Pitfalls

### Pitfall 1: Wrong Auth.js v5 Environment Variable Names

**What goes wrong:** README or Vercel env var setup uses the v4 names (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`). Google OAuth fails silently or with a cryptic error on the Vercel production URL.
**Why it happens:** The ROADMAP.md success criteria still reference v4 naming (the phase was planned before v5 naming was confirmed). The actual codebase uses v5 names.
**How to avoid:** Use the names verified in the actual .env file: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`. Cross-check with `src/lib/auth.ts` — it uses `NextAuth` with the Google provider which auto-reads `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` by convention in v5.
**Warning signs:** OAuth callback returns 500 or "Configuration" error after deployment; Vercel logs show "Missing NEXTAUTH_SECRET" (this means the wrong v4 name was set, not the v4 value was wrong).

### Pitfall 2: NEXTAUTH_URL Set Explicitly on Vercel

**What goes wrong:** Preview deployment URLs on Vercel are auto-generated (e.g., `sentinel-abc123.vercel.app`). If `NEXTAUTH_URL` is hardcoded to the production URL, OAuth callbacks fail on preview deployments because the redirect_uri doesn't match what's in Google Cloud Console.
**Why it happens:** Following v4 documentation patterns on a v5 project.
**How to avoid:** Do NOT set `NEXTAUTH_URL` in Vercel env vars for v5 projects. Auth.js v5 infers the URL from `VERCEL_URL` automatically. Only set `NEXTAUTH_URL=http://localhost:3000` in local `.env.local`.
**Warning signs:** `ERR_INVALID_URL` in Vercel function logs; "redirect_uri_mismatch" from Google OAuth.

### Pitfall 3: Google Cloud Console OAuth Redirect URI Not Updated for Production

**What goes wrong:** Google OAuth configured with only `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Production Vercel URL (`https://sentinel-xxx.vercel.app/api/auth/callback/google`) is rejected by Google.
**Why it happens:** Local dev works; production OAuth is only tested after deployment.
**How to avoid:** Before testing production OAuth, add the Vercel production URL to Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs. Add `https://your-production-domain.vercel.app/api/auth/callback/google`.
**Warning signs:** OAuth flow returns to a Google error page after authentication; Vercel function logs show no callback received.

### Pitfall 4: Vitest Cannot Test Async Server Components

**What goes wrong:** Test file attempts to import `DashboardPage` (an async Server Component) and render it with `@testing-library/react`. Vitest throws `Error: Objects are not valid as a React child` or silently returns undefined because async components need React 19's experimental async rendering support.
**Why it happens:** Async Server Components (those that use `await` at the top level) are not yet supported by Vitest's jsdom environment. This is explicitly noted in the official Next.js Vitest docs.
**How to avoid:** Only test pure functions (`computeSimilarity`, `runDetection`), Client Components (`SessionTable`, `StatusBadge`), and route handler response shapes. Leave async Server Component testing to manual verification (as established in Plan 06-02) or Playwright E2E tests.
**Warning signs:** Test renders a Server Component and gets back an unexpected result or Promise object.

### Pitfall 5: Prisma $transaction Mocking Complexity

**What goes wrong:** `runDetection` uses `prisma.$transaction(async (tx) => ...)`. When mocking, `prismaMock.$transaction` must be mocked to invoke the callback with `prismaMock` as `tx` — otherwise the inner `tx.fingerprint.findFirst` calls hit the unmocked real client.
**Why it happens:** `$transaction` is a higher-order function; its behavior under mocking is non-obvious.
**How to avoid:** Mock `$transaction` like this:
```typescript
prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock))
```
This passes `prismaMock` as the transaction argument, so `tx.fingerprint.findFirst` resolves through the mock.
**Warning signs:** Tests pass but `prismaMock.fingerprint.findFirst` call count is 0 even though the test expected it to be called.

### Pitfall 6: Dashboard API Exposes Session Cookie Values (Security Criterion SC-4)

**What goes wrong:** The `/dashboard` page's Prisma query fetches `Session.sessionToken` (the raw `auth_session` cookie value) and if a future API endpoint returns sessions as JSON, the raw token is exposed.
**Why it happens:** Prisma returns all columns by default. The current `DashboardPage` uses a server component that renders directly — no JSON API endpoint. Risk is if an API route for dashboard data is added.
**Current state in codebase:** The existing implementation (`src/app/(shop)/dashboard/page.tsx`) is a Server Component that renders sessions directly — no JSON API route, so the cookie value is never sent to the client. However, the `SessionTable` receives session objects — verify the Prisma query uses `select` to exclude `sessionToken` rather than returning the full session row.
**How to verify:** Check the Prisma query in `page.tsx` — it uses `prisma.session.findMany({ where: ..., include: { fingerprints: ..., detectionEvents: ... } })`. This does NOT exclude `sessionToken` from the returned `Session` object, but `SessionTable` only receives the fields it needs (the TypeScript type `SessionRow` in `SessionTable.tsx` does not include `sessionToken`). The data flows through TypeScript — but the raw query fetches the token into server memory. For defense-in-depth, the Prisma query should use `select` explicitly. This is a refinement to note in the phase plan.

---

## Code Examples

Verified patterns from official sources:

### Vitest Config (exact setup for this project)

```typescript
// vitest.config.mts
// Source: https://nextjs.org/docs/app/guides/testing/vitest (updated 2026-02-27)
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

### Test Setup File (global mocks)

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom'  // optional: adds .toBeInTheDocument() matchers
// No other global setup required for pure function tests
```

### package.json test script

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

`vitest` = watch mode (for development); `vitest run` = single pass (for CI).

### Complete computeSimilarity Edge Case Tests

These come directly from reading `src/lib/detection.ts` — the function behavior is well-defined and fully testable without any mocking:

```typescript
// Test cases derived from actual detection.ts implementation
describe('computeSimilarity edge cases', () => {
  it('returns 0.25 for each matching component', () => {
    // Only os matches
    expect(computeSimilarity({ os: 'Mac OS' }, { os: 'Mac OS' })).toBe(0.25)
  })

  it('is case-insensitive (trims and lowercases)', () => {
    expect(computeSimilarity(
      { os: '  Mac OS  ' },
      { os: 'mac os' }
    )).toBe(0.25)
  })

  it('handles empty object vs empty object (all null = all match)', () => {
    expect(computeSimilarity({}, {})).toBe(1.0)
  })

  it('returns 0.5 for two matching out of four fields', () => {
    expect(computeSimilarity(
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'UTC' },
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1366x768', timezone: 'Europe/London' }
    )).toBe(0.5)
  })
})
```

### Simulation Walkthrough Structure (for README)

The walkthrough must be exact and reproducible. Based on the project's cookie config (HttpOnly, SameSite=Lax, Secure only in production) and the FingerprintReporter (caches in sessionStorage with 30min TTL):

```markdown
## Hijack Simulation Walkthrough

This walkthrough reproduces a session cookie theft and detection end-to-end.

### Prerequisites
- Two different browsers installed (e.g., Chrome and Firefox)
- The app running locally or the production Vercel URL
- A Google account for sign-in

### Step 1: Establish Device A session
1. Open Browser A (e.g., Chrome)
2. Navigate to the app and sign in with Google
3. You will be redirected to /products
4. Open DevTools → Application → Cookies → find the cookie named `auth_session`
5. Copy the full cookie value (a long string)

### Step 2: Steal the cookie (simulate attacker)
1. Open Browser B (e.g., Firefox — must be a different browser to get a different fingerprint)
2. Navigate to the same app URL (e.g., http://localhost:3000 or your Vercel URL)
3. Open DevTools → Storage → Cookies (Firefox) or Application → Cookies (Chrome)
4. Create a new cookie:
   - Name: `auth_session`
   - Value: (paste the value copied from Step 1)
   - Domain: `localhost` (or your Vercel domain)
   - Path: `/`
5. Navigate to /products in Browser B (without signing in)

### Step 3: Observe detection
1. Browser B will load the products page using Browser A's session
2. FingerprintJS records Browser B's fingerprint — a different visitorId than Browser A
3. The detection engine flags the mismatch and dispatches Claude for analysis
4. Wait 10–15 seconds for Claude to complete (async processing)
5. In Browser A, navigate to /dashboard
6. The dashboard shows the session with a red **FLAGGED** badge
7. Click the flagged row to expand Claude's reasoning transcript
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `NEXTAUTH_URL` required on Vercel | Not needed — auto-inferred from `VERCEL` env var | Auth.js v5 | Setting it explicitly causes ERR_INVALID_URL on preview deployments |
| `NEXTAUTH_SECRET` env var | `AUTH_SECRET` in v5 | Auth.js v5 | Rename in Vercel project settings |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in v5 | Auth.js v5 | Rename in Vercel project settings |
| Jest as default Next.js test runner | Vitest recommended | ~2024 | Next.js official docs now primary example uses Vitest |
| jest-mock-extended | vitest-mock-extended | ~2023 | Same API, Vitest-native import; no config incompatibilities |

**Deprecated/outdated:**
- `NEXTAUTH_URL`: Do NOT set on Vercel for v5 projects
- Pages Router `pages/api/` pattern: Not used in this project (App Router throughout)
- `prisma migrate` command: This project uses `prisma db push` consistently (no migrations directory; `db push` is the established pattern per STATE.md)

---

## Open Questions

1. **FingerprintJS Pro account activation**
   - What we know: Phase 3 notes the account is inactive (cancelled due to 90-day inactivity). The `NEXT_PUBLIC_FINGERPRINT_API_KEY` is in .env but may not work.
   - What's unclear: Whether the account has been reactivated since Phase 3.
   - Recommendation: The simulation walkthrough should document both paths — "with FingerprintJS Pro active" and "with OSS fallback mode" (the FingerprintReporter already supports `fpMode = 'oss'` via localStorage). The README should note this and link to fingerprint.com to reactivate.

2. **Prisma query in DashboardPage — does it leak sessionToken to server memory?**
   - What we know: `prisma.session.findMany({ include: {...} })` returns the full Session row including `sessionToken`. The TypeScript `SessionRow` type in SessionTable.tsx doesn't include `sessionToken`, so it's never passed to the component. But it's in server memory.
   - What's unclear: Whether Success Criterion SC-4 ("does not expose raw session cookie values through any API endpoint") is satisfied if the token is fetched but not sent to the client.
   - Recommendation: The planner should include a task to add `select` to the Prisma query to exclude `sessionToken` explicitly — this satisfies SC-4 defensively without any user-visible change.

3. **Exact Vercel production URL for Google OAuth callback**
   - What we know: The Google Cloud Console OAuth config must include the production URL's callback URI.
   - What's unclear: Whether the Vercel project is already configured and what the production URL is.
   - Recommendation: The plan should include a step to update Google Cloud Console after the first Vercel deploy to add the production callback URL.

---

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json` — this section is informational only (not gating).

No existing test infrastructure was found (no vitest.config.*, no jest.config.*, no *.test.* files, no *.spec.* files). This is a complete greenfield test setup.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (to be installed) |
| Config file | `vitest.config.mts` — Wave 0 creates this |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:run` (same for this scale) |

### Phase Requirements → Test Map

Phase 7 has no new requirement IDs. The tests cover existing behavior from Phases 1-5:

| Target Behavior | Test Type | Function Under Test | Automated |
|----------------|-----------|---------------------|-----------|
| computeSimilarity — all match | unit | `src/lib/detection.ts` | `npm run test:run` |
| computeSimilarity — no match | unit | `src/lib/detection.ts` | `npm run test:run` |
| computeSimilarity — both null = match | unit | `src/lib/detection.ts` | `npm run test:run` |
| computeSimilarity — one-side null = inconclusive | unit | `src/lib/detection.ts` | `npm run test:run` |
| computeSimilarity — case insensitive | unit | `src/lib/detection.ts` | `npm run test:run` |
| runDetection — no original returns detected:false | unit | `src/lib/detection.ts` (mocked DB) | `npm run test:run` |
| runDetection — matching visitorId returns detected:false | unit | `src/lib/detection.ts` (mocked DB) | `npm run test:run` |
| runDetection — mismatch creates DetectionEvent | unit | `src/lib/detection.ts` (mocked DB) | `npm run test:run` |
| POST /api/session/record — 401 unauthenticated | integration | `src/app/api/session/record/route.ts` | `npm run test:run` |
| POST /api/session/record — 400 invalid payload | integration | `src/app/api/session/record/route.ts` | `npm run test:run` |
| POST /api/session/record — 200 duplicate requestId | integration | `src/app/api/session/record/route.ts` | `npm run test:run` |
| /dashboard — unauthenticated redirect to /login | manual | Human verification (async Server Component) | Plan 06-02 walkthrough |

### Wave 0 Gaps (files to create before implementation tasks)

- [ ] `vitest.config.mts` — Vitest config with tsconfigPaths + react plugins
- [ ] `src/test/setup.ts` — Global test setup (can be empty initially)
- [ ] `src/lib/__mocks__/db.ts` — Prisma mock singleton
- [ ] `src/lib/__tests__/detection.test.ts` — computeSimilarity + runDetection tests
- [ ] `src/app/api/session/record/__tests__/route.test.ts` — Route handler tests
- [ ] `package.json` test scripts: `"test": "vitest"`, `"test:run": "vitest run"`

---

## Sources

### Primary (HIGH confidence)

- [Next.js Vitest Documentation](https://nextjs.org/docs/app/guides/testing/vitest) — exact package list, vitest.config.mts template, limitation on async Server Components. Page last updated 2026-02-27.
- [Auth.js v5 Deployment Documentation](https://authjs.dev/getting-started/deployment) — AUTH_SECRET requirement, NEXTAUTH_URL not needed on Vercel, AUTH_TRUST_HOST auto-inferred
- [Prisma Unit Testing Documentation](https://www.prisma.io/docs/orm/prisma-client/testing/unit-testing) — singleton mock pattern (adapted for vitest-mock-extended)
- Codebase reading — `src/lib/auth.ts`, `src/lib/detection.ts`, `src/lib/claude.ts`, `src/app/(shop)/dashboard/page.tsx`, `src/components/SessionTable.tsx`, `.env` key names, `package.json` versions

### Secondary (MEDIUM confidence)

- [Vercel Community: ERR_INVALID_URL linked to NextAuth v5](https://community.vercel.com/t/err-invalid-url-possibly-linked-to-nextauth-v5/24925) — confirms NEXTAUTH_URL explicitly set causes issues on Vercel with v5
- [Vercel Environment Variables Documentation](https://vercel.com/docs/environment-variables) — NEXT_PUBLIC_ prefix behavior, post-deploy requirement
- [GitHub: prisma-mock-vitest](https://github.com/james-elicx/prisma-mock-vitest) — confirms vitest-compatible Prisma mock library exists

### Tertiary (LOW confidence — flag for validation)

- WebSearch results mentioning `$transaction` mock pattern — confirm with actual vitest-mock-extended docs before implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack (Vitest setup): HIGH — Official Next.js docs (updated 2026-02-27) were the primary source
- Auth.js v5 env vars: HIGH — Official Auth.js v5 docs confirmed; cross-validated with Vercel community reports
- Prisma mock pattern: MEDIUM — Official Prisma docs use Jest; vitest-mock-extended adaptation is well-established but $transaction mock pattern needs validation
- Simulation walkthrough: HIGH — Based on direct reading of FingerprintReporter, auth.ts cookie config, and established simulation flow in ROADMAP/PROJECT.md
- Security (SC-4 sessionToken): MEDIUM — Analysis is correct based on code reading; recommendation to add `select` is defensive best practice

**Research date:** 2026-02-28
**Valid until:** 2026-04-28 (stable stack — Vitest and Auth.js v5 patterns are stable)
