# Project Research Summary

**Project:** Sentinel
**Domain:** Security PoC — session hijack detection with AI analysis
**Researched:** 2026-02-28
**Confidence:** MEDIUM

## Executive Summary

Sentinel is a security proof-of-concept that demonstrates real-time session hijack detection using browser fingerprinting and AI-powered analysis. It is structured as two cooperating surfaces: an e-commerce shell that generates realistic authenticated sessions, and a detection + dashboard layer that monitors those sessions for fingerprint anomalies and routes confirmed mismatches to Claude for confidence scoring. The recommended build approach mirrors how production security tools like Auth0 Anomaly Detection work internally — bind sessions to device fingerprints at login, compare on subsequent requests, escalate anomalies to a scoring model — but exposes the reasoning layer explicitly, which is the portfolio differentiator. Commercial systems hide their ML scores; Sentinel shows the AI's full reasoning, making detection explainable.

The stack is opinionated and Vercel-native: Next.js 15 App Router, Auth.js v5 with database sessions (not JWT), FingerprintJS Pro (not OSS), Prisma on Neon/Vercel Postgres, and the Anthropic SDK called server-side only. Every major technology choice has a specific rationale tied to a project constraint — database sessions because fingerprint binding requires mutable server state; FingerprintJS Pro because only Pro provides server-side verification and cross-device stability; Node.js Route Handlers (not Edge Middleware) because Prisma and the Anthropic SDK cannot run on the Edge Runtime. These decisions are load-bearing: substituting any of them requires architectural rework.

The highest risks are operational rather than conceptual. Claude API latency on the detection hot path is the most dangerous pitfall — calling Claude synchronously inside the fingerprint record route will make the app hang visibly during demos. The second risk is testing the fingerprint stability assumption: FingerprintJS Pro's visitorId changes in incognito mode and on browser version updates, which can produce false positives during development if the same device is used for both "Device A" and "Device B" in the simulation. Both risks have clear prevention strategies documented in PITFALLS.md and must be designed around from day one, not retrofitted later.

## Key Findings

### Recommended Stack

The stack centers on Next.js 15 App Router with TypeScript as the full-stack framework, deployed on Vercel. Auth.js v5 (NextAuth) handles Google OAuth with the Prisma adapter, using **database sessions** so that fingerprint data can be attached to a mutable session row that the server can read and update. Neon (via Vercel Postgres) is the database, accessed through Prisma 5 with full migration tooling. FingerprintJS Pro is the fingerprinting layer — the OSS package was explicitly rejected because it has no server-side verification API and produces unstable visitorIds under privacy browsers. Claude (`claude-opus-4-6`, configurable via env var) is called from a server-side Route Handler using the official Anthropic SDK. All credentials are stored as Vercel environment variables; nothing is committed to git.

See `/Users/davidkwartler/sentinel/.planning/research/STACK.md` for full rationale, alternatives considered, and version compatibility matrix.

**Core technologies:**
- **Next.js 15 / App Router:** Full-stack framework; Route Handlers replace pages/api; App Router is required (Pages Router is maintenance mode)
- **Auth.js v5 (NextAuth):** Google OAuth with Prisma adapter; database sessions chosen over JWT so fingerprint state is mutable server-side; cookie renamed to `auth_session` via `cookies.sessionToken.name` config
- **FingerprintJS Pro:** `@fingerprintjs/fingerprintjs-pro-react` client hook + `@fingerprintjs/fingerprintjs-pro-server-api` for server verification; Pro tier required — OSS is insufficient for a security PoC
- **Prisma 5 + Neon/Vercel Postgres:** ORM with schema migrations; Neon is Vercel-native and serverless-compatible; SQLite rejected (no persistent filesystem on Vercel)
- **Anthropic SDK (`@anthropic-ai/sdk`):** Server-side only; default model `claude-opus-4-6`; called only on confirmed mismatches, not on every request
- **Zod:** Runtime validation of Claude API response shape and fingerprint POST payloads
- **TanStack React Query:** Dashboard polling at 5-second intervals; simpler than SSE for a PoC

**Critical version constraint:** Prisma does not support the Vercel Edge Runtime. All Route Handlers that touch the database or the Anthropic SDK must declare `export const runtime = 'nodejs'`.

### Expected Features

The MVP must prove the core loop: "stolen cookie detected, AI evaluated, dashboard flagged." Everything beyond that is polish.

See `/Users/davidkwartler/sentinel/.planning/research/FEATURES.md` for full prioritization matrix and feature dependency graph.

**Must have (table stakes — P1):**
- Google OAuth sign-in with visible `auth_session` cookie in DevTools
- 2-3 auth-gated e-commerce pages (products, cart, checkout) — gives the session realistic surface area
- FingerprintJS capture on every authenticated page load with POST to ingest endpoint
- Session-to-fingerprint mapping persisted in database
- Mismatch detection: second distinct fingerprint on same session triggers a detection event
- Claude API call on mismatch returning `{score: number, reasoning: string}`
- Security dashboard: session table with fingerprint IDs, IP, user-agent, and status badges
- Dashboard flags sessions above a hardcoded threshold (e.g., 70)
- Simulation guide (README): step-by-step cookie copy/paste walkthrough for Device A to Device B

**Should have (portfolio quality — P2):**
- Claude reasoning transcript in an expandable panel — makes the AI analysis visible, which is the PoC's main differentiator
- Delta visualization (fingerprint diff view) — shows exactly which signals diverged
- Configurable confidence threshold slider — turns the dashboard into an interactive demo
- Session timeline view — shows the attack story as a sequence of fingerprint events

**Defer (v2+ — P3):**
- "Replay attack" button (requires backend simulation endpoint)
- Confidence score history chart (requires multiple Claude calls per session)
- False positive scenario scripting (high setup complexity for marginal gain)

**Anti-features (explicitly excluded):**
- Session termination / forced logout — days of work for zero demo value
- Real-time WebSocket push — polling every 5s is imperceptible; WebSocket on Vercel serverless is fiddly
- Real payment processing, IP geolocation heatmaps, mobile native app, rate limiting, automated remediation rules

### Architecture Approach

The system follows a strict layered architecture: thin Edge Middleware for auth-only validation, a Node.js Route Handler (`/api/session/record`) that handles fingerprint ingest and detection in sequence (no inter-function HTTP round-trips), and a polling dashboard that reads a denormalized `flagged` + `confidence_score` field on the sessions table for fast queries. Detection logic lives in `lib/detection.ts` as pure TypeScript functions, making it independently testable. Claude is called from `lib/claude.ts` which owns the prompt template. The critical constraint is that middleware cannot touch the database — it only validates the JWT signature using Web Crypto, then passes through.

See `/Users/davidkwartler/sentinel/.planning/research/ARCHITECTURE.md` for system diagram, all four data flows, full database schema, and the recommended build order.

**Major components:**
1. **`(shop)/layout.tsx` + `FingerprintReporter.tsx`:** Client component that runs FingerprintJS SDK on every authenticated page and POSTs `visitorId` to the ingest endpoint; intentionally invisible
2. **`/api/session/record` Route Handler:** Receives fingerprint tuples; looks up session's known fingerprint; if mismatch, inserts detection event and invokes Claude via direct function call (not a separate HTTP request)
3. **`lib/detection.ts`:** Pure functions for fingerprint comparison — `detectMismatch(existing, incoming)` returns a boolean and the delta metadata
4. **`lib/claude.ts`:** Builds structured metadata diff prompt; calls Anthropic SDK; parses `{score, reasoning, signals}` from response; validates with Zod
5. **`/api/dashboard/sessions` Route Handler:** Returns session list with latest fingerprint summary and detection event data; never returns raw cookie values
6. **`/dashboard` page:** Polls sessions API every 5s via React Query; renders session table with flag badges and confidence scores
7. **`middleware.ts`:** Auth gate only — reads session cookie, validates JWT signature, redirects unauthenticated requests; zero database access

**Database schema (3 detection-specific tables):**
- `sessions`: auth state + `flagged` bool + `confidence_score` (denormalized for dashboard)
- `fingerprints`: all fingerprint tuples per session, with `is_original` flag; indexed on `session_id`
- `detection_events`: anomaly records with `fp_original_id`, `fp_anomaly_id`, `confidence_score`, `reasoning`, `status` (pending/analyzed/dismissed)

### Critical Pitfalls

The full list of 10 pitfalls with prevention strategies is in `/Users/davidkwartler/sentinel/.planning/research/PITFALLS.md`. The top five that can silently break the PoC:

1. **Claude API on the detection hot path** — Calling Claude synchronously in the session record route blocks the response for 2-8s. Prevention: insert a `PENDING` detection event immediately, return the HTTP response, then resolve Claude asynchronously. Dashboard reads the `PENDING → ANALYZED` state transition on its next poll cycle. This is the single most dangerous implementation mistake.

2. **FingerprintJS instability producing false positives** — `visitorId` changes in incognito mode and on browser version updates. Prevention: always use two distinctly different browsers (Chrome vs. Firefox) for Device A and Device B in the simulation, never normal vs. incognito of the same browser. Treat fingerprint mismatch as a signal requiring Claude's scoring, not as a binary hijack indicator.

3. **Cookie flags blocking the simulation** — `SameSite=Strict` on the session cookie prevents the cookie copy/paste simulation from working as expected. Prevention: use `SameSite=Lax` (not Strict, not None). Keep `HttpOnly=true` (DevTools Application panel still shows the value for manual copying even with HttpOnly). Set `Secure=false` in local dev, `Secure=true` on Vercel.

4. **Detection logic placed in Edge Middleware** — Prisma, the Anthropic SDK, and any Node.js native module cannot run in the Vercel Edge Runtime. Attempting to do fingerprint checking in `middleware.ts` produces cryptic build errors or silent failures. Prevention: middleware does JWT validation only; all detection is in Node.js Route Handlers with `export const runtime = 'nodejs'`.

5. **Serverless in-memory session state** — A `const sessions = new Map()` in an API route works locally (persistent Node.js process) but resets between Vercel function invocations. Prevention: use a persistent database from day one, never module-level variables for session state. This mistake is discovered only on first Vercel deployment.

## Implications for Roadmap

The architecture research provides an explicit, dependency-ordered build sequence. Every phase maps to a dependency that must exist before the next phase can be built. The suggested 7-phase structure below tracks that dependency chain exactly.

### Phase 1: Foundation — Auth and Database
**Rationale:** Every other component depends on authenticated sessions and a persistent database. Auth must come first because session IDs don't exist without it; the database must come first because Vercel serverless cannot use in-memory state.
**Delivers:** Working Google OAuth login, `auth_session` cookie visible in DevTools, Prisma schema deployed to Neon, middleware protecting shop routes. A user can log in and see a protected page.
**Addresses:** Google OAuth sign-in (P1 table stake), `auth_session` cookie requirement
**Avoids:** In-memory session state pitfall (Pitfall 5), OAuth CSRF mishandling (Pitfall 4), serverless cold start state loss

### Phase 2: E-Commerce Shell
**Rationale:** The fingerprint capture has no surface to run on without authenticated pages. The shell also provides the realistic session context that makes the demo credible.
**Delivers:** 3-4 auth-gated e-commerce pages (products, cart, checkout) with static/mock data; the `auth_session` cookie is manually copyable from DevTools Application panel.
**Addresses:** Auth-gated pages (P1), "logged in as" nav indicator (P1), Device A login UX (P1)
**Uses:** Next.js App Router route groups `(shop)/layout.tsx`; Tailwind for UI

### Phase 3: Fingerprint Capture
**Rationale:** Fingerprint capture requires authenticated pages to trigger on. Ingest-only (no detection yet) gives a clean milestone: verified that FingerprintJS fires on every page load and writes to the database before adding mismatch logic.
**Delivers:** `FingerprintReporter` client component in shop layout; `/api/session/record` route that only inserts (no comparison yet); `fingerprints` table populated on page navigation.
**Addresses:** Fingerprint capture per request (P1), session-to-fingerprint mapping store (P1)
**Avoids:** FingerprintJS client timing race (Pitfall 7 — fingerprint absence must not trigger detection), FingerprintJS in Server Component (Pitfall — must be `"use client"`)
**Research flag:** Verify FingerprintJS Pro visitorId stability during this phase by testing cross-device with two different browsers before wiring detection.

### Phase 4: Detection Engine
**Rationale:** Detection requires stored fingerprint tuples to compare against — can only be built after Phase 3 has populated the database. Isolating detection as a phase (before Claude) creates a clean integration test: a mismatch event row should appear without any AI involvement.
**Delivers:** `lib/detection.ts` with pure mismatch comparison functions; `detection_events` table; mismatch logic wired into `/api/session/record`; manual cross-browser test confirms detection fires.
**Addresses:** Mismatch detection logic (P1 table stake)
**Avoids:** Detection in Edge Middleware (Pitfall 10 — must be Node.js Route Handler), trusting client-supplied sessionId (Pitfall — use `getServerSession()`)

### Phase 5: Claude Integration
**Rationale:** Claude can only be wired in after confirmed mismatch events exist to trigger it. The async pattern (PENDING → ANALYZED) must be designed in this phase, not retrofitted.
**Delivers:** `lib/claude.ts` with structured metadata diff prompt builder; Anthropic SDK call on mismatch; `confidence_score` and `reasoning` persisted to `detection_events` and denormalized to `sessions.confidence_score`; sessions table updated to `flagged: true` above threshold.
**Addresses:** Claude API call on mismatch (P1), confidence score (P1)
**Avoids:** Claude on hot path blocking responses (Pitfall 1 — insert PENDING immediately, resolve async), sensitive data in Claude prompt (Pitfall 8 — hash IPs, use relative labels not raw UA strings)
**Research flag:** This phase has the highest integration uncertainty — Claude's JSON response format must be validated with Zod and tested with real mismatches before wiring to the dashboard. Build a test script that fires a synthetic mismatch and logs the full Claude response.

### Phase 6: Security Dashboard
**Rationale:** Dashboard requires detection events and flagged sessions to display. Building it last ensures the data model is stable before the UI is created.
**Delivers:** `/api/dashboard/sessions` authenticated endpoint; `/dashboard` page with session table, fingerprint summaries, confidence scores, and flag badges; 5-second polling via React Query; dashboard itself requires authentication.
**Addresses:** Dashboard session list (P1), flagged session highlighting (P1), confidence score display (P1)
**Avoids:** Session tokens exposed in dashboard API (Pitfall 9 — never return raw cookie values), dashboard accessible without auth (Pitfall 9), full table scan on poll (anti-pattern 4 — add `ORDER BY created_at DESC LIMIT 50`)

### Phase 7: Polish and Deploy
**Rationale:** Deploy last to catch Vercel-specific failures (env var injection, connection pooling, cold start behavior) that don't appear locally.
**Delivers:** Vercel deployment with all 5 env vars configured; simulation documentation (step-by-step cookie copy/paste walkthrough); configurable detection threshold via env var; P2 features (Claude reasoning transcript, delta visualization, threshold slider) if time allows.
**Addresses:** Cookie copy simulation guide (P1), Vercel deployment, P2 portfolio-quality features
**Avoids:** Database connection pool exhaustion (Pitfall 6 — use pooled `POSTGRES_URL` not `DATABASE_URL` in serverless functions), `NEXTAUTH_SECRET` committed to git (always Vercel env vars)

### Phase Ordering Rationale

- Auth precedes everything because session IDs are the primary key for the entire detection system
- E-commerce shell precedes fingerprint capture because FingerprintJS needs authenticated pages to run on
- Fingerprint capture precedes detection because detection compares new tuples against stored tuples
- Detection precedes Claude because Claude is only invoked on a confirmed mismatch
- Detection engine precedes dashboard because the dashboard reads detection event rows
- Deployment is last to surface Vercel-specific environment differences cleanly

The grouping also follows a risk-ordered sequence: each phase can be independently verified (login works, pages load, fingerprint fires, detection row appears, Claude score appears, dashboard shows flag) so that failures are isolated to the most recently added phase.

### Research Flags

Phases needing deeper research or careful validation during planning:

- **Phase 3 (Fingerprint Capture):** Verify FingerprintJS Pro's cross-device visitorId stability with actual hardware before assuming the mismatch detection premise holds. The OSS vs. Pro capability boundary was researched from training data — test empirically during implementation.
- **Phase 5 (Claude Integration):** The async detection pattern (PENDING → ANALYZED) is the most complex data flow. The Claude response JSON schema must be validated with Zod. Build an isolated test harness before wiring to the dashboard. Claude latency under load during demo is unpredictable — test with realistic mismatch cadence.
- **Phase 7 (Deploy):** Auth.js v5 cookie configuration on Vercel (specifically `NEXTAUTH_URL` and `auth_session` cookie renaming) has known gotchas. Test OAuth callback on the production Vercel URL before the demo day.

Phases with well-documented patterns (standard implementation, research unnecessary):

- **Phase 1 (Auth and Database):** Google OAuth with Auth.js v5 + Prisma adapter is thoroughly documented. Follow the scaffold pattern from STACK.md and ARCHITECTURE.md.
- **Phase 2 (E-Commerce Shell):** Static Next.js App Router pages. No novel patterns required.
- **Phase 6 (Dashboard):** React Query polling + authenticated API endpoint is a standard pattern. Follow the component structure from ARCHITECTURE.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Technology choices are well-reasoned but versions (Next.js 15, Auth.js v5, FingerprintJS Pro 2.x) should be verified against current npm before pinning. Run `npm show <package> version` for each dependency before implementation. |
| Features | MEDIUM | Core table stakes are stable (session hijack detection is a mature domain). P2/P3 features should be validated against current FingerprintJS Pro docs since fingerprint component data availability depends on the Pro plan tier. |
| Architecture | HIGH | The Edge Runtime vs. Node.js Runtime constraint is a hard technical limit, not an opinion. The ingest-then-detect pattern and database schema are well-established for this type of system. The 4 data flows are internally consistent and cover all demo scenarios. |
| Pitfalls | HIGH | Pitfalls are drawn from official documentation for each technology. The Claude-on-hot-path and in-memory-state pitfalls are canonical Vercel serverless issues with clear, tested prevention strategies. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **FingerprintJS Pro visitorId cross-device stability:** Confirmed by documentation but should be empirically tested with two physical devices or two distinct browsers in Phase 3 before building detection logic on top of the stability assumption. If Pro visitorId proves insufficiently stable, the detection threshold must be tuned before Phase 5.
- **Auth.js v5 stable release status:** STACK.md notes v5 was in RC through mid-2025. Confirm `npm show next-auth version` returns a stable (non-RC) release before starting Phase 1. If still in RC, evaluate whether to pin to v4 or accept the RC.
- **Claude async pattern implementation:** PITFALLS.md recommends fire-and-forget for the Claude call but does not specify the exact Vercel mechanism (`waitUntil` is Edge-only; background Route Handler POST is the Node.js approach). Confirm the async dispatch pattern during Phase 5 planning.
- **Vercel Postgres connection string naming:** STACK.md references `@vercel/postgres` with `DATABASE_URL`; PITFALLS.md specifies `POSTGRES_URL` (pooled) vs. `DATABASE_URL` (non-pooled). Verify the current Vercel Postgres env var naming convention at `vercel.com/storage/postgres` before configuring env vars in Phase 1.

## Sources

### Primary (HIGH confidence)
- Next.js App Router official documentation — Edge Runtime constraints, Route Handler patterns, middleware limitations
- Vercel serverless function documentation — cold start behavior, connection pooling requirements, Edge Runtime limitations
- Anthropic API documentation — rate limits, error codes, SDK usage patterns
- OWASP Session Management Cheat Sheet — session hijack attack surface (stable reference)

### Secondary (MEDIUM confidence)
- Auth.js v5 (NextAuth) documentation — Google provider, Prisma adapter, cookie configuration
- FingerprintJS Pro documentation — React SDK, server API, visitorId stability characteristics
- Vercel Postgres / Neon integration documentation — pooled vs. non-pooled connection strings
- Auth0 Anomaly Detection feature set — comparable system for feature benchmarking
- Cloudflare Bot Management overview — comparable system for feature benchmarking

### Tertiary (LOW confidence)
- Tailwind CSS v4 compatibility with Next.js 15 — was emerging at training cutoff; verify before using v4 (recommend v3)
- `@auth/prisma-adapter` v2.x exact API — tied to Auth.js v5 RC; verify against stable release docs
- FingerprintJS Pro cross-incognito behavior — documented in FingerprintJS changelog but requires empirical validation for this use case

---
*Research completed: 2026-02-28*
*Ready for roadmap: yes*
