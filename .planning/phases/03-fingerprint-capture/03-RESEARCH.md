# Phase 3: Fingerprint Capture — Research

**Gathered:** 2026-02-28
**Status:** Complete
**Confidence:** HIGH

---

## Summary

Phase 3 is substantially built. The FingerprintJS Pro client SDK, server ingest API, Prisma schema, and sessionStorage caching are all implemented. One gap exists against the formal requirements: FP-02 specifies a "configurable TTL" for the cache, but the current implementation uses a lifetime boolean flag with no expiry. This is the only change needed.

The FingerprintJS Pro account is currently inactive (90-day inactivity suspension). Code is correct and will function once the account is reactivated.

---

## Stack

| Concern | Package | Version |
|---------|---------|---------|
| Fingerprint SDK | `@fingerprintjs/fingerprintjs-pro-spa` | 1.3.3 |
| Auth | `next-auth` | 5.0.0-beta.30 |
| ORM | `@prisma/client` | 7.4.2 |
| Validation | `zod` | 4.3.6 |
| Runtime | Next.js App Router Node.js | 16.1.6 |

No new packages needed for Phase 3.

---

## What Was Built

### Client: `src/components/FingerprintReporter.tsx`
- `"use client"` component, renders null
- Loads FingerprintJS Pro with `NEXT_PUBLIC_FINGERPRINT_API_KEY`
- Calls `client.get({ extendedResult: true })` → casts to `ExtendedGetResult`
- Extracts: `visitorId`, `requestId`, `os`, `browserName`
- Adds: `screenRes` (`screen.width x screen.height`), `timezone` (Intl API)
- Caches with `sessionStorage.setItem("sentinel_fp_sent", "1")` — **boolean only, no TTL**
- POSTs to `/api/session/record`
- Wired into `(shop)/layout.tsx` — fires on every authenticated page load

### Server: `src/app/api/session/record/route.ts`
- `auth()` validates session server-side
- Looks up DB session by `userId` (most recent, ordered by `expires DESC`)
- Zod schema validates: `visitorId`, `requestId`, `os?`, `browser?`, `screenRes?`, `timezone?`
- Deduplicates by `requestId` (UNIQUE constraint) — returns `{status: "duplicate"}` on hit
- Marks `isOriginal: true` if no prior fingerprints exist for the session
- Captures `ip` from `x-forwarded-for` / `x-real-ip` headers
- Captures `userAgent` from `user-agent` header

### Schema: `prisma/schema.prisma`
```prisma
model Fingerprint {
  id         String   @id @default(cuid())
  sessionId  String
  visitorId  String
  requestId  String   @unique
  ip         String?
  userAgent  String?  @db.Text
  os         String?
  browser    String?
  screenRes  String?
  timezone   String?
  isOriginal Boolean  @default(false)
  createdAt  DateTime @default(now())
  session    Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@index([visitorId])
}
```

---

## Requirements Coverage

| Req | Description | Status |
|-----|-------------|--------|
| FP-01 | FingerprintJS Pro SDK loads on authenticated page | ✅ Built |
| FP-02 | sessionStorage cache with configurable TTL | ⚠️ Gap: boolean flag only, no TTL |
| FP-03 | Fingerprint row written with all required fields | ✅ Built |
| FP-04 | requestId deduplication (no duplicate rows) | ✅ Built |
| FP-05 | First fingerprint marked isOriginal | ✅ Built |

---

## Gap: FP-02 Configurable TTL

**Current behavior:** `sessionStorage.setItem("sentinel_fp_sent", "1")` — a lifetime flag. Once set, no fingerprint is ever re-sent in the browser session regardless of age.

**Required behavior:** Cache should expire after a configurable duration so that long-running sessions eventually re-fingerprint (supports detection accuracy).

**Fix:** Store a timestamp alongside the cache key and compare against `NEXT_PUBLIC_FINGERPRINT_TTL_MS` (default: 30 minutes = 1800000ms).

```ts
// Write:
sessionStorage.setItem(CACHE_KEY, String(Date.now()))

// Read:
const cached = sessionStorage.getItem(CACHE_KEY)
const ttl = Number(process.env.NEXT_PUBLIC_FINGERPRINT_TTL_MS ?? 1_800_000)
if (cached && Date.now() - Number(cached) < ttl) return
```

---

## Pitfalls

1. **FingerprintJS Pro account inactive** — Code is correct; `ERR_SUBSCRIPTION_NOT_ACTIVE` thrown at `client.get()`. Will resolve when account reactivated.
2. **`NEXT_PUBLIC_` prefix required** — API key must be exposed to browser. Server-only key name would make it undefined client-side.
3. **React StrictMode double-invoke** — `useEffect` runs twice in dev StrictMode. The sessionStorage cache check on the second run prevents double-POST. TTL-based cache check does the same.
4. **Multi-session ID mismatch** — `prisma.session.findFirst({ where: { userId }, orderBy: { expires: 'desc' } })` selects the most recent session. Acceptable for PoC; edge case in multi-device scenarios.
5. **Prisma 7 generate required** — After any schema change: `npx prisma db push && npx prisma generate`. Client is not auto-regenerated.
6. **`ExtendedGetResult` cast** — `client.get({ extendedResult: true })` returns `GetResult` type by default; must cast to `ExtendedGetResult` to access `os` and `browserName` as direct string properties.

---

## Ready for Planning

One plan needed:
- **03-01:** Fix FP-02 TTL gap in `FingerprintReporter.tsx` + add `NEXT_PUBLIC_FINGERPRINT_TTL_MS` env var documentation + verify all 5 requirements
