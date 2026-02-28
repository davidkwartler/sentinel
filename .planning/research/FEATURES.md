# Feature Research

**Domain:** Session Hijack Detection PoC + Security Dashboard
**Researched:** 2026-02-28
**Confidence:** MEDIUM (training knowledge; WebSearch/WebFetch unavailable in this session — see Sources)

---

## Feature Landscape

This PoC has two distinct surfaces with different feature expectations:
- **E-Commerce Shell** — simulates a realistic authenticated app that generates sessions worth stealing
- **Detection Layer + Dashboard** — monitors those sessions, detects fingerprint mismatches, invokes Claude, and presents results

Features are assessed across both surfaces below.

---

### Table Stakes (Users Expect These)

Features that a demo reviewer or technical interviewer will expect. Missing any of these makes the PoC feel unfinished.

#### E-Commerce Shell

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Google OAuth sign-in | Without real login there's no real session to steal — the entire PoC premise collapses | LOW | NextAuth.js + Google provider; session cookie (`auth_session`) must be visible in DevTools |
| Auth-gated pages (product browse, cart, profile) | Gives the simulated session surface area — a PoC with one page looks thin | LOW | 3-4 pages is enough; no real data needed |
| Persistent `auth_session` cookie with `HttpOnly: false` | Cookie must be copyable from DevTools for the simulation to work | LOW | Intentionally insecure for demo — document this in README |
| "Logged in as" header/nav indicator | Reviewer needs to see who is authenticated to understand the session context | LOW | User avatar + email from OAuth profile |
| Device A login page with clear UX | Demo script starts here — "Device A logs in" must be obvious | LOW | Standard OAuth redirect flow |

#### Detection Layer

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Fingerprint capture on every authenticated request | Core mechanism — if fingerprint isn't captured per-request, nothing works | MEDIUM | FingerprintJS `getResult()` called client-side on each page load; visitorId sent with request |
| Session-to-fingerprint mapping store | Without persistence, mismatches can't be detected across requests | MEDIUM | Single table: `{session_id, fingerprint_id, ip_address, user_agent, timestamp}` |
| Mismatch detection logic | The core detection event — second distinct fingerprint on same session | MEDIUM | Server-side comparison: "has this session_id been seen with a different fingerprint_id?" |
| Claude API call on mismatch | The GenAI showcase layer — without this it's just a rule-based comparator | MEDIUM | Structured prompt with both fingerprint tuples; returns JSON confidence score |
| Claude confidence score display | Reviewer needs to see the AI output, not just "flagged" | LOW | 0–100 score + reasoning text from Claude |
| Security dashboard with session list | Main demo surface for the detection side | MEDIUM | Table/list of active sessions with status badges |
| Flagged session highlighting | Without visual differentiation, the detection result is invisible | LOW | Red badge / row highlight for sessions above threshold |

#### Simulation Tooling

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Cookie copy instructions in UI or README | Without a clear "how to simulate the attack" path, the demo is confusing | LOW | DevTools walkthrough or a dedicated "Simulation Guide" tab |
| Clear Device A / Device B distinction in dashboard | Reviewer needs to see the before/after states side-by-side | LOW | Session table shows original fingerprint vs. attacker fingerprint |

---

### Differentiators (Competitive Advantage)

Features that make the PoC stand out as a portfolio piece — not expected, but impressive.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Claude reasoning transcript | Shows the actual LLM reasoning, not just a number — demonstrates prompt engineering skill | LOW | Display the full `reasoning` field from Claude's response in an expandable panel |
| Delta visualization (what changed) | Shows exactly which fingerprint signals diverged (OS, browser, timezone, GPU) — makes the detection intuitive | MEDIUM | Diff view between fingerprint_1 and fingerprint_2 signal objects |
| Configurable confidence threshold slider | Lets demo viewer tune sensitivity live — turns a static demo into an interactive one | LOW | Slider on dashboard; sessions above threshold get flagged; state held in React state |
| Session timeline view | Shows the sequence of fingerprint events on a session over time — tells the attack story visually | MEDIUM | Simple timeline component: FP_01 at t0, FP_02 at t+5min |
| "Replay attack" button | One-click simulation from the dashboard — removes manual cookie copying step during live demos | MEDIUM | Requires server-side endpoint that re-issues a request as if from a different fingerprint |
| Confidence score history chart | Shows score progression if Claude is called multiple times — illustrates detection drift | MEDIUM | Small sparkline per session using a charting lib (Recharts or similar) |
| False positive explainer | Shows cases where same user on VPN gets a non-flagged score — demonstrates Claude's value over dumb rules | HIGH | Requires scripted scenario with known-benign fingerprint shift; high setup complexity for marginal gain |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build for a PoC — scope traps that look like requirements.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Session termination / forced logout | "Feels like a real security tool" | Requires session invalidation infrastructure, server-side token blacklist, and logout propagation — days of work for zero demo value | Show "would terminate session" as a disabled action button with a tooltip |
| Real-time WebSocket push to dashboard | "Security dashboards refresh live" | WebSocket server on Vercel is fiddly (Edge Functions have connection limits); polling every 5s is invisible to the reviewer and far simpler | 5-second polling interval — imperceptible difference during demo |
| Multi-tenant / team accounts | "Would be a real product" | Doubles auth complexity, adds RBAC, makes the data model 3x larger | Explicitly single-user; document this as "PoC scope" |
| Historical analytics / reporting | "Good security tools have analytics" | Requires time-series storage, aggregation queries, charting infrastructure — weeks of work | Show session list with timestamps; that's enough to demonstrate data retention |
| Email / SMS alerts | "Real detection should notify" | Requires Twilio/SendGrid integration, deliverability config, opt-in flow — orthogonal to the core demo | Show on-screen alert badges; document alert integration as a future phase |
| Real payment processing | "Makes the e-commerce shell more realistic" | PCI compliance, Stripe webhooks, order management — completely orthogonal to session detection | Static "Order Confirmed" page; label checkout as demo mode |
| IP geolocation heatmaps | "Visual and impressive" | Requires a geo API, map rendering library, and meaningful data volume | Show IP address and user-agent string as plain text in the mismatch detail view |
| Mobile native app | "Shows mobile attack vectors" | Doubles platform scope; mobile has different fingerprinting mechanics | Web-only; note mobile as a future expansion |
| Rate limiting / brute-force protection | "Security tool should protect itself" | Orthogonal to session hijack detection; adds middleware complexity | Document as out-of-scope; PoC assumes trusted demo environment |
| Automated remediation rules | "Auto-block suspicious sessions" | Requires rule engine, escalation logic, override workflows | Detection + flagging only; action is the human's job |

---

## Feature Dependencies

```
[Google OAuth] ──requires──> [auth_session cookie]
    └──requires──> [Auth-gated pages]

[auth_session cookie]
    └──enables──> [Cookie copy simulation]

[FingerprintJS client capture]
    └──requires──> [Authenticated page load]
    └──sends──> [Session-to-fingerprint mapping store]

[Session-to-fingerprint mapping store]
    └──enables──> [Mismatch detection logic]

[Mismatch detection logic]
    └──triggers──> [Claude API call]
        └──returns──> [Confidence score]
            └──drives──> [Dashboard flagging]

[Dashboard session list]
    └──requires──> [Session-to-fingerprint mapping store]
    └──enhances──> [Delta visualization]

[Delta visualization] ──enhances──> [Claude reasoning transcript]

[Configurable threshold] ──enhances──> [Dashboard flagging]

[Session timeline] ──requires──> [Session-to-fingerprint mapping store]
[Session timeline] ──enhances──> [Delta visualization]
```

### Dependency Notes

- **Google OAuth requires auth_session cookie:** NextAuth.js session cookie is the artifact being "stolen" — without real OAuth the session has no meaning.
- **FingerprintJS requires authenticated page load:** The fingerprint is only meaningful when tied to an authenticated session; unauthenticated fingerprints have no hijack surface.
- **Mismatch detection requires the mapping store:** You cannot detect a second fingerprint without having persisted the first one.
- **Claude API call requires mismatch detection:** Claude is only invoked on a detected mismatch event — don't call Claude on every request (cost and latency).
- **Delta visualization enhances Claude reasoning:** The diff view makes Claude's reasoning legible — reviewers can see exactly what changed and why Claude flagged it.
- **Configurable threshold enhances flagging:** The threshold is a display-layer concern only — it does not change what gets stored or what Claude analyzes.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to prove "stolen cookie detected, AI evaluated, dashboard flagged."

- [ ] Google OAuth sign-in with visible `auth_session` cookie
- [ ] 2-3 auth-gated e-commerce pages (product list, cart, profile)
- [ ] FingerprintJS capture on each authenticated page load
- [ ] Session-to-fingerprint mapping persisted in database
- [ ] Mismatch detection: second distinct fingerprint on same session triggers event
- [ ] Claude API call with structured fingerprint delta prompt; returns `{confidence: number, reasoning: string}`
- [ ] Security dashboard: session list table with fingerprint IDs, IP, user-agent, status badge
- [ ] Dashboard flags sessions above hardcoded threshold (e.g., 70)
- [ ] README simulation guide: step-by-step cookie copy/paste flow for Device A → Device B

### Add After Validation (v1.x)

Features to add once the core detection loop is working end-to-end.

- [ ] Claude reasoning transcript expandable panel — add once Claude integration confirmed working
- [ ] Delta visualization (fingerprint diff view) — add once schema is stable
- [ ] Configurable confidence threshold slider — add once dashboard layout is set
- [ ] Session timeline view — add if time allows before portfolio presentation

### Future Consideration (v2+)

Features to defer; not needed to validate the concept.

- [ ] "Replay attack" button — useful for live demos but requires backend simulation endpoint; build only if demo cadence justifies it
- [ ] Confidence score history chart — requires multiple Claude calls per session; adds complexity and API cost
- [ ] False positive scenario scripting — valuable for showing Claude's intelligence but requires careful test data setup

---

## Feature Prioritization Matrix

| Feature | Demo Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Google OAuth + session cookie | HIGH | LOW | P1 |
| Auth-gated e-commerce pages | HIGH | LOW | P1 |
| FingerprintJS capture per request | HIGH | MEDIUM | P1 |
| Session-fingerprint mapping store | HIGH | MEDIUM | P1 |
| Mismatch detection logic | HIGH | MEDIUM | P1 |
| Claude API call on mismatch | HIGH | MEDIUM | P1 |
| Confidence score display | HIGH | LOW | P1 |
| Dashboard session list | HIGH | MEDIUM | P1 |
| Dashboard flagging / badges | HIGH | LOW | P1 |
| Cookie copy simulation guide | HIGH | LOW | P1 |
| Claude reasoning transcript | MEDIUM | LOW | P2 |
| Delta visualization (diff view) | MEDIUM | MEDIUM | P2 |
| Configurable threshold slider | MEDIUM | LOW | P2 |
| Session timeline | MEDIUM | MEDIUM | P2 |
| "Replay attack" button | LOW | MEDIUM | P3 |
| Confidence score history chart | LOW | MEDIUM | P3 |
| IP geolocation display | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch — demo fails without it
- P2: Should have — makes PoC portfolio-quality
- P3: Nice to have — add only if core is complete and stable

---

## Comparable System Feature Analysis

These are real-world systems with session anomaly detection. This maps their features to Sentinel's scope.

| Feature | Auth0 Anomaly Detection | Cloudflare Bot Management | Sentinel PoC Approach |
|---------|------------------------|--------------------------|----------------------|
| Fingerprint capture | Device fingerprint via heuristics | Browser fingerprint + behavioral signals | FingerprintJS Pro SDK — explicit, hardware-stable visitorId |
| Session binding | Session tied to device profile | Request tied to bot score | Explicit `{session_id, fingerprint_id}` tuple in DB |
| Mismatch detection | Impossible travel, new device | Score threshold per request | Second distinct fingerprint_id on existing session_id |
| AI/ML analysis | Rule-based + ML anomaly scoring | ML model, not exposed | Claude prompt with structured delta metadata |
| Dashboard | Admin portal with event log | Firewall analytics | Custom dashboard with session table + flagging |
| Alert mechanism | Email notification | Block/challenge action | Visual badge on dashboard (alert integration deferred) |
| Simulation tooling | None (production system) | None (production system) | Explicit cookie copy/paste flow — unique to PoC |
| Confidence score | Opaque ML score | Opaque bot score | Explicit 0–100 score + human-readable reasoning from Claude |

**Key insight:** Commercial systems hide their scoring logic. Sentinel's differentiator is transparency — the Claude reasoning is fully visible, making the detection explainable. This is the portfolio angle.

---

## Sources

- FingerprintJS Pro documentation (training knowledge, MEDIUM confidence) — verify at https://dev.fingerprint.com/docs
- Auth0 Anomaly Detection feature set (training knowledge, MEDIUM confidence) — verify at https://auth0.com/docs/secure/attack-protection/anomaly-detection
- OWASP Session Management Cheat Sheet — standard session hijack attack surface (HIGH confidence, stable reference)
- Cloudflare Bot Management feature overview (training knowledge, MEDIUM confidence)
- General SOC dashboard UX patterns — well-established domain (MEDIUM confidence)

**Confidence note:** WebSearch and WebFetch were unavailable during this research session. All findings are based on training knowledge of the session security and browser fingerprinting domains (knowledge cutoff August 2025). The feature landscape for session hijack detection is a mature, stable domain — core table stakes are unlikely to have shifted. Differentiators and anti-features should be validated against current FingerprintJS Pro docs before phase planning.

---
*Feature research for: Session Hijack Detection PoC (Sentinel)*
*Researched: 2026-02-28*
