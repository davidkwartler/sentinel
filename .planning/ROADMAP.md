# Roadmap: Sentinel

## Overview

Sentinel builds in seven dependency-ordered phases, each delivering one independently verifiable capability. The dependency chain is strict: authenticated sessions must exist before pages can be built, pages must exist before fingerprints can be captured, fingerprints must be stored before mismatches can be detected, mismatches must exist before Claude can analyze them, and Claude scores must exist before the dashboard can display them. Deployment comes last to surface Vercel-specific configuration issues cleanly against a fully functional local system.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Google OAuth, database sessions, Prisma schema, middleware auth gate
- [ ] **Phase 2: E-Commerce Shell** - Auth-gated product and profile pages giving the session realistic surface area
- [ ] **Phase 3: Fingerprint Capture** - FingerprintJS Pro client + server ingest with deduplication; fingerprint tuples written to database
- [ ] **Phase 4: Detection Engine** - Mismatch detection comparing new fingerprint tuples against stored originals; detection events persisted
- [ ] **Phase 5: Claude Integration** - Async Claude API call on confirmed mismatch returning structured confidence score and reasoning
- [ ] **Phase 6: Security Dashboard** - Authenticated session table with fingerprint summaries, confidence scores, flag badges, and expandable reasoning
- [ ] **Phase 7: Deploy and Polish** - Vercel production deployment with all env vars, simulation walkthrough documentation, configurable threshold

## Phase Details

### Phase 1: Foundation
**Goal**: Users can sign in with Google, stay authenticated across navigations, and unauthenticated access to protected routes is blocked — with all session state persisted to a real database
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. User can click "Sign in with Google," complete the OAuth flow, and land on a protected page without errors
  2. The `auth_session` cookie is visible in DevTools Application panel after sign-in (readable value, not just presence)
  3. Navigating between protected pages does not trigger re-authentication — the session persists
  4. Visiting a protected route while signed out redirects to the login page, not a 404 or unhandled error
  5. Prisma schema is deployed to Neon and the Auth.js session tables exist with rows after sign-in
**Plans**: 3 (01-PLAN: scaffold+DB, 02-PLAN: auth wiring, 03-PLAN: OAuth verification checkpoint)

### Phase 2: E-Commerce Shell
**Goal**: Authenticated users can browse a product listing and view their account profile — providing the realistic session surface area that makes the demo credible
**Depends on**: Phase 1
**Requirements**: SHOP-01, SHOP-02
**Success Criteria** (what must be TRUE):
  1. Authenticated user can navigate to a product listing page and see a grid of products (static/mock data is fine)
  2. Authenticated user can navigate to an account/profile page and see their session identity (name or email from OAuth)
  3. Both pages are unreachable without authentication — the auth gate from Phase 1 applies to the entire shop route group
**Plans**: TBD

### Phase 3: Fingerprint Capture
**Goal**: Every authenticated page load records a stable browser fingerprint in the database — ingest only, no detection logic yet
**Depends on**: Phase 2
**Requirements**: FP-01, FP-02, FP-03, FP-04, FP-05
**Success Criteria** (what must be TRUE):
  1. Loading any authenticated shop page triggers FingerprintJS Pro and produces a visitorId (visible in network requests or database)
  2. Navigating between shop pages does NOT call the FingerprintJS Pro API on every navigation — the sessionStorage cache is used on cache hits
  3. A fingerprint record row exists in the database after first page load, containing sessionId, visitorId, OS, browser, screenResolution, timezone, ipAddress, and userAgent
  4. Reloading the same page with the same requestId does not create a duplicate row — the server treats it as a no-op
**Plans**: TBD

### Phase 4: Detection Engine
**Goal**: When a second distinct visitorId appears on an active session, a detection event is persisted — verifiable without any Claude involvement
**Depends on**: Phase 3
**Requirements**: DETECT-01, DETECT-02, DETECT-03
**Success Criteria** (what must be TRUE):
  1. Simulating a session hijack (copy auth_session cookie to a second browser with a different visitorId) causes a detection_events row to appear in the database
  2. The detection event contains: timestamp, sessionId, original visitorId, new visitorId, and IP addresses of both requests
  3. Before a detection event is created, a component-level similarity check runs comparing OS, browser family, timezone, and screen resolution — and the result is reflected in the detection event (e.g., a field or log indicating whether similarity was factored)
  4. A second request from the same browser (same visitorId) on the same session does NOT create a detection event
**Plans**: TBD

### Phase 5: Claude Integration
**Goal**: A confirmed fingerprint mismatch triggers an asynchronous Claude API call that returns a structured confidence score and reasoning, stored in the database — the HTTP response returns immediately without blocking
**Depends on**: Phase 4
**Requirements**: AI-01, AI-02, AI-03
**Success Criteria** (what must be TRUE):
  1. After simulating a hijack, the HTTP response from the ingest endpoint returns quickly (under 1 second) with a PENDING status — not after Claude completes
  2. After Claude finishes (out-of-band), the detection_events row is updated with a numeric confidence score (0-100) and a human-readable reasoning string
  3. Swapping the `ANTHROPIC_MODEL` environment variable to a different model ID causes subsequent Claude calls to use that model — no code changes required
**Plans**: TBD

### Phase 6: Security Dashboard
**Goal**: An authenticated dashboard displays all active sessions with fingerprint metadata, confidence scores, and flag badges — and flagged sessions reveal Claude's full reasoning in an expandable panel
**Depends on**: Phase 5
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. Navigating to /dashboard while authenticated shows a table of all active sessions, each row displaying: visitorId, IP address, user-agent, and a status badge (ACTIVE / PENDING / FLAGGED / CLEAR)
  2. Navigating to /dashboard while unauthenticated redirects to the login page
  3. Sessions whose Claude confidence score exceeds the configured threshold display a visual flag distinguishing them from normal sessions
  4. Expanding a flagged session row reveals Claude's full reasoning transcript alongside the numeric confidence score
  5. The dashboard reflects new detection events without a page reload (polling updates the view within 10 seconds)
**Plans**: TBD

### Phase 7: Deploy and Polish
**Goal**: Sentinel runs on Vercel production with all secrets configured as environment variables, and a simulation walkthrough enables anyone to reproduce the hijack detection demo end-to-end
**Depends on**: Phase 6
**Requirements**: None (all 20 v1 requirements covered in Phases 1-6; this phase validates the full system in the production environment)
**Success Criteria** (what must be TRUE):
  1. The application is accessible at a public Vercel URL — Google OAuth callback, fingerprint ingest, detection, Claude analysis, and dashboard all function identically to local development
  2. All secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FINGERPRINTJS_API_KEY, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, NEXTAUTH_SECRET) are configured as Vercel environment variables and the app starts without any missing-env errors
  3. A simulation walkthrough (README or docs page) describes the exact steps to reproduce a hijack detection: Device A login, cookie copy from DevTools, Device B cookie paste, dashboard flag observation
  4. The deployed app does not expose raw session cookie values through any API endpoint
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/3 | Not started | - |
| 2. E-Commerce Shell | 0/TBD | Not started | - |
| 3. Fingerprint Capture | 0/TBD | Not started | - |
| 4. Detection Engine | 0/TBD | Not started | - |
| 5. Claude Integration | 0/TBD | Not started | - |
| 6. Security Dashboard | 0/TBD | Not started | - |
| 7. Deploy and Polish | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-28*
*Last updated: 2026-02-28 after initial roadmap creation*
