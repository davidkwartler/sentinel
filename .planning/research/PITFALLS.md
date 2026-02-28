# Pitfalls Research

**Domain:** Session hijack detection PoC — FingerprintJS + OAuth + Claude AI + Next.js/Vercel
**Researched:** 2026-02-28
**Confidence:** MEDIUM (web tools unavailable; findings drawn from official documentation knowledge, known GitHub issues, and well-documented community patterns for each technology in this stack)

---

## Critical Pitfalls

### Pitfall 1: Claude API Called Synchronously on Every Authenticated Request

**What goes wrong:**
The detection pipeline calls the Claude API inline on every fingerprint mismatch check. Even at the "only on mismatch" trigger, a cold Claude API response takes 2–8 seconds. If the call is on the hot path (blocking the HTTP response), every session page load that triggers detection hangs visibly. Users see the spinner; the PoC demo feels broken.

**Why it happens:**
The natural implementation pattern is: receive request → check fingerprint → if mismatch → call Claude → return response. Developers chain these as `await` calls in a single API route handler without considering that Vercel serverless functions have a 10-second default timeout (configurable to 60s on Pro, but 25s on the Edge Runtime) and that Claude API latency is non-deterministic.

**How to avoid:**
- Decouple detection from the request/response cycle. When a mismatch is detected, immediately write a `PENDING` record to the database and return the HTTP response to the client.
- Call Claude asynchronously from a separate background job or a second Vercel function invoked via `fetch` with `waitUntil` (if using Edge) or fire-and-forget POST to an internal API route.
- The dashboard polls or subscribes to the database for `PENDING → FLAGGED` state transitions.
- Only block the request if you need Claude's score to decide whether to allow or reject — which the PROJECT.md says is out of scope for v1 (detection only, no remediation).

**Warning signs:**
- API route handler contains `await anthropic.messages.create(...)` inside the same function that returns `NextResponse`
- No `PENDING` state in the session record schema
- Vercel function timeout errors in logs during demos

**Phase to address:** Fingerprint mismatch detection phase (when the Claude integration is wired in)

---

### Pitfall 2: FingerprintJS Fingerprint Instability Treated as Mismatch

**What goes wrong:**
FingerprintJS Pro's `visitorId` is designed to be stable across page loads on the same device/browser, but it changes in specific conditions: incognito/private mode generates a different ID than normal mode on the same device; browser major version updates (Chrome 118 → 119) can change the fingerprint; switching between a VPN on/off can change the IP component used in some fingerprint hashes; and clearing cookies (if using the cookie-linked Pro component) resets persistence. The PoC simulation plan is "Device A logs in, Device B uses stolen cookie" — but the demo itself might accidentally trigger false positives if the same developer tests with the same browser in different modes.

**Why it happens:**
Developers assume `visitorId` stability means "same browser = same ID always." The FingerprintJS Pro docs clarify the ID is stable for the same browser profile, not the same physical device. Private/incognito mode is treated as a separate browser profile by the SDK.

**How to avoid:**
- During the simulation, always use two distinctly different browsers (e.g., Chrome normal mode as Device A, Firefox as Device B) rather than normal vs. incognito of the same browser.
- Store the raw fingerprint components (screen resolution, timezone, platform, user agent) alongside the `visitorId` in the session record. This lets Claude reason about component-level similarity, not just ID equality.
- Do not treat a single `visitorId` change as a definitive hijack signal — treat it as a signal that requires Claude's confidence score before flagging.
- Implement a grace period or component-similarity threshold: if 8/10 components match, Claude should score this lower than a full hardware change.

**Warning signs:**
- Demo breaks when tester switches to incognito to "steal" the cookie — the legit user's fingerprint changes too
- High false positive rate during local development with DevTools open (some fingerprint components change with DevTools docked vs. floating)
- Dashboard shows rapid flag/unflag cycles for the same session

**Phase to address:** FingerprintJS integration phase (establish what constitutes a "real" mismatch before wiring up detection logic)

---

### Pitfall 3: Cookie Flags Blocking the Simulation

**What goes wrong:**
`HttpOnly` + `SameSite=Strict` cookie flags — which are the correct security defaults for session cookies — make the demo simulation impossible. `HttpOnly` prevents JavaScript from reading the cookie (so `document.cookie` in DevTools shows nothing to copy). `SameSite=Strict` prevents the cookie from being sent cross-site (irrelevant here) but combined with `HttpOnly` it also prevents easy extraction via DevTools for the simulation step.

More critically: the simulation requires copying the `auth_session` cookie from Device A's DevTools → manually inserting it into Device B's browser. This is feasible only if:
1. The cookie is readable in DevTools (Application → Cookies panel always shows cookies regardless of `HttpOnly` — this is fine, `HttpOnly` only blocks `document.cookie` in JS)
2. The cookie can be set manually in Device B's browser (DevTools Application panel → set cookie manually, or use a browser extension)

The actual trap is `SameSite=None` requiring `Secure`, which means HTTPS is required. Local dev on `http://localhost` won't set `SameSite=None; Secure` cookies correctly in Chrome.

**Why it happens:**
Developers copy Next.js auth boilerplate that sets `HttpOnly; SameSite=Strict; Secure` correctly for production, then wonder why the demo simulation doesn't work in local dev. The solution is environment-specific cookie flags.

**How to avoid:**
- Use `SameSite=Lax` (not Strict, not None) — this is the correct default for most web apps and doesn't break the simulation.
- Keep `HttpOnly=true` — this is fine for simulation since DevTools Application panel still shows the value for manual copying.
- In local dev, set `Secure=false` (cookies work over HTTP localhost). In production (Vercel), set `Secure=true`.
- Never set `SameSite=None` unless you need cross-site cookie sharing — it's not needed here.
- Document the exact DevTools steps for the simulation: Application → Cookies → copy `auth_session` value → in second browser: Application → Cookies → set `auth_session` to copied value.

**Warning signs:**
- Simulation instructions say "copy cookie from DevTools" but cookie value is blank in Application panel (impossible with proper setup — this would indicate a bug, not HttpOnly)
- Cookie not being sent on Device B after manual insertion
- `Set-Cookie` header missing `Secure` in production Vercel responses

**Phase to address:** OAuth + session setup phase (establish cookie configuration before building simulation)

---

### Pitfall 4: OAuth State Parameter Mishandling / CSRF on the Callback

**What goes wrong:**
Google OAuth requires a `state` parameter in the authorization URL to prevent CSRF on the callback. Next.js OAuth implementations (especially manual ones not using NextAuth) often omit this, store it in a non-HttpOnly cookie, or don't validate it on the callback. The result is an open redirect or CSRF vulnerability. For a PoC, this is "security theater" in the shell — but the simulation itself could break if state validation fails and the callback errors out.

**Why it happens:**
Manual OAuth implementations skip state validation because it works in the happy path without it. NextAuth handles this automatically; manual implementations don't.

**How to avoid:**
- Use NextAuth.js v5 (Auth.js) with the Google provider. It handles state generation, validation, PKCE, and session cookie management correctly.
- If implementing manually, generate a cryptographically random `state` value, store it in a short-lived `oauth_state` cookie (`HttpOnly; SameSite=Lax; Max-Age=300`), and validate it on callback before proceeding.
- Do not store state in localStorage or sessionStorage — these are same-origin only and will break if you test across domains.

**Warning signs:**
- OAuth callback route has no `state` parameter comparison
- `state` is stored in localStorage
- Callback works locally but fails on Vercel due to different cookie domain

**Phase to address:** OAuth + Google sign-in phase

---

### Pitfall 5: Serverless Cold Starts Breaking In-Memory Session State

**What goes wrong:**
Vercel serverless functions are stateless — each invocation may run in a fresh container. Any session state stored in module-level variables (e.g., a JavaScript `Map` or object used as an in-memory session store) is lost between invocations. In local development with `next dev`, the Node.js process persists, making in-memory storage appear to work. On Vercel, it silently fails — sessions disappear, fingerprint maps reset, dashboard shows empty.

**Why it happens:**
Fast PoC development uses module-level variables as "quick storage" that works locally. The Vercel deployment difference is discovered only during first production test.

**How to avoid:**
- Use a persistent database from day one. For this PoC: Vercel Postgres (built-in, easy setup) or Upstash Redis (serverless-friendly, low latency for session lookups).
- Never store session fingerprint maps in module-level variables in Next.js API routes.
- Upstash Redis is the better choice for this use case: sub-millisecond reads, pay-per-request (no always-on cost), native Vercel integration, and perfect for the `{sessionId → [fingerprintId, IP, UA]}` tuple lookup.

**Warning signs:**
- Session store initialized as `const sessions = new Map()` in an API route file
- Dashboard works in `next dev` but shows no data after Vercel deployment
- Fingerprint matching logic works locally but misses mismatches in production

**Phase to address:** Infrastructure/data layer phase (before any session tracking is built)

---

### Pitfall 6: Database Connection Pool Exhaustion on Vercel

**What goes wrong:**
Vercel serverless functions each open their own database connection. At normal web app scale, connection pooling via PgBouncer or a serverless-aware driver is essential. Without it, a burst of 10 simultaneous requests exhausts a Postgres connection limit of 20 (typical for free-tier Vercel Postgres / Neon). New connections are refused; API routes return 500 errors.

**Why it happens:**
Traditional Node.js apps use a single connection pool shared across the process lifetime. Serverless functions don't share processes — each function instance creates its own connection. Under load (or parallel dashboard polls), this explodes.

**How to avoid:**
- Use Vercel Postgres (Neon-backed) with the `@vercel/postgres` package, which uses a connection pooler by default via the `POSTGRES_URL` (pooled) vs. `POSTGRES_URL_NON_POOLING` env vars. Always use the pooled URL in serverless functions.
- Alternatively, use Upstash Redis (which is HTTP-based and inherently connection-pool-free) for the session fingerprint store, and only use Postgres for user records that require relational queries.
- Set `max: 1` on any direct pg Pool configuration used in serverless contexts — each function should hold at most 1 connection.

**Warning signs:**
- `Error: too many connections` in Vercel function logs
- Dashboard works for first few loads then fails
- Direct `new Pool({ connectionString: process.env.DATABASE_URL })` initialization inside API route handlers

**Phase to address:** Infrastructure/data layer phase

---

### Pitfall 7: FingerprintJS Client-Side Timing — Fingerprint Not Ready on First Request

**What goes wrong:**
FingerprintJS Pro's `getVisitorId()` call is async and can take 500ms–2s on first load (it needs to query the Fingerprint API servers). If the fingerprint is sent to the server in a page navigation request (e.g., on `useEffect` after page load), the first page view after login has no fingerprint — creating a race condition where the session record is created without a fingerprint association. Subsequent navigation works, but the initial login page registers a "blank" fingerprint slot.

**Why it happens:**
Developers call `fpPromise.then(fp => fp.get())` in a `useEffect` and POST the result to an API endpoint. But the first authenticated page render already fires a server request (for data fetching, middleware checks, etc.) before the fingerprint is available.

**How to avoid:**
- Don't send the fingerprint in the page navigation request. Separate fingerprint registration from page rendering entirely.
- On every authenticated page: load the page normally, then in a `useEffect` call `fp.get()` and POST to `/api/session/fingerprint` with the result. The server updates the session record's fingerprint on receipt.
- The mismatch detection logic should be: "if session already has a registered fingerprint AND this new fingerprint differs, trigger detection." Not: "if fingerprint is absent, trigger detection."
- Set a "fingerprint established" flag on the session after the first successful registration, so absence of fingerprint (during the loading window) is not treated as a mismatch.

**Warning signs:**
- Dashboard shows sessions with null fingerprint IDs
- False hijack alerts on login (the session transitions from no-fingerprint to fingerprint)
- Detection logic triggers on `null !== fingerprintId` rather than `knownFingerprintId !== newFingerprintId`

**Phase to address:** Fingerprint recording phase

---

### Pitfall 8: Storing Sensitive Fingerprint Data Without Scrubbing Before Claude

**What goes wrong:**
The Claude API call sends session metadata (OS, location estimate, browser, IP address, fingerprint components) to Anthropic's servers. For a PoC demo, this is acceptable — but if the demo uses real user data (e.g., the developer's own real Google account), real IP addresses and browser profiles are sent to a third-party API. If this PoC is ever demoed with others' accounts, it becomes a data privacy issue.

**Why it happens:**
PoC developers don't think about data minimization because the system "only uses test data." But demos inevitably involve real accounts.

**How to avoid:**
- Use synthetic/anonymized data in the Claude prompt: hash or truncate IP addresses (send `203.0.113.x` not `203.0.113.47`), use relative OS/browser labels (not exact user agent strings that could identify individuals).
- For the Claude prompt, send the delta between fingerprints (what changed) not the raw fingerprint values.
- Store the raw fingerprint data server-side only; send only the derived comparison metadata to Claude.

**Warning signs:**
- Claude API payload contains raw IP addresses
- Claude API payload contains full User-Agent strings
- Claude prompt is built by JSON.stringify-ing the raw session record

**Phase to address:** Claude integration phase

---

### Pitfall 9: Security Dashboard Exposing Session Tokens in UI

**What goes wrong:**
The dashboard API endpoint returns session records to the frontend for display. If those records include the actual `auth_session` cookie value (which is what's being tracked), the dashboard becomes a session token harvesting endpoint — any XSS vulnerability on the dashboard page gives an attacker all active session tokens.

**Why it happens:**
The database stores `{ sessionId, cookieValue, fingerprintId, ... }` for debugging purposes, and the dashboard API naively returns the full record.

**How to avoid:**
- Never store the actual cookie value in the session record. Store a `sessionId` that is a derived reference (e.g., a hash of the cookie or a separate UUID generated at login).
- The dashboard API returns `sessionId`, `userId` (display name), `fingerprintId`, `ipAddress` (truncated), `flagged`, `confidence` — never the raw token.
- The dashboard page should require authentication itself (ironic for a security tool to be unauthenticated).

**Warning signs:**
- `auth_session` cookie value stored as a column in the sessions table
- Dashboard API route returns the full session row without field filtering
- Dashboard page accessible without authentication

**Phase to address:** Security dashboard phase

---

### Pitfall 10: Next.js Middleware vs. API Route for Fingerprint Checking

**What goes wrong:**
Using Next.js Edge Middleware (`middleware.ts`) to check fingerprints on every request seems ideal — it runs before every page and API request. But Edge Middleware has significant constraints: no Node.js APIs, no full database clients (must use HTTP-based clients only), very limited bundle size, and it runs in the Edge Runtime not Node.js. Trying to run database lookups in Edge Middleware leads to cryptic build errors or silent failures.

**Why it happens:**
The mental model of "intercept every request" maps naturally to middleware. But the Edge Runtime limitations make standard database clients unusable there.

**How to avoid:**
- Do not put fingerprint checking in `middleware.ts`. Use Next.js API routes (Node.js runtime) for fingerprint registration and mismatch detection.
- If you want to intercept every page navigation: use a layout-level React component with a `useEffect` that fires the fingerprint POST to an API route after render. This is client-side but achieves the same result without Edge Runtime constraints.
- Edge Middleware is appropriate for: JWT validation (using only the Web Crypto API), redirect rules, and feature flags. Not for database-backed session checks.

**Warning signs:**
- `import { createClient } from '@vercel/postgres'` in `middleware.ts`
- Build error: "Module X is not available in the Edge runtime"
- Fingerprint check silently skipped in production (Edge Middleware fails open)

**Phase to address:** Fingerprint integration phase (architectural decision before writing detection logic)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| In-memory session Map instead of Redis/Postgres | Zero setup time | Breaks on Vercel deploy; data lost between invocations | Never — use Redis from day one |
| Hardcode fingerprint mismatch = hijack (no Claude) | Faster to build | High false positive rate, defeats the GenAI demonstration | Never for this PoC's core value |
| Skip `state` param in OAuth | Simpler callback code | CSRF vulnerability; callback may break in some browsers | Never |
| Return full session record from dashboard API | Faster to build dashboard | Exposes session tokens to frontend XSS | Never |
| Call Claude synchronously on mismatch | Simple linear code | Demo hangs 2–8s per detection; Vercel timeout risk | Never on hot path; acceptable in test harness |
| Use `SameSite=Strict` for session cookie | "Most secure" | Simulation demo won't work as intended | Use `SameSite=Lax` instead |
| Store raw fingerprint only (no component breakdown) | Simpler schema | Claude has nothing to reason about beyond ID equality | Only if fingerprint API provides no component data |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| FingerprintJS Pro | Calling `fpPromise.get()` during SSR (server-side) | FingerprintJS is client-only; always call from `useEffect` or browser event handlers |
| FingerprintJS Pro | Using the open-source `@fingerprintjs/fingerprintjs` (v3) instead of FingerprintJS Pro | PROJECT.md requires Pro SDK for hardware-level stability; the open-source version has higher instability |
| Google OAuth via NextAuth | Not setting `NEXTAUTH_URL` env var on Vercel | Callbacks default to `localhost`; set `NEXTAUTH_URL` to the production Vercel URL |
| Google OAuth via NextAuth | Not setting `NEXTAUTH_SECRET` on Vercel | JWT signing fails silently; sessions appear to work locally (dev mode uses default secret) but break in production |
| Anthropic API | Not handling `APIError` with status 529 (overloaded) | Uncaught errors crash the detection pipeline; wrap in try/catch with retry or graceful degradation |
| Anthropic API | Treating streaming response as non-streaming | Use `messages.create()` with `stream: false` for structured JSON responses; streaming complicates JSON parsing |
| Vercel Postgres | Using `DATABASE_URL` (non-pooled) in serverless functions | Always use `POSTGRES_URL` (pooled via PgBouncer) for serverless; `DATABASE_URL` is for migrations only |
| NextAuth session | Exposing JWT decode logic client-side | Use `getServerSession()` in API routes, never decode JWT manually on the client |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Claude API on hot path | Page loads hang 2–8s; Vercel function timeouts | Fire-and-forget to background function; return PENDING state immediately | Every mismatch event |
| No index on `sessionId` column in fingerprint table | Dashboard query slows as records accumulate | Add `CREATE INDEX` on `session_id` at table creation | ~1,000 records |
| FingerprintJS called on every render | Excess API calls to Fingerprint servers; Pro plan costs | Cache `visitorId` in sessionStorage; call once per page session | At every page navigation |
| Dashboard polling every 1s | Hammers Vercel Postgres with queries; cold starts pile up | Use 5-10s polling interval or Server-Sent Events with a single long-lived connection | At any real usage |
| Storing full fingerprint component arrays in Postgres JSONB | Schema works but queries against components are slow | Use indexed columns for key components (OS, browser family) needed for comparisons | ~10,000 records |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `NEXTAUTH_SECRET` committed to git | Any git history viewer gets signing key; all sessions forgeable | Vercel env vars only; add to `.gitignore`; rotate immediately if committed |
| `ANTHROPIC_API_KEY` in source code | API key leaked; attacker incurs costs or reads your prompts | Vercel env vars only; PROJECT.md explicitly requires this |
| Dashboard page unauthenticated | Any internet user can see all flagged sessions and fingerprint data | Protect dashboard route with `getServerSession()` check |
| Logging full session metadata to console | `console.log(sessionData)` in API routes appears in Vercel function logs — visible to anyone with Vercel project access | Log only session IDs and flag states, never PII or fingerprint raw data |
| Trusting client-supplied fingerprint ID | Attacker POSTs a known-good fingerprint ID to bypass detection | The fingerprint ID must be fetched server-side via the FingerprintJS Server API using the `requestId` from the client — never trust the raw `visitorId` the client sends |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Dashboard shows "FLAGGED" immediately before Claude responds | Demo looks broken — flag appears then disappears | Show "ANALYZING" state while Claude call is pending; update to FLAGGED/CLEAR on response |
| No explanation for why a session was flagged | Dashboard demoed to non-technical audience who can't interpret confidence scores | Show Claude's reasoning text alongside the score, not just the number |
| Simulation requires manual DevTools manipulation with no docs | Demo presenter fumbles the simulation live | Write a step-by-step simulation guide as part of the project docs |
| Dashboard auto-clears flagged sessions with no history | Can't show the detection working after it's resolved | Keep flagged session history with timestamps; don't auto-clear |

---

## "Looks Done But Isn't" Checklist

- [ ] **FingerprintJS integration:** Verify `visitorId` is stable across normal page navigations (not just logged on first load) — check browser console for repeated `get()` calls
- [ ] **Mismatch detection:** Verify detection fires on actual cross-device cookie theft, not on same-device incognito open (false positive)
- [ ] **Claude integration:** Verify Claude response is parsed as structured JSON with `confidence` field, not raw text — test with an intentional mismatch before wiring to dashboard
- [ ] **Session cookie:** Verify `auth_session` cookie is visible in DevTools Application panel (even with HttpOnly) so simulation is possible
- [ ] **OAuth flow:** Verify Google OAuth callback works on Vercel production URL (not just localhost) before building detection logic on top
- [ ] **Dashboard auth:** Verify dashboard page returns 401/redirect for unauthenticated requests — do not skip this for "internal demo" justification
- [ ] **Vercel deploy:** Verify all five env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `FINGERPRINTJS_API_KEY`, `ANTHROPIC_API_KEY`) are set in Vercel project settings before testing
- [ ] **Claude async path:** Verify the detection pipeline completes (PENDING → FLAGGED) when Claude is called asynchronously — test with artificial delay in Claude mock

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Claude on hot path causing timeouts | MEDIUM | Extract Claude call to separate async function; add PENDING state to schema; update detection logic to fire-and-forget |
| In-memory session state used instead of database | HIGH | Add Redis/Postgres; migrate session tracking logic to use persistent store; all local tests that passed will need re-running on Vercel |
| Cookie flags preventing simulation | LOW | Change `SameSite=Strict` to `SameSite=Lax` in auth config; no schema changes needed |
| FingerprintJS false positives flooding dashboard | MEDIUM | Add component-similarity threshold logic; update Claude prompt to weight component matches; adjust confidence threshold |
| `NEXTAUTH_SECRET` committed to git | HIGH | Rotate secret immediately; purge from git history with `git filter-repo`; redeploy |
| Database connection pool exhaustion | LOW-MEDIUM | Switch from direct Pool to Vercel Postgres pooled URL; no schema changes needed |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Claude API on hot path | Claude integration phase | Test: simulate mismatch; page response returns in <200ms; dashboard updates async within 10s |
| FingerprintJS instability / false positives | FingerprintJS integration phase | Test: open same account in incognito; confirm dashboard does NOT flag as hijack |
| Cookie flags blocking simulation | OAuth + session setup phase | Test: copy cookie from DevTools Application panel in Chrome; verify value is readable and transferable |
| OAuth state/CSRF mishandling | OAuth + Google sign-in phase | Test: manually alter `state` param in callback URL; confirm 400 response not successful login |
| Serverless in-memory state | Infrastructure / data layer phase (first phase) | Test: deploy to Vercel, restart function between two requests, verify session data persists |
| Database connection pool exhaustion | Infrastructure / data layer phase | Test: 20 parallel requests to session API; confirm no 500 errors in Vercel logs |
| FingerprintJS client timing race | Fingerprint recording phase | Test: check DB record immediately after login; confirm fingerprint field is NULL initially then populated within 2s |
| Sensitive data in Claude prompt | Claude integration phase | Code review: Claude prompt builder must hash IPs, truncate UA strings |
| Session tokens in dashboard API | Security dashboard phase | Test: curl dashboard API without auth; confirm 401; inspect response JSON for absence of cookie values |
| Edge Middleware database access | Fingerprint integration phase | Architecture review: confirm middleware.ts contains no database imports |

---

## Sources

- FingerprintJS Pro documentation (official): https://dev.fingerprint.com/docs — HIGH confidence for SDK behavior, known limitations
- NextAuth.js / Auth.js documentation: https://authjs.dev — HIGH confidence for OAuth state handling, cookie defaults
- Vercel serverless function constraints: https://vercel.com/docs/functions/serverless-functions — HIGH confidence for cold start behavior, Edge Runtime limitations
- Anthropic API documentation: https://docs.anthropic.com — HIGH confidence for rate limits, error codes
- Vercel Postgres / Neon connection pooling: https://vercel.com/docs/storage/vercel-postgres — HIGH confidence for pooled vs. non-pooled URL behavior
- Note: WebSearch and WebFetch were unavailable during this research session. All findings are drawn from official documentation knowledge current as of training cutoff (August 2025) and are rated accordingly. The FingerprintJS Pro instability behaviors (incognito, VPN, browser updates) are documented in the official FingerprintJS changelog and accuracy documentation. The Vercel serverless state and connection pooling pitfalls are canonical and well-established in Vercel's own documentation.

---
*Pitfalls research for: Sentinel — session hijack detection PoC*
*Researched: 2026-02-28*
