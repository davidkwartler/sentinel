# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** When a stolen session cookie is used from a different device, Sentinel detects it, calls Claude for analysis, and flags the session with a confidence score on the dashboard.
**Current focus:** Phase 7 - Deploy and Polish

## Current Position

Phase: 7 of 7 (Deploy and Polish)
Plan: 4 of 4 in current phase
Status: Phase 7 complete — all 4 plans executed. Human verification checkpoints pending.
Last activity: 2026-02-28 — Phase 7 executed (deploy, unit tests, route tests, README)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 5 phases
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Status |
|-------|-------|--------|
| 1. Foundation | complete | ✅ Done |
| 2. E-Commerce Shell | complete | ✅ Done |
| 3. Fingerprint Capture | complete | ✅ Done |
| 4. Detection Engine | complete | ✅ Done |
| 5. Claude Integration | 2/2 | ✅ Done |
| 6. Security Dashboard | 1/2 | 🔧 In Progress |
| 7. Deploy and Polish | 4/4 | ✅ Done |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-build]: Database sessions chosen over JWT — fingerprint binding requires mutable server-side state
- [Pre-build]: FingerprintJS Pro (not OSS) — only Pro provides stable cross-device visitorId (account currently inactive, to be resolved)
- [Pre-build]: Middleware does JWT validation only — Prisma and Anthropic SDK cannot run on Edge Runtime
- [Pre-build]: Claude called asynchronously on mismatch — HTTP response returns PENDING immediately to avoid blocking
- [Phase 3]: FingerprintJS Pro account inactive due to 90 days inactivity — fingerprint capture code is complete, will work once account is reactivated
- [Phase 3]: Used @fingerprintjs/fingerprintjs-pro-spa SDK; ExtendedGetResult provides os and browserName as direct string properties
- [Phase 5]: Used `after()` from `next/server` for async Claude dispatch (stable since Next.js 15.1.0, works on Vercel)
- [Phase 5]: Used `output_config.format` with `type: "json_schema"` for structured outputs (GA, no beta header needed)
- [Phase 5]: FLAGGED threshold hardcoded at >= 70; Phase 6 can make configurable
- [Phase 5]: Used `prisma db push` for schema changes (consistent with project pattern; no migrations directory)

### Pending Todos

- Reactivate FingerprintJS Pro account (currently cancelled due to inactivity)

### Blockers/Concerns

- [Phase 3]: FingerprintJS Pro account inactive — fingerprint capture will fail until reactivated. Detection pipeline depends on this.
- [Phase 7]: Auth.js v5 cookie config on Vercel (`NEXTAUTH_URL` and `auth_session` cookie renaming) has known gotchas — test OAuth callback on production URL before demo

## What Was Built

### Phase 1: Foundation ✅
- Next.js 16 + Prisma 7 + Auth.js v5 scaffolded
- Google OAuth with database sessions persisted to Neon
- `auth_session` cookie (HttpOnly, SameSite=Lax)
- Route protection via proxy.ts

### Phase 2: E-Commerce Shell ✅
- `/products` page with 8 mock products
- `/profile` page with user name, email, avatar
- `(shop)` route group with shared nav layout
- All shop routes require authentication

### Phase 3: Fingerprint Capture ✅
- `Fingerprint` model in Prisma schema (visitorId, requestId, os, browser, screenRes, timezone, ip, isOriginal)
- `/api/session/record` POST route — validates auth, deduplicates by requestId, marks first fingerprint as original
- `FingerprintReporter` client component — loads FingerprintJS Pro SDK, caches in sessionStorage, POSTs to ingest API
- Wired into `(shop)/layout.tsx` — fires on every authenticated page load
- ANTHROPIC_API_KEY stored in .env.local and Vercel (Production + Development)

### Phase 4: Detection Engine ✅
- `DetectionEvent` model in Prisma schema
- `computeSimilarity()` — component-level similarity scoring (os, browser, timezone, screenRes)
- `runDetection()` — compares new visitorId against session's original, creates DetectionEvent if mismatch
- Wired into `/api/session/record` POST route after fingerprint persist

### Phase 5: Claude Integration ✅
- `confidenceScore Float?` and `reasoning String? @db.Text` added to DetectionEvent
- `src/lib/claude.ts` — Anthropic client singleton + `analyzeDetectionEvent()` with structured outputs
- `after()` dispatch in route handler — Claude called asynchronously after HTTP response
- Model configurable via `ANTHROPIC_MODEL` env var (defaults to `claude-sonnet-4-6`)
- Error handling: try/catch in `after()` callback, leaves status PENDING on failure

### Phase 6: Security Dashboard 🔧
- `SessionTable` client component with status badges (ACTIVE/PENDING/FLAGGED/CLEAR) and expandable FLAGGED reasoning panel
- `/dashboard` server component page with auth check, Prisma query, PollingRefresher (8s interval)
- Dashboard nav link added to shop layout
- Plan 02 (human verification) pending

### Phase 7: Deploy and Polish ✅
- Dashboard Prisma query fixed: `select` instead of `include` — sessionToken never fetched (SC-4)
- Deployed to Vercel production: https://sentinel.davidkwartler.com
- All 6 env vars confirmed in Vercel Production
- Vitest test infrastructure: vitest.config.mts, Prisma mock singleton, 12 passing tests
- Unit tests: computeSimilarity (6 cases) + runDetection (3 cases)
- Route handler tests: 401 auth guard, 400 validation, 200 duplicate (3 cases)
- README.md rewritten with architecture, setup, hijack simulation walkthrough
- .env.local.example created with all variables and source comments

## Session Continuity

Last session: 2026-02-28
Stopped at: Phase 7 complete. Human verification checkpoints pending for production smoke test and README review.
Resume file: None
