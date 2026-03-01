# Plan 04-01 Summary: DetectionEvent Model & Detection Library

## What was built

### Schema changes (prisma/schema.prisma)
- Added `detectionEvents DetectionEvent[]` reverse relation to existing `Session` model
- Added new `DetectionEvent` model with 10 fields: id, createdAt, sessionId, originalVisitorId, newVisitorId, originalIp, newIp, similarityScore, status, session relation
- `@@index([sessionId])` for efficient session-scoped queries
- `prisma db push` succeeded — table exists in Neon
- `prisma generate` succeeded — PrismaClient has typed `detectionEvent` accessor

### New file: src/lib/detection.ts
Exports:
- `computeSimilarity(a: FingerprintComponents, b: FingerprintComponents): number` — pure function, no DB access. Equal-weight (0.25 each) comparison of os, browser, screenRes, timezone. Both-null = match, one-null = inconclusive.
- `runDetection(params: DetectionInput): Promise<DetectionResult>` — async, wraps read + conditional insert in `prisma.$transaction`. Returns `{ detected: false }` when no original or same visitorId; returns `{ detected: true, eventId }` on mismatch.

## Key decisions
- Equal-weight similarity (each of 4 components = 0.25)
- `similarityScore` as Float (0.0–1.0), not Int
- `status` as String with default "PENDING", not Prisma enum (flexibility for future states)
- Both-null treated as match (unknown != mismatch); one-side-null = inconclusive (no bonus)

## Deviations from plan
None — implemented exactly as specified.
