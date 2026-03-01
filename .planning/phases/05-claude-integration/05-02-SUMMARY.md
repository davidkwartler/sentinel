# Plan 05-02 Summary: Route Handler after() Dispatch

**Completed:** 2026-02-28
**Status:** Done (code wired; human verification pending)

## What Was Done

### Route Handler Changes (src/app/api/session/record/route.ts)
- Added imports: `after` from `next/server`, `analyzeDetectionEvent` from `@/lib/claude`
- Added `after()` block between `runDetection()` result and return statement
- `eventId` captured as local const before async boundary (closure pitfall prevention)
- `after()` callback wraps `analyzeDetectionEvent()` in try/catch — logs errors, leaves status as PENDING on failure
- Only triggered when `detectionResult.detected && detectionResult.eventId`

## Diff Applied
```diff
- import { NextRequest, NextResponse } from "next/server"
+ import { NextRequest, NextResponse, after } from "next/server"
  import { auth } from "@/lib/auth"
  import { prisma } from "@/lib/db"
  import { z } from "zod"
  import { runDetection } from "@/lib/detection"
+ import { analyzeDetectionEvent } from "@/lib/claude"

  // ... existing handler code ...

+   if (detectionResult.detected && detectionResult.eventId) {
+     const eventId = detectionResult.eventId
+     after(async () => {
+       try {
+         await analyzeDetectionEvent(eventId)
+       } catch (err) {
+         console.error("[claude] analyzeDetectionEvent failed for event", eventId, err)
+       }
+     })
+   }

    return NextResponse.json({ ... })
```

## Verification
- `npx tsc --noEmit` — zero errors
- `after()` present in route handler
- `analyzeDetectionEvent` imported and called
- Human hijack simulation verification: pending user test
