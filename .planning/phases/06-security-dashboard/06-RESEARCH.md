# Phase 6: Security Dashboard - Research

**Researched:** 2026-02-28
**Domain:** Next.js App Router dashboard UI — server-rendered data table, polling, expandable rows, auth protection
**Confidence:** HIGH

---

## Summary

Phase 6 builds a `/dashboard` page that shows all active sessions with fingerprint metadata, status badges, and — for flagged sessions — an expandable panel revealing Claude's full reasoning and confidence score. The page must be auth-protected and must refresh its data within 10 seconds of new detection events without a full page reload.

The project already has the complete data layer: the `Session`, `Fingerprint`, and `DetectionEvent` Prisma models are fully migrated and populated by Phases 3–5. The `DetectionEvent` table already holds `status`, `confidenceScore`, and `reasoning` — everything the dashboard needs to display. Phase 6 is purely a UI/query layer on top of existing data.

The canonical Next.js 15/16 App Router pattern for a polling dashboard is: a Server Component page that fetches data directly via Prisma (no API route needed), wrapped by a thin `"use client"` component that calls `router.refresh()` on an interval to silently re-fetch and re-render the server data. Expandable rows are implemented with local `useState` in a client component — no third-party table library is required given the small scope. Auth protection already works via the existing `proxy.ts` matcher and can be reinforced with a server-side `auth()` + `redirect()` call inside the page component, matching the exact pattern used by `(shop)/layout.tsx`.

**Primary recommendation:** Build a single `/dashboard` Server Component page that queries Prisma directly, wraps children in a client `<PollingRefresher>` component that calls `router.refresh()` every 8 seconds, and renders a `<SessionTable>` client component with per-row `useState` toggle for the expandable reasoning panel.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Dashboard lists all active sessions with visitorId, IP address, user-agent, and status badge (ACTIVE / PENDING / FLAGGED / CLEAR) | Prisma `Session.findMany` with nested `fingerprints` and `detectionEvents`; existing schema has all fields; Server Component direct Prisma call is the established project pattern |
| DASH-02 | Sessions whose Claude confidence score exceeds a configurable threshold are visually flagged | Threshold hardcoded at >= 70 from Phase 5 (STATE.md); `DetectionEvent.status === "FLAGGED"` is already written by `claude.ts`; badge rendering is pure Tailwind conditional class |
| DASH-03 | Each flagged session has an expandable panel displaying Claude's full reasoning transcript alongside the confidence score | `DetectionEvent.reasoning` and `confidenceScore` are persisted; expandable row = client `useState` toggle + Tailwind `hidden/block`; no external library needed |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (App Router) | 16.1.6 (already installed) | Server Component page + route handler | Project standard; all other pages use this pattern |
| Prisma Client | 7.4.2 (already installed) | Direct DB query in Server Component | Established project pattern; `@/lib/db` singleton already exists |
| `next/navigation` `useRouter` | bundled with Next.js | `router.refresh()` for polling | Official Next.js polling mechanism — preserves client state, re-runs Server Component |
| Tailwind CSS | 4 (already installed) | Styling — badges, table, expandable panel | Project standard; all pages use Tailwind utility classes |
| Auth.js v5 (`auth()`) | next-auth ^5.0.0-beta.30 (already installed) | Server-side session check + redirect | Established project pattern; same as `(shop)/layout.tsx` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React `useState` | 19.2.3 (already installed) | Toggle expanded row state | Client component for expandable panel — no external library needed at this scale |
| React `useEffect` | 19.2.3 (already installed) | `setInterval` cleanup for polling | Required for `<PollingRefresher>` client component |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `router.refresh()` polling | `useSWR` / `react-query` client fetch to a GET API route | Adds a library + an API route; `router.refresh()` is sufficient for 10s polling and preserves RSC pattern |
| `router.refresh()` polling | WebSocket / SSE | Out of scope per REQUIREMENTS.md; adds Vercel complexity |
| Plain `useState` toggle | TanStack Table expanding rows | Massive overkill for a 3-column table with one expand action |
| Tailwind-only badges | `shadcn/ui` Badge component | No shadcn installed in project; custom Tailwind badges match project style |

**Installation:** No new packages required — all dependencies already exist in the project.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   └── dashboard/
│       ├── page.tsx            # Server Component — auth check, Prisma query, renders SessionTable
│       └── PollingRefresher.tsx # "use client" — setInterval + router.refresh()
├── components/
│   └── SessionTable.tsx        # "use client" — renders rows, manages expanded state
```

The dashboard lives at the top-level `app/dashboard/` route (not inside `(shop)` group) so it gets its own layout. It uses the same auth pattern as the shop layout but without the nav header — or it can share the shop layout by being placed in `(shop)/dashboard/`. Both work; top-level is cleaner for a separate "admin" tool.

### Pattern 1: Server Component Page with Direct Prisma Query

**What:** The dashboard `page.tsx` is an async Server Component. It calls `auth()` to verify the session, then calls Prisma directly (no API route) to fetch all `Session` rows with their related `Fingerprint` and `DetectionEvent` data. It renders a `<SessionTable>` client component, passing the data as props.

**When to use:** Any page that needs server-side auth + Prisma data before rendering. Official Next.js pattern for App Router.

**Example:**
```typescript
// src/app/dashboard/page.tsx
// Source: https://nextjs.org/learn/dashboard-app/fetching-data
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { SessionTable } from "@/components/SessionTable"
import { PollingRefresher } from "./PollingRefresher"

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const sessions = await prisma.session.findMany({
    where: { expires: { gt: new Date() } },
    include: {
      fingerprints: {
        where: { isOriginal: true },
        take: 1,
      },
      detectionEvents: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { expires: "desc" },
  })

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PollingRefresher intervalMs={8000} />
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">
        Security Dashboard
      </h1>
      <SessionTable sessions={sessions} />
    </div>
  )
}
```

### Pattern 2: Polling with router.refresh()

**What:** A minimal `"use client"` component whose only job is to call `router.refresh()` on an interval. `router.refresh()` makes a new server request, re-runs the Server Component, and merges the updated RSC payload into the page — without losing React client state (e.g., which row is expanded).

**When to use:** Any Next.js App Router page that needs periodic data refresh. Official recommended pattern.

**Example:**
```typescript
// src/app/dashboard/PollingRefresher.tsx
// Source: https://www.davegray.codes/posts/usepolling-custom-hook-for-auto-fetching-in-nextjs
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function PollingRefresher({ intervalMs }: { intervalMs: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
```

**Critical:** `useRouter` must be imported from `next/navigation`, NOT `next/router`. The App Router uses `next/navigation`.

### Pattern 3: Expandable Row with useState Toggle

**What:** A `"use client"` component maintains a `Set<string>` (or `string | null`) of expanded session IDs. Clicking a row toggles inclusion of its ID. The expanded panel renders conditionally — either with `hidden` class or with a transition.

**When to use:** Small tables with detail panels where no heavy table library is justified.

**Example:**
```typescript
// src/components/SessionTable.tsx
"use client"

import { useState } from "react"

type SessionRow = {
  id: string
  detectionEvents: Array<{
    id: string
    status: string
    confidenceScore: number | null
    reasoning: string | null
  }>
  fingerprints: Array<{
    visitorId: string
    ip: string | null
    userAgent: string | null
  }>
}

export function SessionTable({ sessions }: { sessions: SessionRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left">Visitor ID</th>
            <th className="px-4 py-3 text-left">IP Address</th>
            <th className="px-4 py-3 text-left">User Agent</th>
            <th className="px-4 py-3 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sessions.map(session => {
            const fp = session.fingerprints[0]
            const event = session.detectionEvents[0]
            const status = event?.status ?? "ACTIVE"
            const isFlagged = status === "FLAGGED"
            const isExpanded = expandedId === session.id

            return (
              <>
                <tr
                  key={session.id}
                  onClick={() => isFlagged && toggle(session.id)}
                  className={isFlagged ? "cursor-pointer hover:bg-red-50" : ""}
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {fp?.visitorId?.slice(0, 12) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fp?.ip ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {fp?.userAgent ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                </tr>
                {isFlagged && isExpanded && event && (
                  <tr key={`${session.id}-detail`}>
                    <td colSpan={4} className="bg-red-50 px-4 py-4">
                      <p className="mb-1 text-xs font-semibold text-red-700">
                        Confidence: {event.confidenceScore}/100
                      </p>
                      <p className="text-sm text-gray-700">{event.reasoning}</p>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    FLAGGED:  "bg-red-100 text-red-700",
    PENDING:  "bg-yellow-100 text-yellow-700",
    CLEAR:    "bg-green-100 text-green-700",
    ACTIVE:   "bg-gray-100 text-gray-700",
  }
  const cls = styles[status] ?? styles.ACTIVE
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}
```

### Pattern 4: Prisma Query for Dashboard Data

**What:** A `findMany` on `Session` with nested `include` to get original fingerprint and most-recent detection event per session. Filter to non-expired sessions only.

**When to use:** Fetching dashboard rows.

```typescript
// Source: Prisma docs — https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries
const sessions = await prisma.session.findMany({
  where: {
    expires: { gt: new Date() },  // only active sessions
  },
  include: {
    fingerprints: {
      where: { isOriginal: true },
      take: 1,
    },
    detectionEvents: {
      orderBy: { createdAt: "desc" },
      take: 1,  // most recent event only
    },
  },
  orderBy: { expires: "desc" },
})
```

**Note on status derivation:** Each session's display status is derived from its most recent `DetectionEvent.status`. If no detection event exists, the session is `ACTIVE` (no hijack was detected). If a detection event exists, its status is `PENDING` | `FLAGGED` | `CLEAR` as written by `claude.ts`.

### Pattern 5: Auth Protection (Dual-layer)

**What:** The `proxy.ts` matcher already protects all routes. The dashboard page adds a server-side `auth()` + `redirect()` as a second layer, identical to `(shop)/layout.tsx`. This ensures unauthenticated requests are blocked even if the proxy ever has edge-case failures.

The existing `proxy.ts` matcher already covers `/dashboard` because it matches all paths except the explicit exceptions (`api/auth`, `login`, `_next/*`, `favicon.ico`). No change to `proxy.ts` is needed.

### Anti-Patterns to Avoid

- **API route for dashboard data:** Don't create `/api/dashboard` — Server Components can call Prisma directly. Adding an API route just adds a round-trip and boilerplate.
- **Importing `useRouter` from `next/router`:** Must use `next/navigation` in App Router. The old import causes a runtime error.
- **`setInterval` without cleanup:** Always return `() => clearInterval(id)` from `useEffect` to prevent memory leaks when navigating away.
- **Re-fetching every field on every session:** The dashboard only needs the original fingerprint and the most recent detection event per session. Use `take: 1` and filter by `isOriginal: true` to avoid N+1 data inflation.
- **TanStack Table or similar for 3 columns:** Way too much overhead for this scope. Plain HTML `<table>` with Tailwind is sufficient and matches project style.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling | Custom WebSocket server or SSE endpoint | `router.refresh()` in `setInterval` | Already supported by Next.js; WebSocket adds Vercel complexity flagged in REQUIREMENTS.md Out of Scope |
| Auth check | Manual cookie parsing | `auth()` from `@/lib/auth` | Already used everywhere in the project; handles edge cases |
| Badge styling | CSS modules / styled-components | Tailwind utility classes | Project already uses Tailwind everywhere |
| Table expansion state | External state manager | `useState` | Perfectly sufficient; no global state needed |

**Key insight:** The entire dashboard is a thin presentation layer over data that Phase 5 already persists. No new Prisma models, no new auth logic, no new detection logic. The hardest part is getting the Prisma query shape right and correctly composing the client/server component boundary.

---

## Common Pitfalls

### Pitfall 1: router.refresh() known issue in Next.js 15+
**What goes wrong:** GitHub issue #77504 (March 2025) documents cases where `router.refresh()` may silently do nothing in Next.js 15 when called from certain component positions.
**Why it happens:** Likely related to router cache or Suspense boundary behavior.
**How to avoid:** Wrap `<PollingRefresher>` outside any Suspense boundaries on the page. Test early by confirming data updates visually. If `router.refresh()` proves unreliable, the fallback is a `fetch('/api/dashboard')` pattern with local `useState` — but this requires an additional API route.
**Warning signs:** Dashboard data does not update after simulating a new fingerprint.

### Pitfall 2: Client/Server Component boundary with table rows
**What goes wrong:** Attempting to use `useState` inside a component that is also used as a Server Component. Fragment keys in mixed server/client table rows can also cause React key warnings.
**Why it happens:** React fragments across `<tr>` rows need explicit keys.
**How to avoid:** Ensure `SessionTable` has `"use client"` at the top. Use `key={session.id}` on the data row and `key={session.id + "-detail"}` on the detail row within the fragment, or wrap each pair in a `<React.Fragment key={session.id}>`.

### Pitfall 3: Stale data from Next.js router cache
**What goes wrong:** `router.refresh()` re-fetches server data, but Next.js may serve a cached RSC payload if `fetch()` is used with caching. Direct Prisma calls (not `fetch()`) bypass the cache entirely.
**Why it happens:** Next.js caches `fetch()` responses by default.
**How to avoid:** Fetch data via Prisma directly in the Server Component (no `fetch()`). This ensures every `router.refresh()` hits the DB and returns fresh data.

### Pitfall 4: `findMany` without filtering expired sessions
**What goes wrong:** Dashboard shows thousands of historical sessions from old OAuth callbacks, including sessions from weeks ago.
**Why it happens:** Auth.js creates a new `Session` row for every login and doesn't delete old ones immediately.
**How to avoid:** Add `where: { expires: { gt: new Date() } }` to filter only non-expired sessions.

### Pitfall 5: Expandable row loses state on router.refresh()
**What goes wrong:** The user expands a flagged session to read Claude's reasoning. `router.refresh()` fires and the expanded panel collapses.
**Why it happens:** `useState` in client components is preserved across `router.refresh()` because the RSC payload is merged, not replaced. This is a feature, not a bug.
**How to avoid:** No action needed — `router.refresh()` explicitly preserves client `useState`. Verify this in testing.

### Pitfall 6: Dashboard route not in proxy.ts matcher
**What goes wrong:** `/dashboard` is accessible without login.
**Why it happens:** A misconfigured matcher regex.
**How to avoid:** The existing matcher `/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)` already matches `/dashboard`. No change needed. Verify with a logged-out browser tab.

---

## Code Examples

Verified patterns from project codebase and official sources:

### Derived Status Logic (no new schema needed)
```typescript
// Status is already written to DetectionEvent.status by claude.ts (Phase 5)
// Values: "PENDING" | "FLAGGED" | "CLEAR"
// Absent detection event = "ACTIVE" (legitimate session, no mismatch detected)
function deriveStatus(detectionEvents: Array<{ status: string }>) {
  const latest = detectionEvents[0]
  return latest?.status ?? "ACTIVE"
}
```

### Confidence Threshold Check
```typescript
// Threshold is hardcoded at >= 70 in Phase 5 (claude.ts line 70)
// DetectionEvent.status === "FLAGGED" is the authoritative source
// Dashboard should use status field, not re-compute from score
const isFlagged = event?.status === "FLAGGED"
```

### Navigation Link Addition
```typescript
// Add dashboard link to shop nav in (shop)/layout.tsx
<Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
  Dashboard
</Link>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` for route protection | `proxy.ts` (same concept, renamed) | Next.js 16 | This project already uses `proxy.ts` correctly |
| `next/router` `useRouter` | `next/navigation` `useRouter` | Next.js 13 (App Router) | Must import from `next/navigation` |
| `getServerSideProps` for Prisma data | `async` Server Component with direct Prisma call | Next.js 13 | No API route needed; direct DB call is preferred |
| WebSockets for live data | `router.refresh()` polling | Next.js 13.4+ | Sufficient for 10s requirements; no extra infra |

**Deprecated/outdated:**
- `getServerSideProps`: Not applicable in App Router; replaced by async Server Components.
- `useRouter` from `next/router`: Wrong package for App Router; causes runtime error.

---

## Open Questions

1. **Should `/dashboard` live inside `(shop)` route group or be a top-level route?**
   - What we know: The `(shop)` group provides the shared nav layout (Products / Profile / Sign out). Adding `/dashboard` inside `(shop)` would give it the same nav automatically and keep the auth check in the layout.
   - What's unclear: Whether the product owner wants the dashboard to have the e-commerce nav or a standalone admin-style page.
   - Recommendation: Place `dashboard/` inside the `(shop)` route group so it inherits the nav and layout auth check — simpler, no duplicate auth logic needed. Add a "Dashboard" link to the nav in `(shop)/layout.tsx`.

2. **Polling interval: 8s vs 10s?**
   - What we know: Success criterion says "within 10 seconds." The requirements say polling at 5–10s is imperceptible during demos.
   - What's unclear: Whether the planner should target the maximum allowed (10s) or leave headroom.
   - Recommendation: Use 8000ms — satisfies the 10-second requirement with 2 seconds of headroom for server processing time.

3. **Should all sessions be shown or only sessions with mismatches?**
   - What we know: DASH-01 says "all active sessions." The schema stores all sessions (Auth.js creates one per login).
   - What's unclear: A demo environment may have many legitimate-looking sessions with no detection events. The dashboard will show rows with `ACTIVE` status but no useful fingerprint data since only mismatched fingerprints trigger a `DetectionEvent`.
   - Recommendation: Show all non-expired sessions. ACTIVE rows display the original fingerprint's visitorId/IP/UA. This matches DASH-01 literally and makes the contrast between ACTIVE and FLAGGED sessions visible.

---

## Validation Architecture

> Skipped: `workflow.nyquist_validation` is `false` in `.planning/config.json`.

---

## Sources

### Primary (HIGH confidence)
- Next.js official docs — `useRouter` API reference, `router.refresh()` behavior: https://nextjs.org/docs/app/api-reference/functions/use-router (fetched 2026-02-28, version 16.1.6)
- Next.js official docs — `proxy.ts` file convention: https://nextjs.org/docs/app/api-reference/file-conventions/proxy (search verified 2026-02-28)
- Next.js official learn — data fetching in Server Components with Prisma: https://nextjs.org/learn/dashboard-app/fetching-data
- Prisma docs — `findMany` with nested `include`: https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries
- Project codebase — `proxy.ts`, `(shop)/layout.tsx`, `claude.ts`, `detection.ts`, `prisma/schema.prisma` (read directly 2026-02-28)

### Secondary (MEDIUM confidence)
- Dave Gray — `usePolling` custom hook pattern (verified against official `useRouter` docs): https://www.davegray.codes/posts/usepolling-custom-hook-for-auto-fetching-in-nextjs
- Auth.js docs — protecting routes with `auth()` + `redirect()`: https://authjs.dev/getting-started/session-management/protecting

### Tertiary (LOW confidence — note for validation)
- GitHub issue #77504 — `router.refresh()` may not work reliably in all Next.js 15+ contexts: https://github.com/vercel/next.js/issues/77504. **Flag:** Verify polling works as expected in dev before relying on it.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use in this project; no new dependencies required
- Architecture: HIGH — server-component + `router.refresh()` polling is official Next.js pattern, verified against docs; expandable row with `useState` is standard React
- Prisma query: HIGH — `findMany` with nested `include` is documented; schema fields verified by reading `prisma/schema.prisma` directly
- Pitfalls: MEDIUM — `router.refresh()` issue is LOW confidence (single GitHub issue, not verified in this project); other pitfalls are HIGH confidence from official docs

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable APIs — Next.js, Prisma, Tailwind change slowly)
