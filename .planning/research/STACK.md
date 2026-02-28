# Stack Research

**Domain:** Security PoC — Next.js e-commerce shell with session hijack detection
**Project:** Sentinel
**Researched:** 2026-02-28
**Confidence:** MEDIUM (Context7/WebSearch/WebFetch unavailable in this session; based on official docs knowledge through August 2025 cutoff + version verification notes below)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Next.js | 15.x | Full-stack React framework, API routes, SSR | App Router is now stable and the Vercel-native default. Server Components reduce client bundle, Route Handlers replace `pages/api/`. Vercel deploys it zero-config. | MEDIUM — 15.x was latest stable at Aug 2025 cutoff; verify `npm show next version` before pinning |
| React | 19.x | UI runtime (peer dep of Next.js 15) | Next.js 15 requires React 19; no separate choice required | MEDIUM — follows Next.js peer dep |
| TypeScript | 5.x | Type safety | Next.js 15 scaffolds TypeScript by default; critical for session/fingerprint data shape correctness | HIGH — long-stable ecosystem |

### Authentication

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Auth.js (NextAuth v5) | 5.x stable | Google OAuth, session management, JWT/DB sessions | v5 rewrites Auth.js for App Router. Supports both JWT (stateless) and database sessions. JWT strategy chosen here — no extra DB table needed for auth state itself, session ID embedded in JWT. Google provider is first-class. Works with Next.js middleware for route protection. | MEDIUM — v5 was RC through mid-2025; verify stable release at `npm show next-auth version` |

**Session strategy decision:** Use **database sessions** (not JWT) for Sentinel. Rationale: the PoC must store `{SessionID → FingerprintID}` tuples and detect mismatches server-side. A DB session row is the natural home for `fingerprintId`, `lastSeenIp`, `userAgent`. JWT sessions are opaque to the server between requests, making fingerprint binding awkward. Auth.js with Prisma adapter writes session rows to the DB that can be enriched with fingerprint columns.

**`auth_session` cookie:** Auth.js's default session cookie (`authjs.session-token`) must be renamed/aliased to `auth_session` per project requirements. This is configurable via `cookies.sessionToken.name` in the Auth.js config object.

### Browser Fingerprinting

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| @fingerprintjs/fingerprintjs-pro-react | 2.x | Hardware-stable browser fingerprint, React hook API | Pro tier provides server-side verification API, persistent visitorId stable across page navigations and incognito. The open-source `fingerprintjs` package uses only JS signals and degrades under privacy tools — unacceptable for a security PoC. Pro's `useVisitorData()` hook integrates cleanly with Next.js client components. | MEDIUM — package exists and is maintained; verify exact version at npmjs.com |
| @fingerprintjs/fingerprintjs-pro-server-api | 2.x | Server-side fingerprint event retrieval | Allows Route Handlers to fetch full event data (IP, OS, browser, geolocation) for a given requestId — feeds the Claude analysis payload | MEDIUM — verify current version |

**FingerprintJS tier choice:** The project requires "hardware-level stable across page navigations." Only Pro delivers this. The open-source package (`@fingerprintjs/fingerprintjs`, MIT) is client-only, degrades in privacy browsers, and has no server-side event API. Use Pro.

**Integration pattern:** FingerprintJS Pro must run client-side (browser). In Next.js App Router, wrap the Pro agent in a Client Component (`'use client'`), call `getVisitorData()` or the `useVisitorData()` hook, then POST the `visitorId` + `requestId` to a Route Handler that records it in the DB alongside the session.

### AI Detection Layer

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| @anthropic-ai/sdk | 0.27.x+ | Anthropic Claude API client | Official SDK; typed response objects; supports streaming (not needed here). Call from a Next.js Route Handler (server-side only — never expose ANTHROPIC_API_KEY to client). Model is configurable via env var per project requirements. | MEDIUM — 0.27.x was current at Aug 2025 cutoff; `npm show @anthropic-ai/sdk version` to verify |

**Claude model recommendation:** Default to `claude-opus-4-6` (latest frontier as of Feb 2026). Make it configurable via `ANTHROPIC_MODEL` env var so the model can be swapped to a cheaper/faster tier for demo purposes without code changes.

### Database

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Neon (via @vercel/postgres) | latest | Serverless Postgres | Vercel's native database offering — one-click provisioning from Vercel dashboard, connection pooling built in for serverless functions, `@vercel/postgres` SDK works in Edge and Node.js runtimes. Sessions, fingerprints, and security events all in one Postgres DB. | MEDIUM — Vercel/Neon partnership was confirmed through mid-2025; verify current offering at vercel.com/storage |
| Prisma | 5.x | ORM / schema management | Type-safe queries, migration tooling, Auth.js Prisma adapter (`@auth/prisma-adapter`) for session/account tables. Vercel Postgres (Neon) is fully compatible. Prisma Client works in Next.js Route Handlers. | HIGH — stable, widely adopted |
| @auth/prisma-adapter | 2.x | Connects Auth.js to Prisma | Official adapter; generates `Account`, `Session`, `User`, `VerificationToken` tables; Session table can be extended with `fingerprintId`, `lastSeenIp`, `flagged` columns | MEDIUM — version tied to Auth.js v5 |

**Database alternative considered:** Vercel KV (Redis) for session store. Rejected because: relational queries across sessions+events+fingerprints are awkward in KV; Prisma gives schema migrations and type safety; the security event log is naturally tabular.

**SQLite considered:** Good for local dev, but Vercel serverless functions don't have a persistent filesystem — SQLite won't work in production on Vercel. Do not use.

### Infrastructure & Deployment

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Vercel | N/A (platform) | Hosting, CI/CD, env var management | Project requirement. Next.js deploys zero-config. Env vars stored as Vercel environment variables per credentials policy. | HIGH — project requirement, well-understood |
| Vercel Environment Variables | N/A | Secrets management | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FINGERPRINTJS_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `AUTH_SECRET` — all set in Vercel dashboard, injected at build/runtime. Never committed. | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| zod | 3.x | Runtime schema validation | Validate Claude API response shape (confidence score 0–100, reasoning string) and fingerprint POST payloads in Route Handlers | HIGH — stable, widely used |
| tailwindcss | 3.x or 4.x | Utility CSS for security dashboard | Next.js 15 scaffolds Tailwind; dashboard needs minimal custom styling. Tailwind v4 (Vite-based) is available but v3 is more stable with Next.js 15 currently. | MEDIUM — Tailwind v4 compatibility with Next.js 15 was emerging at Aug 2025; verify |
| @tanstack/react-query | 5.x | Client-side data fetching for dashboard | Dashboard polls for flagged sessions. React Query handles polling interval, stale data, and loading states cleanly. Alternative: use React Server Components with `revalidate` — acceptable for simpler dashboard, but React Query gives better UX for live updates. | MEDIUM |
| jose | 5.x | JWT utilities | If Auth.js session token needs manual inspection in middleware for fingerprint checks | LOW — may not be needed; Auth.js handles JWT internally |
| @vercel/analytics | 1.x | Page analytics (optional) | Only if project wants Vercel Analytics on e-commerce shell; not required for PoC | LOW |

### Development Tools

| Tool | Purpose | Notes | Confidence |
|------|---------|-------|------------|
| ESLint + `eslint-config-next` | Linting | Bundled with Next.js scaffolding; catches common App Router mistakes | HIGH |
| Prettier | Code formatting | Add `prettier-plugin-tailwindcss` for class sorting | HIGH |
| Prisma CLI | DB migrations | `npx prisma migrate dev` locally; `npx prisma migrate deploy` in Vercel build step | HIGH |
| `dotenv-cli` | Local env management | Load `.env.local` for local dev where Vercel env vars aren't injected | MEDIUM |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Auth library | Auth.js v5 (NextAuth) | Clerk | Clerk is a hosted auth SaaS with per-MAU pricing; overkill for PoC, adds external dependency. Auth.js is self-hosted, free, and gives full control over session cookie name (`auth_session` requirement). |
| Auth library | Auth.js v5 | Lucia Auth v3 | Lucia is newer and lighter but has smaller ecosystem. Auth.js has a Google provider and Prisma adapter out of the box. Less integration work. |
| Auth library | Auth.js v5 | Custom OAuth (Passport.js) | Passport is Pages Router-era; requires custom session store wiring. More code for the same result. |
| Database | Neon (Vercel Postgres) | PlanetScale | PlanetScale deprecated its free tier in 2024. Neon has Vercel-native integration and a free tier. |
| Database | Neon (Vercel Postgres) | Supabase | Supabase is excellent but adds a separate dashboard/platform. Vercel Postgres (Neon) stays in the Vercel ecosystem, matching the project's deployment constraint. |
| Database | Neon (Vercel Postgres) | SQLite (local) | No persistent filesystem on Vercel serverless — SQLite breaks in production. |
| FingerprintJS tier | FingerprintJS Pro | FingerprintJS OSS | OSS has no server-side event API, degrades in privacy browsers, no persistent visitorId guarantee. Insufficient for security PoC. |
| CSS | Tailwind CSS | CSS Modules / Styled Components | Tailwind is the Next.js default and sufficient for a dashboard PoC. Styled Components adds runtime overhead. |
| Session strategy | Database sessions (Auth.js) | JWT sessions (Auth.js) | JWT sessions can't be easily enriched with `fingerprintId` server-side without custom token decoding on every request. DB sessions have a row that Prisma can `update` with fingerprint data and `flagged` status. |
| App Router vs Pages Router | App Router | Pages Router | Pages Router is in maintenance mode. App Router is the documented path for new Next.js 15 projects. Route Handlers (`app/api/`) replace `pages/api/`. Middleware for session checks works in both but is documented primarily for App Router. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Pages Router (`pages/api/`) | Maintenance mode in Next.js 15; all new Next.js documentation targets App Router. Starting with Pages Router creates technical debt day one. | App Router with Route Handlers (`app/api/[route]/route.ts`) |
| `next-auth` v4 (legacy) | v4 uses older cookie/session patterns, not designed for App Router. Auth.js v5 (`next-auth@5`) is the rewrite for Next.js 15 compatibility. | `next-auth@5` (Auth.js) |
| FingerprintJS OSS (`@fingerprintjs/fingerprintjs`) | No server-side API, unstable visitorId across incognito/browsers, inadequate for security use case | `@fingerprintjs/fingerprintjs-pro-react` + Pro API key |
| Edge Runtime for DB queries | Prisma Client does not support Vercel Edge Runtime (WebAssembly driver required and is experimental). Fingerprint detection logic involves multiple DB reads/writes — use Node.js runtime. | Set `export const runtime = 'nodejs'` on Route Handlers that touch Prisma |
| Committed `.env` files | Project credentials policy strictly forbids this. | Vercel environment variables only |
| `iron-session` or `express-session` | Legacy session libraries, not designed for Next.js App Router serverless model | Auth.js v5 database sessions |
| PlanetScale | Deprecated free tier in 2024; not cost-free for PoC | Neon (Vercel Postgres) |

---

## Stack Patterns by Variant

**If the dashboard needs real-time push (WebSocket):**
- Use Vercel's SSE via Route Handler streaming (basic) or add Pusher/Ably for WebSocket
- Vercel does not support persistent WebSocket connections in serverless functions
- For PoC: polling every 5s via React Query is sufficient; real-time push is deferred to post-PoC

**If running locally without a Vercel Postgres account:**
- Use a local Postgres instance with `DATABASE_URL=postgresql://localhost/sentinel`
- All Prisma migrations work identically against local Postgres
- FingerprintJS Pro requires an API key even locally — no local-only mode

**If FingerprintJS Pro trial expires:**
- Fall back to `@fingerprintjs/fingerprintjs` (OSS) for development only
- Document the degradation clearly — OSS visitorId will be less stable
- The core detection architecture remains valid

---

## Version Compatibility Matrix

| Package | Compatible With | Verified At | Notes |
|---------|-----------------|-------------|-------|
| `next@15.x` | `react@19.x`, `react-dom@19.x` | Aug 2025 training cutoff | React 19 is required peer dep for Next.js 15 |
| `next-auth@5.x` | `next@14.x`, `next@15.x` | Aug 2025 | Auth.js v5 targets Next.js 13+ App Router |
| `@auth/prisma-adapter@2.x` | `next-auth@5.x`, `prisma@5.x` | Aug 2025 | Must use matching adapter major version |
| `prisma@5.x` | Node.js 18+, Neon/Postgres | Aug 2025 | Prisma 5 dropped support for Node.js 16 |
| `@anthropic-ai/sdk@0.27.x` | Node.js 18+ | Aug 2025 | Server-side only; do not import in client components |
| `@fingerprintjs/fingerprintjs-pro-react@2.x` | React 18+, React 19 | Aug 2025 | Client component only (`'use client'`) |
| Tailwind CSS v3 | Next.js 15 | HIGH confidence | Tailwind v4 compatibility with Next.js 15 was emerging — prefer v3 until v4 is confirmed stable |

---

## Installation

```bash
# Scaffold
npx create-next-app@latest sentinel --typescript --tailwind --eslint --app --src-dir

# Authentication
npm install next-auth@beta @auth/prisma-adapter

# Database ORM
npm install prisma @prisma/client @vercel/postgres

# FingerprintJS Pro
npm install @fingerprintjs/fingerprintjs-pro-react @fingerprintjs/fingerprintjs-pro-server-api

# Anthropic Claude SDK
npm install @anthropic-ai/sdk

# Validation
npm install zod

# Client-side data fetching (dashboard)
npm install @tanstack/react-query

# Dev dependencies
npm install -D prisma prettier prettier-plugin-tailwindcss
```

**Post-scaffold steps:**
```bash
# Initialize Prisma
npx prisma init

# Set DATABASE_URL in .env (local dev only — never commit)
# Add to .gitignore: .env, .env.local

# Run Auth.js setup
npx auth secret  # generates AUTH_SECRET
```

---

## Environment Variables Required

These must be set as Vercel environment variables. No `.env` committed to git.

```
# Authentication
AUTH_SECRET=<generated by npx auth secret>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
NEXTAUTH_URL=https://<your-vercel-domain>  # or http://localhost:3000 locally

# Database
DATABASE_URL=<Neon connection string from Vercel dashboard>

# FingerprintJS
NEXT_PUBLIC_FINGERPRINTJS_API_KEY=<FingerprintJS Pro public key>
FINGERPRINTJS_SECRET_KEY=<FingerprintJS Pro secret key for server API>

# Anthropic
ANTHROPIC_API_KEY=<from console.anthropic.com>
ANTHROPIC_MODEL=claude-opus-4-6  # configurable
```

**Note on `NEXT_PUBLIC_` prefix:** FingerprintJS loads in the browser — its public API key must be exposed to the client via `NEXT_PUBLIC_FINGERPRINTJS_API_KEY`. The secret key for server-side event retrieval must NOT have the `NEXT_PUBLIC_` prefix.

---

## Sources

- Training knowledge through August 2025 cutoff — Next.js 15, Auth.js v5, Prisma 5, Anthropic SDK patterns
- Next.js official docs: https://nextjs.org/docs (App Router, Route Handlers, middleware) — MEDIUM confidence (verify version numbers)
- Auth.js official docs: https://authjs.dev/getting-started (Google provider, Prisma adapter, cookie config) — MEDIUM confidence
- FingerprintJS Pro docs: https://dev.fingerprint.com/docs (React SDK, server API) — MEDIUM confidence
- Anthropic SDK: https://github.com/anthropic-ai/anthropic-sdk-python (wrong lang) / https://www.npmjs.com/package/@anthropic-ai/sdk — MEDIUM confidence
- Vercel Postgres/Neon partnership: https://vercel.com/storage/postgres — MEDIUM confidence (partnership confirmed through Aug 2025)
- Prisma + Vercel: https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel — MEDIUM confidence

**Verification steps before implementation (LOW effort, HIGH value):**
1. `npm show next version` — confirm Next.js 15.x is still current
2. `npm show next-auth version` — confirm v5 is stable (not RC)
3. `npm show @anthropic-ai/sdk version` — confirm 0.27.x or newer
4. `npm show @fingerprintjs/fingerprintjs-pro-react version` — confirm 2.x
5. Check https://vercel.com/storage/postgres for current Neon pricing/availability

---

## Key Architectural Decisions Summary

1. **App Router (not Pages Router):** New project in 2026 — App Router is the only viable path. Pages Router is maintenance mode.

2. **Database sessions (not JWT):** The fingerprint-to-session binding requires mutable server state. JWT sessions are immutable between issuance and expiry.

3. **FingerprintJS Pro (not OSS):** Project explicitly requires "hardware-level stable" fingerprints. Only Pro delivers this.

4. **Neon/Vercel Postgres (not SQLite, not PlanetScale):** Vercel-native, serverless-compatible, Prisma-compatible. SQLite is broken on Vercel serverless.

5. **Auth.js v5 (not Clerk, not Lucia):** Full control over session cookie name (`auth_session` requirement), free, first-class Google provider, Prisma adapter available.

6. **Node.js runtime for detection Route Handlers (not Edge Runtime):** Prisma does not support Edge Runtime without experimental WASM driver. Use `export const runtime = 'nodejs'` on any Route Handler touching Prisma or the Anthropic SDK.

---
*Stack research for: Sentinel (session hijack detection PoC)*
*Researched: 2026-02-28*
*Next verification: Run `npm show <package> version` for each dependency before implementation*

