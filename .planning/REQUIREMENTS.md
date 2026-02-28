# Requirements: Sentinel

**Defined:** 2026-02-28
**Core Value:** When a stolen session cookie is used from a different device, Sentinel detects it, calls Claude for analysis, and flags the session with a confidence score on the dashboard.

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can sign in via Google OAuth
- [ ] **AUTH-02**: Session cookie named `auth_session` is readable in DevTools Application panel (SameSite=Lax; enables manual cookie copy for simulation)
- [ ] **AUTH-03**: Session persists across page navigations without re-authenticating
- [ ] **AUTH-04**: Unauthenticated requests to protected routes are redirected to the login page

### E-Commerce Shell

- [ ] **SHOP-01**: Authenticated user can browse a product listing page
- [ ] **SHOP-02**: Authenticated user can view their account/profile page

### Fingerprint Capture

- [ ] **FP-01**: FingerprintJS Pro client captures visitorId on every authenticated page load
- [ ] **FP-02**: visitorId is cached in sessionStorage with a configurable TTL; Pro API is called only on cache miss or expiry (not on every navigation)
- [ ] **FP-03**: Client POSTs visitorId + requestId to server only when a fresh fingerprint is captured (cache hit skips the POST)
- [ ] **FP-04**: Server stores `{sessionId, visitorId, OS, browser, screenResolution, timezone, ipAddress, userAgent}` tuple in database
- [ ] **FP-05**: Server skips duplicate submissions (idempotent on requestId — same requestId already recorded is a no-op)

### Detection

- [ ] **DETECT-01**: System detects when a second distinct visitorId appears on an active sessionId
- [ ] **DETECT-02**: System performs component-level similarity check before triggering Claude — compares OS, browser family, timezone, and screen resolution; weights similarity to reduce false positives before escalating
- [ ] **DETECT-03**: Detection events are persisted: timestamp, sessionId, original visitorId, new visitorId, IP address of both requests

### AI Analysis

- [ ] **AI-01**: Fingerprint mismatch triggers an async Claude API call — HTTP response returns immediately with PENDING state; analysis completes out-of-band
- [ ] **AI-02**: Claude returns structured JSON containing a confidence score (0–100) and a human-readable reasoning string
- [ ] **AI-03**: Claude model is configurable via `ANTHROPIC_MODEL` environment variable (no code changes required to swap models)

### Security Dashboard

- [ ] **DASH-01**: Dashboard lists all active sessions with associated visitorId, IP address, user-agent, and status badge (ACTIVE / PENDING / FLAGGED / CLEAR)
- [ ] **DASH-02**: Sessions whose Claude confidence score exceeds a configurable threshold are visually flagged
- [ ] **DASH-03**: Each flagged session has an expandable panel displaying Claude's full reasoning transcript alongside the confidence score

## v2 Requirements

### Detection Enhancements

- **DETECT-04**: Fingerprint delta visualization — diff view showing exactly which signal components diverged between FP_01 and FP_02
- **DETECT-05**: Session timeline view — chronological sequence of fingerprint events for a single session

### Dashboard Enhancements

- **DASH-04**: Configurable confidence threshold slider — adjust sensitivity live on the dashboard
- **DASH-05**: Confidence score history chart per session (sparkline) — shows score progression across multiple Claude calls

### Simulation Tooling

- **SIM-01**: "Replay attack" button on dashboard — one-click simulation without manual cookie copy

### Resilience

- **RES-01**: Graceful degradation if Claude API is unavailable (UNKNOWN state, not crash) — deferred since this is a PoC/demo context

## Out of Scope

| Feature | Reason |
|---------|--------|
| Server-side FingerprintJS verification (requestId validation via Server API) | Adds API cost + complexity; client-supplied visitorId is sufficient for PoC trust model |
| Session termination / forced logout on hijack detection | Detection and flagging only for v1; remediation is out of scope |
| Cart page | Profile + product listing provides sufficient session surface; cart adds no detection value |
| Real payment processing | E-commerce shell is UI-only demo; PCI scope is out of scope |
| Real-time WebSocket dashboard updates | Polling every 5–10s is imperceptible during demos; WebSocket on Vercel adds complexity |
| Email / SMS alerts | On-screen flagging sufficient for demo; notification integration is future work |
| Mobile native app | Web-first; mobile fingerprinting has different mechanics |
| Multi-tenant / team accounts | Single-user namespace for PoC |
| OAuth providers beyond Google | One provider sufficient |
| IP geolocation heatmaps | IP address as plain text is sufficient for v1 |
| Automated remediation rules | Human-in-the-loop for detection decisions |

## Traceability

All 20 v1 requirements are mapped to Phases 1-6. Phase 7 (Deploy and Polish) carries no new requirements — it validates the full system in the production environment and produces the simulation walkthrough.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| SHOP-01 | Phase 2 | Pending |
| SHOP-02 | Phase 2 | Pending |
| FP-01 | Phase 3 | Pending |
| FP-02 | Phase 3 | Pending |
| FP-03 | Phase 3 | Pending |
| FP-04 | Phase 3 | Pending |
| FP-05 | Phase 3 | Pending |
| DETECT-01 | Phase 4 | Pending |
| DETECT-02 | Phase 4 | Pending |
| DETECT-03 | Phase 4 | Pending |
| AI-01 | Phase 5 | Pending |
| AI-02 | Phase 5 | Pending |
| AI-03 | Phase 5 | Pending |
| DASH-01 | Phase 6 | Pending |
| DASH-02 | Phase 6 | Pending |
| DASH-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 (Phase 7 is production delivery — no new requirements)

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after roadmap creation — traceability confirmed*
