# Phase 4: Detection Engine - Research

**Researched:** 2026-02-28
**Domain:** Session hijack detection — Prisma schema migration, read-then-write transaction, weighted fingerprint similarity scoring, detection event persistence
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DETECT-01 | System detects when a second distinct visitorId appears on an active sessionId | Detection logic pattern inside the `/api/session/record` route handler; `$transaction` with read-then-write; original fingerprint lookup via `isOriginal: true` |
| DETECT-02 | Component-level similarity check before triggering Claude: compares OS, browser family, timezone, screen resolution; weights similarity to reduce false positives | Pure TypeScript weighted similarity function (no library needed); result stored as `similarityScore` field on `DetectionEvent` |
| DETECT-03 | Detection events persisted: timestamp, sessionId, original visitorId, new visitorId, IP addresses of both requests | New `DetectionEvent` Prisma model; `prisma db push && prisma generate` workflow matches project's no-migration setup |
</phase_requirements>

---

## Summary

Phase 4 integrates detection logic directly into the existing `/api/session/record` POST route handler. When a new fingerprint arrives, the handler queries whether the session already has an original fingerprint with a *different* `visitorId`. If it does, a `DetectionEvent` row is created containing the mismatch details, a component-level similarity score, and both IP addresses. If the incoming `visitorId` matches the existing original, nothing is written and the normal response is returned.

The core engineering challenge is making the detection check and detection event write atomic — preventing two concurrent requests from both "winning" the original slot and potentially producing double detection events. Prisma's interactive `$transaction` with PostgreSQL's default `ReadCommitted` isolation is sufficient here because the fingerprint table already has a `requestId UNIQUE` constraint (the project's FP-05 deduplication guard). The detection flow must also handle the case where the original fingerprint was already recorded in Phase 3 using `isOriginal: true`.

The similarity check for DETECT-02 is a simple weighted function over four string fields (`os`, `browser`, `screenRes`, `timezone`). No external library is warranted — the function is four comparisons returning a 0.0–1.0 float stored on the `DetectionEvent` model. This score is the primary input Claude will use in Phase 5; a low score (high dissimilarity) is strong evidence of hijack, while a high score (same device, different browser profile) may indicate false positive.

**Primary recommendation:** Add a `DetectionEvent` model to `schema.prisma`, run `prisma db push && prisma generate`, then extend the existing route handler with a `$transaction` block that (1) reads the original fingerprint for the session, (2) compares `visitorId`, (3) runs the similarity function, (4) inserts the detection event on mismatch. Keep all detection logic in a `src/lib/detection.ts` helper file for testability.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma Client | 7.4.2 (already installed) | Schema definition, DB read/write, transaction | Already in project; `$transaction` handles atomic read-write |
| Next.js Route Handlers | 16.1.6 (already installed) | Node.js execution context for detection | Prisma cannot run on Edge; Route Handlers run in Node.js by default |
| TypeScript | 5.x (already installed) | Typed similarity function, type-safe Prisma models | Project standard |
| Zod | 4.3.6 (already installed) | Input validation already wired in route handler | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Built-in `Prisma` namespace | from `@/generated/prisma/client` | `PrismaClientKnownRequestError` for P2002 catch | Catching unique constraint race conditions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure TS similarity function | `ml-distance` or similar npm package | npm package adds 0 value — four string equality comparisons do not need a library |
| `$transaction` block | Separate sequential queries | Sequential queries have TOCTOU race: check then insert can be interleaved by concurrent request |
| `prisma db push` | `prisma migrate dev` | Project has no migrations directory; `db push` matches existing workflow and is safe for PoC/Neon dev |

**Installation:** No new packages required. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   └── api/
│       └── session/
│           └── record/
│               └── route.ts    # Extend existing handler with detection logic
├── lib/
│   ├── auth.ts                 # Unchanged
│   ├── db.ts                   # Unchanged
│   └── detection.ts            # NEW: similarity function + detection helpers
prisma/
└── schema.prisma               # Add DetectionEvent model
```

### Pattern 1: DetectionEvent Schema Model

**What:** A new Prisma model that persists detection events linking two fingerprints to a session.
**When to use:** Created exactly once per mismatch event, never on same-visitorId second requests.

```typescript
// prisma/schema.prisma — add to existing schema

model DetectionEvent {
  id               String      @id @default(cuid())
  createdAt        DateTime    @default(now())
  sessionId        String
  originalVisitorId String
  newVisitorId     String
  originalIp       String?
  newIp            String?
  similarityScore  Float       // 0.0 (completely different) to 1.0 (identical components)
  status           String      @default("PENDING")  // PENDING → updated to FLAGGED/CLEAR by Phase 5
  session          Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
}
```

And add the reverse relation to the existing `Session` model:
```
detectionEvents  DetectionEvent[]
```

**Why `status` field now:** Phase 5 (Claude integration) will UPDATE this row with a confidence score and change status to FLAGGED or CLEAR. Starting as PENDING is the correct Phase 4 anchor state. The dashboard in Phase 6 reads this field directly.

### Pattern 2: Prisma Interactive Transaction for Detection

**What:** Wrap the entire "read original, compare, write event" sequence in a single `$transaction` call.
**When to use:** Any time you need an atomic read-then-write where the write is conditional on the read result.

```typescript
// Source: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
// src/lib/detection.ts

import { prisma } from "@/lib/db"
import { Prisma } from "@/generated/prisma/client"
import { computeSimilarity } from "./detection"

export async function runDetection(params: {
  sessionId: string
  newVisitorId: string
  newIp: string | null
}): Promise<{ detected: boolean; eventId?: string }> {
  const { sessionId, newVisitorId, newIp } = params

  return await prisma.$transaction(async (tx) => {
    // 1. Read the original fingerprint for this session
    const original = await tx.fingerprint.findFirst({
      where: { sessionId, isOriginal: true },
    })

    // No original yet — this IS the first fingerprint (being written by the caller)
    if (!original) return { detected: false }

    // 2. Same visitorId — no hijack, no event
    if (original.visitorId === newVisitorId) return { detected: false }

    // 3. Different visitorId — compute similarity and persist detection event
    const score = computeSimilarity(original, {
      os: params.os,
      browser: params.browser,
      screenRes: params.screenRes,
      timezone: params.timezone,
    })

    const event = await tx.detectionEvent.create({
      data: {
        sessionId,
        originalVisitorId: original.visitorId,
        newVisitorId,
        originalIp: original.ip,
        newIp,
        similarityScore: score,
        status: "PENDING",
      },
    })

    return { detected: true, eventId: event.id }
  })
}
```

### Pattern 3: Weighted Similarity Function

**What:** A pure function comparing four string fields with equal weights (0.25 each). Returns 0.0–1.0.
**When to use:** Called inside the transaction before writing the DetectionEvent.

```typescript
// src/lib/detection.ts

interface FingerprintComponents {
  os?: string | null
  browser?: string | null
  screenRes?: string | null
  timezone?: string | null
}

/**
 * Compute similarity score between two fingerprints.
 * Each of 4 components contributes 0.25 to the score if they match.
 * Returns 1.0 if all match (likely same device), 0.0 if none match (strong hijack signal).
 */
export function computeSimilarity(
  a: FingerprintComponents,
  b: FingerprintComponents
): number {
  const fields: (keyof FingerprintComponents)[] = ["os", "browser", "screenRes", "timezone"]
  const weight = 1 / fields.length

  return fields.reduce((score, field) => {
    const aVal = a[field]?.toLowerCase().trim()
    const bVal = b[field]?.toLowerCase().trim()
    // If both absent, treat as matching (unknown ≠ mismatch)
    if (!aVal && !bVal) return score + weight
    if (!aVal || !bVal) return score  // one side missing = inconclusive = no bonus
    return aVal === bVal ? score + weight : score
  }, 0)
}
```

**Rationale for equal weights:** The requirements say "weights similarity to reduce false positives." Equal weights for the four named components is the simplest implementation that satisfies the requirement. Claude in Phase 5 uses the full context; the similarity score is a pre-filter signal, not a final verdict. Unequal weights introduce subjectivity with no validated basis for a PoC.

### Pattern 4: Integrating Detection into the Existing Route Handler

**What:** Call `runDetection` after the new fingerprint is written, passing the relevant context.
**When to use:** After the `prisma.fingerprint.create()` call succeeds and is NOT a duplicate.

```typescript
// src/app/api/session/record/route.ts — extended section (after fingerprint.create)

// After creating the fingerprint:
const detectionResult = await runDetection({
  sessionId: dbSession.id,
  newVisitorId: data.visitorId,
  newIp: ip,
  os: data.os ?? null,
  browser: data.browser ?? null,
  screenRes: data.screenRes ?? null,
  timezone: data.timezone ?? null,
})

return NextResponse.json({
  status: "ok",
  id: fingerprint.id,
  detected: detectionResult.detected,
  eventId: detectionResult.eventId ?? null,
})
```

**Important:** `runDetection` is called AFTER the fingerprint is created. This means: the original fingerprint (isOriginal=true) was set in Phase 3's `!hasExisting` logic. When the hijacker's fingerprint arrives, `isOriginal` is false, but `runDetection` correctly reads the `isOriginal: true` row for the session and compares visitorIds.

### Anti-Patterns to Avoid

- **Anti-pattern: Running detection outside a transaction.** A check-then-insert sequence without `$transaction` is vulnerable to TOCTOU (time-of-check-time-of-use) races. Under concurrent load, two requests could both pass the "no detection event yet" check and both insert events. Use `$transaction`.
- **Anti-pattern: Querying by `userId` for the original fingerprint.** The detection should scope to `sessionId`, not `userId`. A user with multiple open sessions should have per-session detection, not cross-session contamination. The existing code correctly uses `dbSession.id`.
- **Anti-pattern: Calling `runDetection` on the duplicate path.** The existing route handler returns early if `requestId` already exists (`duplicate` response). Detection must NOT run on duplicates — they are idempotent no-ops.
- **Anti-pattern: Forgetting `prisma generate` after `prisma db push`.** Prisma 7 does NOT auto-generate the client after `db push`. Running `db push` without `generate` means the `DetectionEvent` model will not be typed and imports will fail at runtime.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic read-then-write | Manual lock with in-memory flag or Redis | `prisma.$transaction` | Stateless serverless — in-memory state is lost between requests; transaction is the correct primitive |
| Duplicate detection event guard | Application-level set/cache | `sessionId` index + transaction scope | DB-level uniqueness is the only reliable guard across serverless instances |
| Similarity scoring | Third-party ML package | Pure TypeScript `computeSimilarity` | Four string comparisons need zero library overhead; adding a library here is over-engineering |

**Key insight:** This phase is a straightforward read-then-write with a conditional insert. The entire detection logic is ~50 lines of TypeScript. Resist over-engineering — the complexity in this domain is operational (concurrent requests, edge runtime exclusion) not algorithmic.

---

## Common Pitfalls

### Pitfall 1: Detecting Against Wrong Session

**What goes wrong:** The route handler looks up the session with `findFirst({ where: { userId }, orderBy: { expires: 'desc' } })`. If a user has two active sessions (e.g., forgot to log out on one device before the "attack"), this query may return a different session than the one the hijacker's cookie represents. Detection fires against the wrong session.

**Why it happens:** The `auth()` call in Auth.js v5 with database sessions returns the authenticated user, but the session lookup is by `userId` not by `sessionToken`. The hijacker has a specific session cookie value.

**How to avoid:** This is a known architectural constraint documented in the existing code comment ("Look up the database session by userId — auth() doesn't expose session ID directly"). For a PoC with a single active session per user (the demo scenario), this is acceptable. The detection will still fire; the sessionId may be the "most recent" session rather than the exact one. For Phase 4, do not change the session lookup strategy — it is a Phase 1 decision and changing it would destabilize the existing fingerprint ingest logic.

**Warning signs:** If testing shows detection events appearing on the wrong session in multi-session scenarios — this is expected behavior and is acceptable for the PoC scope.

### Pitfall 2: Forgetting `prisma generate` After Schema Change

**What goes wrong:** After running `prisma db push`, the database has the `DetectionEvent` table, but the TypeScript types don't exist yet. Imports of `DetectionEvent` from `@/generated/prisma/client` fail silently or throw at runtime.

**Why it happens:** Prisma 7 removed the auto-generate behavior. `db push` and `migrate dev` no longer run `prisma generate` automatically.

**How to avoid:** Run both commands in sequence: `npx prisma db push && npx prisma generate`. Then restart the Next.js dev server to pick up the new generated types.

**Warning signs:** TypeScript shows `Property 'detectionEvent' does not exist on type 'PrismaClient'`.

### Pitfall 3: Detection Running Before the First Fingerprint Is Created

**What goes wrong:** If `runDetection` is called before the fingerprint is persisted, `findFirst({ where: { sessionId, isOriginal: true } })` returns `null` and detection always reports `{ detected: false }` — even on the second (hijacker's) request.

**Why it happens:** The first fingerprint is marked `isOriginal: true` by the `!hasExisting` check in the route handler. If detection runs in the same transaction before that write commits, the original won't be found.

**How to avoid:** Call `runDetection` AFTER `prisma.fingerprint.create()` has returned successfully. The fingerprint write happens outside the detection transaction; detection reads the now-committed original.

**Warning signs:** Detection events are never created even when testing with two different browsers.

### Pitfall 4: Race Condition on Very First Fingerprint

**What goes wrong:** Two simultaneous requests for the same session (unlikely but possible if the client fires twice) both find `hasExisting = null`, both set `isOriginal: true`, and both try to write. One succeeds; the other hits a `requestId` UNIQUE constraint (P2002) and fails.

**Why it happens:** The `isOriginal` assignment (`!hasExisting`) and the fingerprint create are not atomic.

**How to avoid:** The existing FP-05 deduplication by `requestId` (already implemented) prevents exact duplicates. The `requestId` is the FingerprintJS Pro-assigned unique ID per fingerprint API call — each browser tab gets a different `requestId`. Two simultaneous requests from the same browser tab share a `requestId`; the second will hit the duplicate path and return early. Two requests from two different browsers have different `requestIds`, and two original-marked records can co-exist (both will have `isOriginal: true`). Detection handles this correctly because it uses `findFirst({ where: { isOriginal: true } })` — it will find one of them.

**Warning signs:** Log `P2002` errors on the first page load.

### Pitfall 5: Edge Runtime Execution

**What goes wrong:** If `route.ts` acquires an `export const runtime = 'edge'` declaration (accidentally added or inherited), Prisma will throw at runtime because the pg adapter is not Edge-compatible.

**Why it happens:** Some Next.js templates default to Edge runtime.

**How to avoid:** Do NOT add `export const runtime = 'edge'` to the route handler. The default (Node.js) runtime is correct and required. Verify by checking no runtime export exists in `src/app/api/session/record/route.ts`.

**Warning signs:** `PrismaClientInitializationError: This request's `prisma` instance is not configured for edge deployment`.

---

## Code Examples

Verified patterns from official sources:

### Prisma $transaction Interactive Pattern

```typescript
// Source: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
const result = await prisma.$transaction(async (tx) => {
  const existing = await tx.fingerprint.findFirst({
    where: { sessionId, isOriginal: true },
  })
  if (!existing || existing.visitorId === newVisitorId) {
    return { detected: false }
  }
  const event = await tx.detectionEvent.create({ data: { /* ... */ } })
  return { detected: true, eventId: event.id }
})
```

### Catching P2002 Unique Constraint Violation

```typescript
// Source: https://www.prisma.io/docs/orm/prisma-client/debugging-and-troubleshooting/handling-exceptions-and-errors
import { Prisma } from "@/generated/prisma/client"

try {
  await prisma.fingerprint.create({ data: { /* ... */ } })
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    // Unique constraint violation — duplicate requestId, treat as no-op
    return NextResponse.json({ status: "duplicate" })
  }
  throw e
}
```

**Note on import path:** In this project, `Prisma` is exported from `@/generated/prisma/client` (confirmed from `src/generated/prisma/client.ts` line 42: `export { Prisma }`). Import as:
```typescript
import { Prisma } from "@/generated/prisma/client"
```

### Schema Addition Pattern (Prisma 7)

```bash
# 1. Edit prisma/schema.prisma — add DetectionEvent model + Session relation
# 2. Push schema to Neon
npx prisma db push
# 3. Regenerate TypeScript client (Prisma 7 no longer auto-generates)
npx prisma generate
# 4. Restart Next.js dev server
```

### Full DetectionEvent Model

```prisma
// Add to prisma/schema.prisma

model DetectionEvent {
  id                String   @id @default(cuid())
  createdAt         DateTime @default(now())
  sessionId         String
  originalVisitorId String
  newVisitorId      String
  originalIp        String?
  newIp             String?
  similarityScore   Float
  status            String   @default("PENDING")
  session           Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
}
```

And update the `Session` model to include the reverse relation:
```prisma
model Session {
  id              String           @id @default(cuid())
  sessionToken    String           @unique
  userId          String
  expires         DateTime
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  fingerprints    Fingerprint[]
  detectionEvents DetectionEvent[] // ADD THIS LINE
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prisma migrate dev` creates migration files | `prisma db push` for PoC without migration history | Project started with `db push` workflow (Phase 1) | New models are added via `db push` + manual `generate`; no migration SQL files |
| `migrate dev` auto-ran `generate` | Must run `generate` explicitly | Prisma 7.0 (Nov 2025) | Two-step command required after schema changes |
| Check-then-insert (two queries) | `$transaction` interactive | Prisma v2.29+ | Atomic read-write possible without raw SQL |

**Deprecated/outdated:**
- `export const runtime = 'edge'` on route handlers that use Prisma: incompatible, must use Node.js runtime.
- `prisma-client-js` generator: replaced by `prisma-client` in Prisma 7 (already using `prisma-client` in this project's schema).

---

## Open Questions

1. **Should detection run in the same transaction as fingerprint creation?**
   - What we know: The fingerprint create and the detection check are currently written as separate operations. Creating them in a single transaction would provide stronger atomicity guarantees.
   - What's unclear: The `isOriginal` flag assignment is interleaved in the current route handler — refactoring to a single transaction would require restructuring. The current Phase 3 design deliberately keeps ingest and detection separate.
   - Recommendation: Keep them separate. Run `runDetection` after `fingerprint.create` succeeds. The detection transaction independently queries `isOriginal: true`, which will be present if Phase 3's ingest already committed. Risk of a missed detection event is negligible in the PoC demo scenario (sequential browser steps, not concurrent load).

2. **What `status` values does the schema need?**
   - What we know: Phase 4 writes `"PENDING"`. Phase 5 (Claude) will update it to `"FLAGGED"` or `"CLEAR"`. Phase 6 dashboard displays all four states: `ACTIVE`, `PENDING`, `FLAGGED`, `CLEAR`.
   - What's unclear: `ACTIVE` is a session state, not a detection event state. The dashboard mixes session states and detection event states in the status badge.
   - Recommendation: For Phase 4, use `String` type with `@default("PENDING")`. Do not introduce an enum now — Phase 5 and 6 will clarify the full state machine. Using a plain string avoids a schema change when Phase 5 adds `FLAGGED`/`CLEAR`.

3. **Should `similarityScore` be stored as Float or Int (0–100)?**
   - What we know: DETECT-02 says "weights similarity." The Phase 5 Claude prompt will receive this value. Claude returns a 0–100 integer confidence score.
   - What's unclear: Whether it's cleaner to store similarity as 0.0–1.0 float or 0–100 integer for consistency with Claude's output format.
   - Recommendation: Store as `Float` (0.0–1.0) in Phase 4. The similarity score and Claude's confidence score are semantically different values — one is a pre-filter signal, the other is a post-analysis verdict. Keep them separate and let Phase 5 store Claude's integer score in a new column (`confidenceScore Int?`).

---

## Sources

### Primary (HIGH confidence)

- [Prisma transactions docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) — interactive `$transaction` API, `maxWait`/`timeout`/`isolationLevel` options, `Promise.all` serial execution caveat
- [Prisma error handling docs](https://www.prisma.io/docs/orm/prisma-client/debugging-and-troubleshooting/handling-exceptions-and-errors) — `PrismaClientKnownRequestError` instanceof pattern, P2002 code
- [Prisma 7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7) — `generate` no longer auto-runs after `db push`/`migrate dev`
- Project source files: `prisma/schema.prisma`, `src/app/api/session/record/route.ts`, `src/lib/db.ts`, `src/lib/auth.ts`, `src/components/FingerprintReporter.tsx` — direct inspection of existing implementation

### Secondary (MEDIUM confidence)

- [Prisma db push docs](https://docs.prisma.io/docs/cli/db/push) — confirmed `db push` does not create migration files, appropriate for PoC prototyping
- [OWASP Session Hijacking Testing](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/09-Testing_for_Session_Hijacking) — confirms visitorId/user-agent mismatch detection is a standard pattern

### Tertiary (LOW confidence)

- WebSearch findings on weighted Jaccard similarity for browser fingerprints — concept is sound but not verified against an authoritative fingerprinting-specific source; the custom `computeSimilarity` implementation is a straightforward application of the weighted average concept.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed; Prisma transaction API verified against official docs
- Architecture: HIGH — detection pattern directly derived from existing route handler structure; `$transaction` pattern verified
- Schema design: HIGH — model fields directly map to DETECT-03 success criteria; status field design verified against Phase 5 requirements
- Similarity function: MEDIUM — equal-weight approach is reasonable for PoC but weights are not validated against empirical fingerprint data
- Pitfalls: HIGH — concurrent request pitfalls verified via Prisma docs and GitHub issues; Prisma 7 `generate` requirement verified

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (Prisma 7 is stable; Next.js 16 is stable)
