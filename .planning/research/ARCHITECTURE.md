# Architecture Research

**Domain:** Session hijack detection PoC — Next.js e-commerce shell with fingerprint-based anomaly detection
**Researched:** 2026-02-28
**Confidence:** MEDIUM — training data (cutoff August 2025) is authoritative for Next.js 14/15 App Router, FingerprintJS, and Vercel serverless constraints. No external verification possible in this session; architecture patterns are stable and well-documented.

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
│  ┌──────────────────┐   ┌──────────────────┐                        │
│  │  E-Commerce UI   │   │  Security Dash   │                        │
│  │  (App Router)    │   │  /dashboard      │                        │
│  └────────┬─────────┘   └────────┬─────────┘                        │
│           │  every page load      │  polling or SSE                 │
│  ┌────────▼─────────────────────────────────────────────┐           │
│  │  FingerprintJS SDK (client-side)                      │           │
│  │  Runs on every authenticated page, returns visitorId  │           │
│  │  Sends visitorId + sessionId → /api/session/record    │           │
│  └────────────────────────────────────────────────────-─┘           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼──────────────────────────────────────┐
│                    NEXT.JS API LAYER (Vercel Functions)              │
│                                                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │  /api/auth/[...     │  │  /api/session/      │                   │
│  │  nextauth]          │  │  record             │                   │
│  │  Google OAuth flow  │  │  Fingerprint ingest │                   │
│  └─────────────────────┘  └──────────┬──────────┘                   │
│                                       │ calls if mismatch           │
│  ┌─────────────────────┐  ┌──────────▼──────────┐                   │
│  │  /api/dashboard/    │  │  Detection Engine   │                   │
│  │  sessions           │  │  (server-side logic)│                   │
│  │  Read sessions DB   │  │  compare FP tuples  │                   │
│  └─────────────────────┘  └──────────┬──────────┘                   │
│                                       │ on mismatch                 │
│                            ┌──────────▼──────────┐                   │
│                            │  /api/detect/analyze │                   │
│                            │  Calls Claude API    │                   │
│                            │  Returns score 0-100 │                   │
│                            └──────────┬──────────┘                   │
└───────────────────────────────────────┼─────────────────────────────┘
                                        │
┌───────────────────────────────────────▼─────────────────────────────┐
│                         EXTERNAL SERVICES                            │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │  Google OAuth    │  │  Anthropic API │  │  FingerprintJS Pro   │  │
│  │  (auth flow)     │  │  claude-3.x    │  │  (optional server    │  │
│  └──────────────────┘  └────────────────┘  │   verification)      │  │
│                                             └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                        │
┌───────────────────────────────────────▼─────────────────────────────┐
│                            DATABASE LAYER                            │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │    sessions      │  │  fingerprints  │  │  detection_events    │  │
│  │  (auth state)    │  │  (fp tuples)   │  │  (anomaly log)       │  │
│  └──────────────────┘  └────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| E-commerce shell | Authenticated surface area; provides realistic pages requiring valid session | Next.js App Router pages: `/`, `/products`, `/cart`, `/checkout` |
| FingerprintJS client hook | Capture visitorId on every authenticated page load; send to ingest endpoint | `useEffect` + FingerprintJS SDK in a shared layout component |
| `/api/session/record` | Receive `{visitorId, sessionId, ip, userAgent}`; write to DB; trigger detection | Next.js Route Handler (Node.js runtime, NOT edge) |
| Detection engine | Compare incoming fingerprint tuple against stored tuple for session; emit mismatch events | Plain TypeScript function called from within `/api/session/record` — not a separate service |
| `/api/detect/analyze` | Build Claude prompt from mismatch metadata; call Anthropic API; persist result | Route Handler; can be same file as record or separate for clarity |
| Security dashboard | Poll session state; display flagged sessions; show confidence scores | `/dashboard` App Router page; calls `/api/dashboard/sessions` |
| `/api/dashboard/sessions` | Return all sessions with their latest fingerprint tuple and any detection_events | Route Handler; authenticated — only admin |
| Google OAuth handler | Manage OAuth flow; issue session cookie | NextAuth.js or Auth.js `[...nextauth]` catch-all route |
| Database client | Singleton Prisma or Drizzle ORM instance shared across API routes | `lib/db.ts` exported as singleton to survive hot reload |

---

## Where Detection Logic Lives: The Critical Architectural Decision

**Decision: Detection runs in a Node.js API Route Handler, NOT in Middleware.**

Rationale:

Next.js Middleware runs at the Vercel Edge Network (V8 isolate, not Node.js). The Edge runtime has hard constraints:
- No native Node.js modules (no `fs`, no native crypto beyond Web Crypto API)
- No database connections (Prisma, pg, mysql2, etc. require Node.js)
- No arbitrary npm packages that use Node.js internals
- Cold-start optimized for lightweight operations (auth token validation, redirects)
- Cannot call external APIs with the same flexibility as a full Node.js function

Middleware CAN do:
- Read cookies, validate JWT signatures (using Web Crypto)
- Redirect/rewrite requests
- Attach request headers

Middleware CANNOT do (for this system):
- Query a database to look up fingerprint history
- Call the Anthropic SDK (which uses Node.js http)
- Call FingerprintJS Pro server API

**Therefore:** Middleware's role is limited to verifying that a valid auth session cookie exists and redirecting unauthenticated users. ALL detection logic — fingerprint comparison, mismatch evaluation, Claude API call — lives in the `/api/session/record` Route Handler, which runs in the full Node.js runtime on Vercel.

Confidence: HIGH — this is a hard constraint of the Vercel Edge runtime, not an opinion.

---

## Data Flows

### Flow 1: Normal Authenticated Request (No Hijack)

```
User loads /products
    │
    ▼
Next.js Middleware
    │  reads auth session cookie
    │  validates JWT signature (edge-compatible)
    │  if invalid → redirect /login
    │  if valid → pass through
    ▼
App Router renders /products page
    │
    ▼
FingerprintJS SDK runs client-side (useEffect in layout)
    │  generates visitorId (hardware-stable across navigations)
    │  reads sessionId from cookie (or from server component context)
    ▼
POST /api/session/record
    Body: { visitorId, sessionId, userAgent, timestamp }
    IP: extracted from req headers (x-forwarded-for on Vercel)
    │
    ▼
Route Handler: look up sessions table for sessionId
    │
    ├─ No existing fingerprint record → INSERT fingerprint tuple
    │   → return 200 { status: "recorded" }
    │
    └─ Existing fingerprint record with SAME visitorId → UPDATE last_seen
        → return 200 { status: "ok" }
```

### Flow 2: Session Hijack Detection (Cookie Stolen)

```
Device A logs in → FP_01 stored for SESSION_123
    │
    ▼  (attacker copies auth_session cookie)
    │
Device B sends request with SESSION_123 cookie
    │
    ▼
Middleware: cookie valid → passes through
    │
    ▼
FingerprintJS SDK on Device B → generates FP_02
    │
    ▼
POST /api/session/record
    Body: { visitorId: FP_02, sessionId: SESSION_123, ... }
    │
    ▼
Route Handler: look up sessions table
    │  FINDS: SESSION_123 already has FP_01
    │  FP_02 ≠ FP_01 → MISMATCH DETECTED
    │
    ▼
INSERT detection_events row:
    { sessionId, fp_original: FP_01, fp_anomaly: FP_02,
      ip_original, ip_anomaly, ua_original, ua_anomaly,
      status: "pending_analysis", created_at }
    │
    ▼
Call /api/detect/analyze (internally, same request context)
    OR: call detection function directly (preferred — avoids HTTP overhead)
    │
    ▼
Build Claude prompt:
    "Session SESSION_123 was established from:
     - Browser: Chrome/Mac, IP: 192.168.1.1, FP: FP_01
     Now a request arrived from:
     - Browser: Firefox/Windows, IP: 45.33.x.x, FP: FP_02
     On a scale of 0-100, how confident are you this is a hijack?
     Respond with JSON: { score: number, reasoning: string }"
    │
    ▼
Anthropic SDK call → claude-3-5-sonnet (configurable via CLAUDE_MODEL env var)
    │
    ▼
Parse response: { score: 87, reasoning: "Different OS, different browser, ..." }
    │
    ▼
UPDATE detection_events: { confidence_score: 87, reasoning: "...", status: "analyzed" }
UPDATE sessions: { flagged: true, confidence_score: 87 }
    │
    ▼
Return 200 to client (FP_02 device)
    Note: do NOT alert the potential attacker; dashboard flags asynchronously
```

### Flow 3: Dashboard Polling

```
/dashboard page
    │
    ▼
Client-side: setInterval every 5s (or Server-Sent Events for real-time)
    │
    ▼
GET /api/dashboard/sessions
    │  auth check: only accessible to admin/demo user
    │
    ▼
Query: SELECT sessions JOIN fingerprints JOIN detection_events
    Returns: array of session objects with flag status + confidence score
    │
    ▼
Dashboard renders table:
    - Session ID (truncated)
    - User email
    - Original device fingerprint summary
    - Anomaly fingerprint (if any)
    - Confidence score
    - Flag indicator (red if score > threshold)
```

### Flow 4: Simulation (Cookie Copy Attack)

```
Device A (DevTools Network tab):
    1. Open Chrome DevTools → Application → Cookies
    2. Copy value of auth_session cookie

Device B (DevTools Console or Postman):
    1. document.cookie = "auth_session=[copied_value]; path=/"
    2. Navigate to /products
    3. FingerprintJS runs → generates different visitorId
    4. POST /api/session/record fires automatically
    5. Mismatch detected → detection pipeline runs
    6. /dashboard shows flagged session within ~5 seconds
```

---

## Database Schema

### Tables

**sessions**
```sql
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,     -- NextAuth session token
  user_id       TEXT NOT NULL,        -- FK → users.id
  user_email    TEXT NOT NULL,        -- denormalized for dashboard queries
  expires_at    TIMESTAMP NOT NULL,
  flagged       BOOLEAN DEFAULT FALSE,
  confidence_score INTEGER,           -- 0-100, set when flagged
  created_at    TIMESTAMP DEFAULT NOW()
);
```

**fingerprints**
```sql
CREATE TABLE fingerprints (
  id            SERIAL PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  visitor_id    TEXT NOT NULL,        -- FingerprintJS visitorId
  ip_address    TEXT,                 -- x-forwarded-for from Vercel
  user_agent    TEXT,
  is_original   BOOLEAN DEFAULT TRUE, -- first fingerprint for this session
  first_seen    TIMESTAMP DEFAULT NOW(),
  last_seen     TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookup: "what fingerprints exist for this session?"
CREATE INDEX idx_fingerprints_session ON fingerprints(session_id);
```

**detection_events**
```sql
CREATE TABLE detection_events (
  id              SERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  fp_original_id  INTEGER REFERENCES fingerprints(id),
  fp_anomaly_id   INTEGER REFERENCES fingerprints(id),
  confidence_score INTEGER,            -- Claude's output
  reasoning       TEXT,                -- Claude's reasoning string
  status          TEXT DEFAULT 'pending',  -- pending | analyzed | dismissed
  created_at      TIMESTAMP DEFAULT NOW()
);
```

**users** (managed by NextAuth, shown for completeness)
```sql
CREATE TABLE users (
  id      TEXT PRIMARY KEY,
  email   TEXT UNIQUE NOT NULL,
  name    TEXT,
  image   TEXT
);
```

### Schema Rationale

- `fingerprints` stores ALL fingerprint tuples seen for a session, not just the first. This preserves the full history for the dashboard and for Claude's analysis prompt.
- `is_original` marks the first-seen fingerprint. Subsequent different `visitor_id` values trigger detection.
- `detection_events` decouples the anomaly record from the session record. A session can have zero or many events.
- Confidence score is denormalized onto `sessions.confidence_score` for fast dashboard queries without joining detection_events on every poll.

---

## Recommended Project Structure

```
sentinel/
├── app/                          # Next.js App Router
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # Google OAuth sign-in page
│   ├── (shop)/                   # E-commerce shell (route group)
│   │   ├── layout.tsx            # FingerprintJS hook lives here
│   │   ├── page.tsx              # Product listing
│   │   ├── cart/
│   │   │   └── page.tsx
│   │   └── checkout/
│   │       └── page.tsx
│   ├── dashboard/
│   │   └── page.tsx              # Security dashboard
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts      # NextAuth handler
│       ├── session/
│       │   └── record/
│       │       └── route.ts      # Fingerprint ingest + detection trigger
│       ├── detect/
│       │   └── analyze/
│       │       └── route.ts      # Claude API call (optional split)
│       └── dashboard/
│           └── sessions/
│               └── route.ts      # Session list for dashboard
├── lib/
│   ├── db.ts                     # Prisma client singleton
│   ├── auth.ts                   # NextAuth config (providers, callbacks)
│   ├── fingerprint.ts            # FingerprintJS client-side hook
│   ├── detection.ts              # Core detection logic (pure functions)
│   └── claude.ts                 # Anthropic SDK wrapper + prompt builder
├── components/
│   ├── FingerprintReporter.tsx   # Client component: runs FP SDK, POSTs result
│   ├── SessionTable.tsx          # Dashboard table component
│   └── FlagBadge.tsx             # Visual indicator for flagged sessions
├── prisma/
│   └── schema.prisma             # DB schema (sessions, fingerprints, events)
├── middleware.ts                 # ONLY: auth cookie check + redirect
└── .env.local                    # Local dev only — never committed
```

### Structure Rationale

- **(shop) route group:** Groups all e-commerce pages under a shared layout. The `layout.tsx` here is where `FingerprintReporter` lives — it fires on every page in the shop, not on the auth pages or dashboard.
- **lib/detection.ts:** Detection logic as pure functions keeps it testable in isolation. The Route Handler calls these functions — no HTTP round-trip, no extra Lambda invocation.
- **lib/claude.ts:** Wraps the Anthropic SDK and owns the prompt template. Centralizing prompt construction here means changes don't scatter across route files.
- **middleware.ts:** Intentionally thin — only checks auth cookie validity. Never touches the database.
- **prisma/ at root:** Prisma convention; schema at root level, `lib/db.ts` exports the singleton client.

---

## Architectural Patterns

### Pattern 1: Ingest-then-Detect in a Single Route Handler

**What:** The `/api/session/record` route handles both persistence (write fingerprint tuple) and detection (compare against stored tuples) in sequence. Detection is a synchronous function call, not a separate HTTP request.

**When to use:** Always, for this PoC. The alternative (separate `/api/detect/analyze` as a called endpoint) adds an unnecessary HTTP round-trip within the same Vercel function environment.

**Trade-offs:** The route handler becomes slightly more complex. Accept this. The simplicity of no inter-function HTTP calls outweighs the concern.

**Example:**
```typescript
// app/api/session/record/route.ts
import { detectMismatch } from "@/lib/detection";
import { callClaude } from "@/lib/claude";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { visitorId, sessionId } = await req.json();
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  // 1. Find or create fingerprint record for this session
  const existing = await db.fingerprint.findFirst({
    where: { sessionId, isOriginal: true },
  });

  if (!existing) {
    await db.fingerprint.create({
      data: { sessionId, visitorId, ipAddress: ip, userAgent, isOriginal: true },
    });
    return Response.json({ status: "recorded" });
  }

  // 2. Same fingerprint — update last_seen, no action
  if (existing.visitorId === visitorId) {
    await db.fingerprint.update({
      where: { id: existing.id },
      data: { lastSeen: new Date() },
    });
    return Response.json({ status: "ok" });
  }

  // 3. MISMATCH — persist anomaly fingerprint, run detection
  const anomalyFp = await db.fingerprint.create({
    data: { sessionId, visitorId, ipAddress: ip, userAgent, isOriginal: false },
  });

  const event = await db.detectionEvent.create({
    data: {
      sessionId,
      fpOriginalId: existing.id,
      fpAnomalyId: anomalyFp.id,
      status: "pending",
    },
  });

  // 4. Call Claude (async — fire and await within same request)
  const { score, reasoning } = await callClaude({
    original: existing,
    anomaly: { visitorId, ipAddress: ip, userAgent },
  });

  // 5. Persist Claude result
  await db.detectionEvent.update({
    where: { id: event.id },
    data: { confidenceScore: score, reasoning, status: "analyzed" },
  });
  await db.session.update({
    where: { id: sessionId },
    data: { flagged: true, confidenceScore: score },
  });

  return Response.json({ status: "flagged", score });
}
```

### Pattern 2: FingerprintReporter as a Leaf Client Component

**What:** A dedicated `FingerprintReporter.tsx` client component handles all FingerprintJS SDK interaction. It is rendered in the `(shop)/layout.tsx`. It has no visible UI — it only fires a side effect.

**When to use:** Always. Keep fingerprint logic out of page components. Centralizing it in the layout ensures it runs on every shop page without duplication.

**Trade-offs:** The component is invisible, which can confuse future readers. Add a clear comment.

**Example:**
```typescript
// components/FingerprintReporter.tsx
"use client";
import { useEffect } from "react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

export function FingerprintReporter({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    async function report() {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      await fetch("/api/session/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: result.visitorId, sessionId }),
      });
    }
    report();
  }, [sessionId]); // re-run only if session changes

  return null; // intentionally invisible
}
```

Note on FingerprintJS versions: The free open-source `@fingerprintjs/fingerprintjs` package generates a visitorId that is browser-local and stable across page navigations within a session. FingerprintJS Pro adds server-side verification and cross-browser tracking. For this PoC, the free version is sufficient — different physical devices will reliably produce different visitorIds.

Confidence: MEDIUM — FingerprintJS Pro vs OSS capability boundary is training-data-sourced; verify during implementation if cross-device stability is insufficient.

### Pattern 3: Thin Middleware — Auth Gate Only

**What:** `middleware.ts` does exactly one thing: check whether `auth_session` cookie is present and valid. If not, redirect to `/login`. No database access, no fingerprint logic.

**When to use:** Always on Vercel. The Edge runtime where middleware runs cannot access the database.

**Example:**
```typescript
// middleware.ts
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

**Trade-offs:** Means an attacker with a stolen-but-valid JWT can pass middleware. This is intentional — the detection happens server-side in the API route. Middleware is not the detection layer.

### Pattern 4: Claude Prompt as Structured Metadata Diff

**What:** The Claude prompt is a structured comparison of two fingerprint tuples, not a free-form question. Include exact field values so Claude can reason about specific signals (OS change, IP geolocation shift, browser family change).

**When to use:** Always. Vague prompts produce vague scores.

**Example:**
```typescript
// lib/claude.ts
export function buildPrompt(original: FingerprintTuple, anomaly: FingerprintTuple): string {
  return `You are a security analyst evaluating a potential session hijack.

A session was originally established with:
- Browser fingerprint ID: ${original.visitorId}
- User-Agent: ${original.userAgent}
- IP Address: ${original.ipAddress}
- Time: ${original.firstSeen.toISOString()}

A new request arrived on the SAME session with:
- Browser fingerprint ID: ${anomaly.visitorId}
- User-Agent: ${anomaly.userAgent}
- IP Address: ${anomaly.ipAddress}

The fingerprint IDs are different, which may indicate a stolen session cookie.

Respond with valid JSON only:
{
  "score": <integer 0-100 where 100 = certain hijack>,
  "reasoning": "<one paragraph explanation>",
  "signals": ["<signal1>", "<signal2>"]
}

Consider: same IP + different FP may indicate browser update (lower score). Different IP + different OS + different browser = high score.`;
}
```

---

## Anti-Patterns

### Anti-Pattern 1: Detection Logic in Middleware

**What people do:** Try to put fingerprint mismatch detection in `middleware.ts` because it runs on every request.

**Why it's wrong:** Middleware runs on Vercel's Edge runtime (V8 isolate). It cannot connect to a database, cannot call the Anthropic Node.js SDK, and cannot import most npm packages that use Node.js internals. Putting detection logic here will result in runtime errors that are cryptic and hard to debug.

**Do this instead:** Keep middleware to JWT validation only. Put all detection logic in a Node.js Route Handler (`app/api/session/record/route.ts`).

### Anti-Pattern 2: Calling Claude on Every Request

**What people do:** Trigger a Claude API call on every fingerprint record submission, even when no mismatch exists.

**Why it's wrong:** Claude API calls have latency (1-5 seconds) and cost. Calling on every page navigation will slow the user-facing app and exhaust API budget.

**Do this instead:** Only call Claude when `existingVisitorId !== incomingVisitorId`. The detection engine is the gatekeeper. Claude is called only on confirmed mismatches.

### Anti-Pattern 3: Storing SessionID in the Fingerprint POST Body Without Server-Side Validation

**What people do:** Trust the `sessionId` sent in the client POST body as-is.

**Why it's wrong:** A client could POST any sessionId. The session association must be verified server-side by reading the auth cookie from the request, not the body.

**Do this instead:** In the Route Handler, extract the actual session from the NextAuth session using `getServerSession(authOptions)`. Use that session's ID, not the client-supplied value.

**Example:**
```typescript
// app/api/session/record/route.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const sessionId = session.user.id; // server-authoritative
  const { visitorId } = await req.json(); // only trust visitorId from body
  // ...
}
```

### Anti-Pattern 4: Polling Dashboard with Full Session Table Scan

**What people do:** `SELECT * FROM sessions` on every dashboard poll.

**Why it's wrong:** Returns all historical sessions. For a PoC this is fine, but indexing matters. More importantly, a `SELECT *` without a `flagged` index means the dashboard becomes slow as the events table grows during demos.

**Do this instead:** Index `sessions.flagged` and add `ORDER BY created_at DESC LIMIT 50`. The dashboard only needs recent sessions, not the full history.

### Anti-Pattern 5: FingerprintJS SDK Loaded in Server Component

**What people do:** Attempt to import FingerprintJS in a Server Component or Server Action.

**Why it's wrong:** FingerprintJS requires browser APIs (`navigator`, `canvas`, `WebGL`). It cannot run in Node.js. Next.js will throw at build time or runtime.

**Do this instead:** Always wrap FingerprintJS usage in a Client Component with `"use client"` directive. The `FingerprintReporter` component pattern (see Pattern 2) handles this correctly.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google OAuth | NextAuth.js `GoogleProvider` — handles token exchange, session cookie creation | Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` as Vercel env vars |
| FingerprintJS (OSS) | Client-side SDK loaded via npm — no API key needed for OSS version | If upgrading to Pro: add `FINGERPRINTJS_API_KEY` env var and use `@fingerprintjs/fingerprintjs-pro` package |
| Anthropic API | Direct SDK call from Node.js Route Handler — `@anthropic-ai/sdk` npm package | Configure `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` (e.g., `claude-3-5-sonnet-20241022`) as Vercel env vars |
| Vercel Postgres (or Neon) | Prisma ORM with `@prisma/client` — connection string as `DATABASE_URL` env var | Use connection pooling (`?pgbouncer=true`) on Vercel to avoid connection exhaustion on cold starts |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Client layout → record API | HTTP POST (fetch) from Client Component | One-way push; client does not need response data |
| record API → detection logic | Direct function call (same process) | No HTTP round-trip; `detectMismatch()` is imported from `lib/detection.ts` |
| detection logic → Claude API | Anthropic SDK call within Route Handler | Awaited synchronously; adds ~2-5s to POST response time on mismatch |
| Dashboard page → sessions API | HTTP GET poll every 5s (or SSE stream) | Start with polling; SSE is optional upgrade if real-time feel matters for demo |
| NextAuth → DB | Prisma adapter (Prisma Adapter for NextAuth) | NextAuth writes sessions/users; detection engine reads session IDs from these same tables |

---

## Suggested Build Order

The system has strict dependencies. Build in this order to always have something runnable at each step.

```
Phase 1: Foundation
  ├── Next.js project scaffold (App Router)
  ├── Database setup (Prisma schema, local dev DB)
  ├── Google OAuth (NextAuth) — login flow working
  └── Middleware — auth gate protecting shop routes
       MILESTONE: user can log in, protected pages redirect unauthenticated users

Phase 2: E-Commerce Shell
  ├── Shop pages: products, cart, checkout (static/mock data)
  └── Auth session cookie visible in DevTools
       MILESTONE: realistic authenticated surface; cookie manually copyable

Phase 3: Fingerprint Capture
  ├── FingerprintReporter client component
  ├── /api/session/record route (ingest only, no detection yet)
  └── fingerprints table populated on page load
       MILESTONE: POST fires on every shop page; DB shows fingerprint tuples

Phase 4: Detection Engine
  ├── lib/detection.ts — mismatch comparison logic
  ├── detection_events table
  ├── Detection wired into /api/session/record
  └── Manual test: simulate mismatch via different browser
       MILESTONE: detection_events row created on fingerprint mismatch

Phase 5: Claude Integration
  ├── lib/claude.ts — prompt builder + Anthropic SDK wrapper
  ├── Claude call wired into detection path
  └── confidence_score persisted to detection_events and sessions
       MILESTONE: mismatch produces a score 0-100 with reasoning in DB

Phase 6: Security Dashboard
  ├── /api/dashboard/sessions route
  ├── /dashboard page with session table
  └── Flagged sessions highlighted above threshold
       MILESTONE: end-to-end demo works — simulate hijack, see flag appear

Phase 7: Polish + Deploy
  ├── Vercel deployment with env vars configured
  ├── Simulation documentation (how to copy cookie)
  └── Threshold configuration (DETECTION_THRESHOLD env var)
       MILESTONE: public URL, full demo runnable
```

**Dependency rationale:**
- Auth must precede everything (session IDs don't exist without auth)
- E-commerce shell must precede fingerprint capture (need authenticated pages to trigger SDK)
- Fingerprint capture must precede detection (need stored tuples to compare against)
- Detection must precede Claude integration (Claude only called on confirmed mismatches)
- Detection engine must precede dashboard (dashboard reads detection_events)

---

## Scaling Considerations

This is a PoC. Scale is not the concern. The following is noted only to understand the architecture's limits during demo load.

| Scale | Architecture Notes |
|-------|--------------------|
| 1-10 concurrent demo users | Single Vercel Postgres instance, no pooling concerns. Polling dashboard every 5s is fine. |
| Demo day spike (50 concurrent) | Vercel serverless handles this natively via function scaling. Vercel Postgres connection limit may be hit — use `?pgbouncer=true` in connection string. |
| Not in scope | Production-level scale, session termination, multi-tenant, mobile |

**First bottleneck (if ever hit):** Database connections from parallel Vercel function invocations. Mitigation: Neon Serverless driver (uses HTTP rather than persistent TCP) or Vercel Postgres with PgBouncer mode.

---

## Sources

- Next.js App Router documentation (middleware runtime constraints, Route Handlers) — training data, August 2025 cutoff. Confidence: HIGH for Edge vs Node.js runtime distinction.
- Vercel Edge Runtime documentation — training data. Confidence: HIGH for "no Node.js modules" constraint.
- FingerprintJS OSS README — training data. Confidence: MEDIUM for visitorId cross-device stability claim; verify during implementation.
- NextAuth.js (Auth.js) v4/v5 patterns — training data. Confidence: MEDIUM; Auth.js v5 migration may affect `getServerSession` API if using latest version.
- Anthropic SDK for Node.js — training data. Confidence: HIGH for basic usage pattern; model name string should be verified against current Anthropic model list at time of implementation.

---
*Architecture research for: Sentinel — session hijack detection PoC*
*Researched: 2026-02-28*
