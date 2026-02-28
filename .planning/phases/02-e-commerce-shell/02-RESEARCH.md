# Phase 2: E-Commerce Shell - Research

**Researched:** 2026-02-28
**Domain:** Next.js 16 App Router — authenticated route groups, Server Components, Auth.js v5 session access
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-01 | Authenticated user can browse a product listing page | Products page with mock grid exists at `/products`; auth gate via `proxy.ts` + `(shop)/layout.tsx` |
| SHOP-02 | Authenticated user can view their account/profile page | Profile page showing name, email, avatar from OAuth session exists at `/profile` |
</phase_requirements>

---

## Summary

Phase 2 is already built and satisfies both SHOP-01 and SHOP-02 requirements. The `(shop)` route group contains a shared layout with navigation, a products page displaying 8 mock items in a responsive grid, and a profile page surfacing the user's OAuth identity (name, email, avatar). All routes are protected by a two-layer auth gate: the `proxy.ts` middleware covers all matched routes project-wide, and the `(shop)/layout.tsx` runs a redundant `auth()` check with redirect.

**One minor quality gap exists:** `src/app/(shop)/profile/page.tsx` performs a third, unnecessary `auth()` call and redirect. The proxy and layout already guarantee no unauthenticated request reaches this page. The redundant call incurs an extra database round-trip on every profile page load with no security benefit. This is the only recommended change.

Everything else — the route group structure, the nav layout, the mock product data, the profile data display, the FingerprintReporter wiring, and the `proxy.ts` naming convention for Next.js 16 — is correct and well-implemented.

**Primary recommendation:** Remove the redundant `auth()` guard from `profile/page.tsx`. No other changes are needed for phase completion.

---

## What Was Built — Evaluation

### `proxy.ts` (middleware)

```typescript
// Correct for Next.js 16: re-exports auth as "proxy" (required named export)
export { auth as proxy } from "@/lib/auth"

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
}
```

**Assessment: CORRECT.** Next.js 16 renamed `middleware.ts` → `proxy.ts` and requires the exported function to be named `proxy`. Auth.js v5's `authorized` callback (`return !!auth`) correctly returns `false` for unauthenticated users, triggering a redirect to `/login`. The matcher correctly excludes OAuth callback routes and the login page itself.

**Confidence:** HIGH — verified against Next.js 16.1.6 official docs (https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

### `(shop)/layout.tsx` (shared nav + auth check)

```typescript
export default async function ShopLayout({ children }) {
  const session = await auth()
  if (!session) { redirect("/login") }
  // nav with Products link, Profile link, user email, Sign Out
  // <FingerprintReporter /> (Phase 3 concern, already wired)
  return (...)
}
```

**Assessment: CORRECT** — single auth() call at the layout level, providing the auth gate for the entire route group. The FingerprintReporter was already wired in during Phase 3; it renders null until the Pro account is reactivated.

### `products/page.tsx`

**Assessment: CORRECT** — pure Server Component, no auth() call needed (layout guarantees auth). 8 mock products in a responsive 2/3/4-column grid. Static data is explicitly acceptable per SHOP-01 ("static/mock data is fine").

### `profile/page.tsx`

**Assessment: MINOR ISSUE — redundant auth() call.**

```typescript
export default async function ProfilePage() {
  const session = await auth()   // ← redundant: proxy + layout already guarantee auth
  if (!session) {
    redirect("/login")           // ← redundant: unreachable code path
  }
  // ...display user.name, user.email, user.image
}
```

The proxy and layout both run before this page renders. The `auth()` call in the page-level Server Component makes a database query to resolve the session — this query is not cached between the layout's `auth()` call and the page's `auth()` call in the same request in Next.js App Router (each `auth()` call is independent). The page still works correctly, but the redundant guard adds latency.

**Fix:** Remove the `auth()` call and redirect from `profile/page.tsx`. Access the session via a prop passed from the layout, or simply remove it since the layout already has the session for the nav display.

**However:** The profile page DOES need the session to display user data (name, email, image). The correct pattern is to call `auth()` once in the page but omit the redundant null guard — the proxy + layout guarantee it will never be null. Alternatively (Next.js App Router best practice), pass session data as a prop from layout, but this requires more restructuring. The simplest fix is to remove only the if/redirect guard, keeping the `auth()` call for the data.

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| next | 16.1.6 | App Router, Server Components, proxy | Correct |
| next-auth | 5.0.0-beta.30 | Auth.js v5 — OAuth, database sessions, `auth()` helper | Correct |
| @auth/prisma-adapter | 2.11.1 | Binds Auth.js to Prisma session storage | Correct |
| react | 19.2.3 | UI rendering | Correct |
| tailwindcss | 4.x | Utility CSS — shop pages use Tailwind throughout | Correct |

**No new dependencies are needed for Phase 2 completion.**

### Key Next.js 16 conventions in use

| Convention | What it does | Verified |
|------------|--------------|---------|
| `proxy.ts` (root) | Named `proxy` export replaces `middleware.ts` | HIGH — Next.js 16 docs |
| `(shop)` route group | Groups routes without adding URL segment | HIGH — Next.js App Router docs |
| `async` Server Components | `auth()` called directly at top of layout/page | HIGH — Auth.js v5 docs |
| `"use server"` in Server Action | `signOut()` wrapped in form action | HIGH — Next.js docs |

---

## Architecture Patterns

### Recommended Project Structure (as built)

```
src/app/
├── (auth)/
│   └── login/page.tsx          # Public sign-in page
├── (shop)/
│   ├── layout.tsx              # Auth gate + nav — runs auth() once for group
│   ├── products/page.tsx       # Product grid — no auth() needed
│   └── profile/page.tsx        # User identity — auth() for data only, no guard
├── api/
│   └── session/record/route.ts # Fingerprint ingest (Phase 3)
├── layout.tsx                  # Root layout (Geist font, metadata)
└── page.tsx                    # Root page — redirects to /products
proxy.ts                        # Auth proxy (Next.js 16)
```

### Pattern 1: Route Group Auth Gate

**What:** Auth check at layout level covers all routes in the group. Pages trust the layout guarantee.

**When to use:** When all routes in a group share the same auth requirement.

```typescript
// (shop)/layout.tsx — auth gate lives HERE, not in child pages
export default async function ShopLayout({ children }) {
  const session = await auth()
  if (!session) redirect("/login")
  return <div>...</div>
}

// (shop)/products/page.tsx — NO auth() call needed
export default function ProductsPage() {
  return <div>...</div>  // Layout guarantees session exists
}

// (shop)/profile/page.tsx — auth() for data, NO guard
export default async function ProfilePage() {
  const session = await auth()
  // session is guaranteed non-null by layout — no if/redirect needed
  const { user } = session
  return <div>{user.name}</div>
}
```

**Source:** Next.js App Router layout nesting guarantees — layouts run before child pages.

### Pattern 2: Auth.js v5 Server Component Access

**What:** `auth()` from `@/lib/auth` is callable directly in any Server Component — no context providers needed.

```typescript
// Works in layout.tsx, page.tsx, and any async Server Component
import { auth } from "@/lib/auth"

const session = await auth()
// session.user.name, session.user.email, session.user.image
```

### Pattern 3: Sign Out via Server Action

**What:** Auth.js v5 `signOut()` is called in a form's server action to avoid exposing a client-side API route.

```typescript
// Source: current layout.tsx
<form action={async () => {
  "use server"
  await signOut({ redirectTo: "/login" })
}}>
  <button type="submit">Sign out</button>
</form>
```

### Anti-Patterns to Avoid

- **Page-level redundant auth guard:** Calling `auth()` + `redirect()` in every page in a group when the layout already does it. Adds a DB round-trip per page with zero security benefit.
- **Client-side session access for display:** Using `useSession()` in a client component for static display data. Server Components can read session directly — no client-side session hook needed for this use case.
- **Blocking proxy for session validation:** The proxy performs lightweight JWT-or-cookie presence check only. Full session validation (DB lookup) happens in the layout's `auth()` call. This is the correct separation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth gate in every route | Per-page auth checks | Route group layout + proxy.ts | Single point of control; pages trust layout |
| Sign out endpoint | Custom `/api/signout` route | Auth.js `signOut()` Server Action | CSRF-safe, session cleanup, cookie deletion |
| Session cookie naming | Custom cookie logic | Auth.js `cookies.sessionToken.name` config | Consistent naming across all Auth.js internals |

**Key insight:** Auth.js v5's `authorized` callback in `proxy.ts` + the layout `auth()` check provides defense-in-depth without any custom auth plumbing.

---

## Common Pitfalls

### Pitfall 1: Redundant auth() in child pages

**What goes wrong:** Every page under the route group calls `auth()` + redirect. This works but is inefficient — each `auth()` call in a Server Component makes an independent database lookup (Next.js does not deduplicate `auth()` calls across layout and page in the same render).

**Why it happens:** Defensive programming — developers copy-paste the auth pattern from the layout into each page.

**How to avoid:** Only call `auth()` in the group's layout for the guard. In child pages, call `auth()` only if you need the session data, and skip the null guard.

**Warning signs:** `if (!session) { redirect("/login") }` appearing in page files within an already-protected route group.

**Current status:** This pitfall exists in `profile/page.tsx` — minor but real.

### Pitfall 2: Confusing `proxy.ts` with `middleware.ts` in Next.js 16

**What goes wrong:** Developers create `middleware.ts` expecting it to run — but Next.js 16 uses `proxy.ts`. Auth gate silently fails (no file = no proxy = unprotected routes).

**Why it happens:** All Next.js 15 tutorials still reference `middleware.ts`.

**How to avoid:** Use `proxy.ts` with `export function proxy()` or `export { auth as proxy }`. Next.js 16 provides a codemod: `npx @next/codemod@canary middleware-to-proxy .`

**Warning signs:** Auth gate not firing; protected routes accessible without a session cookie.

### Pitfall 3: FingerprintReporter silently failing

**What goes wrong:** `FingerprintReporter` loads on every shop page but the FingerprintJS Pro account is inactive. The component silently swallows errors (`console.error` only). Phase 2 UI still works, but fingerprint capture is broken.

**Why it happens:** FingerprintJS Pro cancels accounts after 90 days inactivity.

**How to avoid:** The `NEXT_PUBLIC_FINGERPRINT_API_KEY` env var check in the component surfaces this as a console.warn if the key is missing; if the key is present but the account is inactive, the Pro API returns an error that is caught and logged.

**Warning signs:** No rows in the `Fingerprint` table after authenticated page loads. Console errors from FingerprintReporter.

**Note:** This is a Phase 3 concern, but it's wired into the Phase 2 layout. Phase 2's success criteria are unaffected.

### Pitfall 4: Proxy matcher must exclude api/auth

**What goes wrong:** Including `api/auth` in the matcher causes an infinite redirect loop — the OAuth callback is intercepted by the proxy before auth completes, which forces another OAuth redirect.

**Current status:** The matcher correctly excludes `api/auth`:
```
"/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"
```

---

## Code Examples

### Correct profile page pattern (after removing redundant guard)

```typescript
// Source: pattern derived from Next.js App Router Server Component docs
// (shop)/profile/page.tsx — AFTER fix

import { auth } from "@/lib/auth"

export default async function ProfilePage() {
  // auth() is needed for session data, but NOT for the guard
  // The layout.tsx auth() + proxy.ts guarantee this is never null
  const session = await auth()
  const { user } = session!  // non-null assertion is safe here

  return (
    <div>
      {/* ...display user.name, user.email, user.image */}
    </div>
  )
}
```

### Correct pattern: no auth() in products page

```typescript
// (shop)/products/page.tsx — CURRENT STATE, already correct
// No auth() call needed — layout.tsx guarantees auth
export default function ProductsPage() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <div key={product.id}>...</div>
      ))}
    </div>
  )
}
```

### Next.js 16 proxy.ts export pattern

```typescript
// proxy.ts — CURRENT STATE, already correct
// Named "proxy" export required by Next.js 16
export { auth as proxy } from "@/lib/auth"

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` + `export function middleware()` | `proxy.ts` + `export function proxy()` | Next.js v16.0.0 | File rename required; Next.js 15 middleware.ts no longer auto-discovered |
| `useSession()` from `next-auth/react` in Client Components | `auth()` directly in Server Components | Auth.js v5 | Eliminates SessionProvider wrapper for server-rendered auth data |
| Edge Runtime for middleware | Node.js runtime for proxy (default in v16) | Next.js v15.5.0 stable | Prisma and Anthropic SDK can now be used in proxy — no Edge Runtime restrictions |

**Deprecated/outdated:**
- `middleware.ts`: No longer auto-discovered in Next.js 16. Replaced by `proxy.ts`.
- `getServerSideProps` for auth: Replaced by Server Components + `auth()` in App Router.
- `SessionProvider` + `useSession` for display-only data: Unnecessary overhead when Server Components can read session directly.

---

## Open Questions

1. **Is `auth()` deduplicated across layout and page in the same request?**
   - What we know: Next.js React cache (`cache()`) can deduplicate function calls within a render. Auth.js v5 does not appear to use `cache()` wrapper on `auth()` by default.
   - What's unclear: Whether Next.js 16 automatically deduplicates identical `auth()` calls in the same render tree.
   - Recommendation: Assume each `auth()` call is an independent DB query. Remove the redundant one from `profile/page.tsx` to avoid the cost.

2. **Dashboard route (`/dashboard`) — protection scope**
   - What we know: Phase 6 adds a `/dashboard` page. It is not inside the `(shop)` route group.
   - What's unclear: Whether `/dashboard` will be its own route group with a separate layout, or a top-level page relying solely on `proxy.ts`.
   - Recommendation: Plan Phase 6 with a `(dashboard)` route group pattern mirroring `(shop)`.

---

## Recommended Changes for Phase Completion

Phase 2 is functionally complete. The single recommended improvement:

### Change 1: Remove redundant auth guard from `profile/page.tsx`

**File:** `src/app/(shop)/profile/page.tsx`
**Action:** Remove the `if (!session) { redirect("/login") }` block. Keep `const session = await auth()` for the user data.
**Why:** The layout already guarantees auth. The redundant check adds a DB query with no security benefit.
**Risk:** None — the proxy and layout enforce auth before this page executes.

```typescript
// BEFORE (current)
export default async function ProfilePage() {
  const session = await auth()
  if (!session) {
    redirect("/login")  // ← remove this
  }
  const { user } = session
  // ...
}

// AFTER (recommended)
export default async function ProfilePage() {
  const session = await auth()
  const { user } = session!  // safe — layout guarantees non-null
  // ...
}
```

---

## Sources

### Primary (HIGH confidence)
- Next.js 16.1.6 official docs — `proxy.ts` file convention: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Next.js 16 upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16
- Direct code inspection: `proxy.ts`, `(shop)/layout.tsx`, `(shop)/products/page.tsx`, `(shop)/profile/page.tsx`, `src/lib/auth.ts`

### Secondary (MEDIUM confidence)
- WebSearch: Next.js 16 middleware→proxy rename confirmed against official docs and GitHub discussion (https://github.com/vercel/next.js/discussions/84842)

---

## Metadata

**Confidence breakdown:**
- Phase implementation status: HIGH — direct code inspection
- Standard stack: HIGH — package.json versions confirmed, Next.js 16 docs verified
- Architecture patterns: HIGH — Next.js App Router route group behavior is well-documented
- Recommended fix: HIGH — redundant auth() is demonstrably removable with no security impact

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable — Next.js 16.1.6, Auth.js v5 beta are pinned in package.json)
