# Phase 5: Claude Integration - Research

**Researched:** 2026-02-28
**Domain:** Anthropic SDK, async background tasks in Next.js Route Handlers, Prisma schema migration
**Confidence:** HIGH

---

## Summary

Phase 5 wires Claude into the detection pipeline. When `runDetection()` returns `{ detected: true, eventId }`, the Route Handler must immediately return a PENDING response to the caller — then, out-of-band, call the Anthropic API and update the `DetectionEvent` row with a `confidenceScore` and `reasoning` string. The schema does not yet contain those two columns; a Prisma migration is required first.

The async dispatch mechanism is `after()` from `next/server`, which became stable in Next.js 15.1.0 (this project runs Next.js 16.1.6 — fully supported). `after()` integrates with Vercel's `waitUntil` primitive automatically, meaning the Claude API call will be allowed to finish after the HTTP response is sent without any additional infrastructure. The Anthropic TypeScript SDK (`@anthropic-ai/sdk`, currently v0.78.0) provides a straightforward `client.messages.create()` call; structured JSON output is now GA via the `output_config.format` parameter, making the confidence score and reasoning reliable without manual JSON parsing.

The model is made configurable at zero cost: read `process.env.ANTHROPIC_MODEL` and fall back to a sensible default. No code changes are needed to swap models, satisfying AI-03.

**Primary recommendation:** Use `next/server` `after()` + `@anthropic-ai/sdk` messages.create with `output_config.format` (structured outputs GA). Add `confidenceScore Float?` and `reasoning String?` columns to `DetectionEvent` via Prisma migration; update status to FLAGGED or CLEAR after Claude responds.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AI-01 | Fingerprint mismatch triggers an async Claude API call — HTTP response returns immediately with PENDING state; analysis completes out-of-band | `after()` from `next/server` is the correct pattern; it runs after the response is sent, backed by Vercel's `waitUntil`. The ingest route already returns `{ detected, eventId }` — we just need to add `after()` wrapping the Claude call before the return statement |
| AI-02 | Claude returns structured JSON with a confidence score (0–100) and a human-readable reasoning string | Anthropic structured outputs are GA: `output_config.format.type = "json_schema"` guarantees schema-compliant JSON. No beta header needed (previously `structured-outputs-2025-11-13`). The schema is trivial: `{ confidenceScore: integer, reasoning: string }` |
| AI-03 | Claude model configurable via `ANTHROPIC_MODEL` environment variable — no code changes required | Pass `model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"` to `messages.create()`. Anthropic SDK accepts any string for model, so new model IDs work without rebuilding |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.78.0 | Official Anthropic TypeScript client — `messages.create()` | First-party; full TypeScript types, auto-retry, error classes |
| `next/server` `after()` | built-in (Next.js 16.1.6) | Schedule async work after HTTP response is sent | Stable as of 15.1.0; integrates automatically with Vercel `waitUntil`; no extra packages needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prisma Migrate | ^7.4.2 (already installed) | Add `confidenceScore` and `reasoning` columns to `DetectionEvent` | Required — schema needs two new nullable columns |
| `zod` | ^4.3.6 (already installed) | Parse and validate Claude's JSON response as a second safety net | Optional but already in project; use if structured outputs aren't 100% trusted in early iteration |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `after()` | Fire-and-forget `Promise` (no await) | Unreliable on Vercel — serverless function may terminate before the promise resolves; `after()` is the correct primitive |
| `after()` | Vercel Queue / Upstash Workflow | Overkill for this PoC — Claude calls are fast (<5s); no retry/durability requirement stated |
| Structured outputs (`output_config.format`) | Prompt engineering + `JSON.parse()` | Structured outputs are GA and guarantee schema compliance; manual parsing can fail silently |
| Direct `process.env.ANTHROPIC_MODEL` read | Hardcoded model string | Violates AI-03; env var is the stated requirement |

**Installation:**
```bash
npm install @anthropic-ai/sdk
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── claude.ts          # Anthropic client singleton + analyzeDetectionEvent() function
│   ├── detection.ts       # Already exists — runDetection() unchanged
│   └── db.ts              # Already exists — prisma singleton
├── app/
│   └── api/
│       └── session/
│           └── record/
│               └── route.ts   # Add after() call here — already has runDetection()
prisma/
└── schema.prisma          # Add confidenceScore Float? and reasoning String? to DetectionEvent
```

### Pattern 1: Anthropic Client Singleton

**What:** Create a single `Anthropic` instance in `src/lib/claude.ts`, mirroring the Prisma singleton pattern already used in `src/lib/db.ts`.
**When to use:** Always — prevents instantiating a new HTTP client per request.
**Example:**
```typescript
// Source: https://github.com/anthropics/anthropic-sdk-typescript
// src/lib/claude.ts
import Anthropic from "@anthropic-ai/sdk"

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})
```

### Pattern 2: Structured Output Call

**What:** Use `output_config.format` with `type: "json_schema"` to get guaranteed-valid JSON from Claude.
**When to use:** Whenever the response must be machine-parsed — eliminates retry logic.
**Example:**
```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
// src/lib/claude.ts
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"

const response = await anthropic.messages.create({
  model,
  max_tokens: 512,
  system: `You are a security analysis system. Analyze fingerprint mismatch events and return a JSON confidence score.`,
  messages: [
    {
      role: "user",
      content: buildAnalysisPrompt(event),
    },
  ],
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          confidenceScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "0 = definitely not a hijack, 100 = definitely a hijack",
          },
          reasoning: {
            type: "string",
            description: "Human-readable explanation of the confidence score",
          },
        },
        required: ["confidenceScore", "reasoning"],
        additionalProperties: false,
      },
    },
  },
})

const result = JSON.parse(response.content[0].text) as {
  confidenceScore: number
  reasoning: string
}
```

### Pattern 3: after() in Route Handler

**What:** Call `after()` from `next/server` before returning the response. The callback runs after the HTTP response is flushed.
**When to use:** Any background work that should not block the client — exactly what AI-01 requires.
**Example:**
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/after
// src/app/api/session/record/route.ts
import { after } from "next/server"
import { analyzeDetectionEvent } from "@/lib/claude"

// Inside POST handler, after runDetection():
if (detectionResult.detected && detectionResult.eventId) {
  const eventId = detectionResult.eventId  // capture before async boundary
  after(async () => {
    await analyzeDetectionEvent(eventId)
  })
}

return NextResponse.json({
  status: "ok",
  id: fingerprint.id,
  detected: detectionResult.detected,
  eventId: detectionResult.eventId ?? null,
})
```

### Pattern 4: Post-Analysis DB Update

**What:** After Claude returns, update the `DetectionEvent` row with score, reasoning, and a terminal status.
**When to use:** Inside the `analyzeDetectionEvent()` function, after parsing Claude's response.
**Example:**
```typescript
// src/lib/claude.ts
await prisma.detectionEvent.update({
  where: { id: eventId },
  data: {
    confidenceScore: result.confidenceScore,
    reasoning: result.reasoning,
    status: result.confidenceScore >= 70 ? "FLAGGED" : "CLEAR",
  },
})
```

### Pattern 5: Prisma Schema Migration

**What:** Add two nullable columns to `DetectionEvent` so existing PENDING rows (no Claude analysis yet) don't violate NOT NULL constraints.
**Example (schema.prisma addition):**
```prisma
model DetectionEvent {
  // ... existing fields ...
  confidenceScore   Float?   // null until Claude responds
  reasoning         String?  // null until Claude responds
}
```
**Migration command:**
```bash
npx prisma migrate dev --name add-claude-fields-to-detection-event
npx prisma generate
```

### Anti-Patterns to Avoid

- **Fire-and-forget without `after()`:** Calling `claudeAnalysis().catch(console.error)` without `after()` will silently drop the work when the Vercel function terminates. Use `after()` always.
- **Blocking the response on Claude:** Awaiting the Claude call before returning the response violates AI-01 and creates latency of 2–10 seconds on the hot path.
- **Hardcoded model string:** Using `"claude-sonnet-4-6"` as a literal instead of reading `ANTHROPIC_MODEL` env var violates AI-03.
- **No null guard in `after()`:** The `eventId` variable must be captured before the `after()` callback due to closure scoping — this is already shown in Pattern 3.
- **Using old beta header for structured outputs:** The `anthropic-beta: structured-outputs-2025-11-13` header is now unnecessary; `output_config.format` is GA. Using the beta header may still work during transition but is not the current API shape.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema enforcement on Claude response | Manual regex / string parsing | `output_config.format` structured outputs | Constrained decoding guarantees valid JSON — no retries needed |
| Background task after HTTP response | Custom Node.js `setTimeout` or untracked Promise | `after()` from `next/server` | `after()` hooks into Vercel `waitUntil` — the serverless function lifetime is extended until the callback settles |
| Anthropic client setup | Custom `fetch` to `api.anthropic.com` | `@anthropic-ai/sdk` | Handles auth, retries, error types, TypeScript types, streaming |
| Model configurability | Feature flags, config files | `process.env.ANTHROPIC_MODEL` read directly in `messages.create()` | Simplest possible: env var swap, no deploy needed |

**Key insight:** The `after()` + structured outputs combination means zero custom infrastructure for this phase — no queues, no workers, no retry loops.

---

## Common Pitfalls

### Pitfall 1: after() Callback Captures Stale Closure

**What goes wrong:** The `eventId` is read inside `after()` after the outer function has returned, but if it's part of a destructured object that gets mutated, the value may be wrong.
**Why it happens:** `after()` callbacks run asynchronously; closures capture references, not values for objects.
**How to avoid:** Capture primitive values (strings, numbers) into local variables before passing them into the `after()` callback, as shown in Pattern 3.
**Warning signs:** `eventId` is undefined or null inside the Claude call even though `detectionResult.detected` is true.

### Pitfall 2: Claude API Call Timeout vs. Vercel Function Duration

**What goes wrong:** Claude calls typically complete in 1–5 seconds, but Vercel Hobby plan has a 10-second function timeout (Pro plan: 15s default, configurable up to 300s).
**Why it happens:** `after()` extends the function lifetime, but only up to the configured `maxDuration`. If Claude takes longer than `maxDuration - response_time`, the background work is cut off.
**How to avoid:** Set `maxDuration` in the route segment config if needed. For the default Claude Sonnet model, 5–10 second completion is typical. The Vercel Pro plan's 15-second default should be sufficient. Set `max_tokens: 512` to keep Claude responses fast.
**Warning signs:** `DetectionEvent` rows stay in PENDING status permanently.

### Pitfall 3: Structured Output Schema Mismatch

**What goes wrong:** `JSON.parse(response.content[0].text)` throws if the structured output response is not `text` type.
**Why it happens:** Structured output responses come back as `content[0].type === "text"` with the JSON in `.text`. However, if the model is changed to one that doesn't support structured outputs, the response format may differ.
**How to avoid:** Guard with `if (response.content[0].type !== "text") throw new Error(...)`. Use `zod` to parse if defensive validation is desired.
**Warning signs:** TypeScript errors or runtime crashes when accessing `response.content[0].text`.

### Pitfall 4: DetectionEvent Schema Without Nullable Columns

**What goes wrong:** If `confidenceScore` and `reasoning` are added as `Float` and `String` (NOT NULL) in Prisma, existing PENDING rows without those values will cause migration failures or runtime errors.
**Why it happens:** `prisma migrate dev` will add NOT NULL columns to existing rows, which require a default value or backfill.
**How to avoid:** Always add new columns as nullable (`Float?`, `String?`) when the data will be populated asynchronously.
**Warning signs:** Migration output shows `Column 'confidenceScore' of relation 'DetectionEvent' does not match schema — expected Float, got NULL`.

### Pitfall 5: ANTHROPIC_API_KEY Not Set in after() Context

**What goes wrong:** The Anthropic SDK cannot authenticate — the call silently fails or throws inside the `after()` callback.
**Why it happens:** The ANTHROPIC_API_KEY is already confirmed in `.env.local` and Vercel (from Phase 3 setup). If the key is missing in a preview deployment or test environment, the background call will fail.
**How to avoid:** The key is already set per STATE.md ("ANTHROPIC_API_KEY stored in .env.local and Vercel (Production + Development)"). Confirm it's also set in Vercel Preview if needed.
**Warning signs:** `Anthropic API error: 401 Unauthorized` in function logs.

---

## Code Examples

Verified patterns from official sources:

### Anthropic Client + Structured Output Call
```typescript
// Source: https://github.com/anthropics/anthropic-sdk-typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function analyzeDetectionEvent(eventId: string): Promise<void> {
  const event = await prisma.detectionEvent.findUnique({ where: { id: eventId } })
  if (!event) return

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"

  const response = await anthropic.messages.create({
    model,
    max_tokens: 512,
    system:
      "You are a security analysis system. Given two browser fingerprints from the same session, " +
      "determine the likelihood that the second access is a session hijack attempt. " +
      "Return a confidence score from 0 (definitely legitimate) to 100 (definitely a hijack).",
    messages: [
      {
        role: "user",
        content:
          `Session ID: ${event.sessionId}\n` +
          `Original visitor ID: ${event.originalVisitorId} (IP: ${event.originalIp ?? "unknown"})\n` +
          `New visitor ID: ${event.newVisitorId} (IP: ${event.newIp ?? "unknown"})\n` +
          `Component similarity score: ${event.similarityScore.toFixed(2)} (0=different, 1=identical)\n\n` +
          "Analyze whether this represents a session hijack.",
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            confidenceScore: {
              type: "integer",
              minimum: 0,
              maximum: 100,
            },
            reasoning: {
              type: "string",
            },
          },
          required: ["confidenceScore", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  })

  if (response.content[0].type !== "text") {
    throw new Error("Unexpected Claude response type")
  }

  const result = JSON.parse(response.content[0].text) as {
    confidenceScore: number
    reasoning: string
  }

  await prisma.detectionEvent.update({
    where: { id: eventId },
    data: {
      confidenceScore: result.confidenceScore,
      reasoning: result.reasoning,
      status: result.confidenceScore >= 70 ? "FLAGGED" : "CLEAR",
    },
  })
}
```

### after() Integration in Route Handler
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/after
import { after } from "next/server"
import { analyzeDetectionEvent } from "@/lib/claude"

// Inside POST handler, after runDetection():
if (detectionResult.detected && detectionResult.eventId) {
  const eventId = detectionResult.eventId
  after(async () => {
    await analyzeDetectionEvent(eventId)
  })
}

return NextResponse.json({
  status: "ok",
  id: fingerprint.id,
  detected: detectionResult.detected,
  eventId: detectionResult.eventId ?? null,
})
```

### Prisma Schema Addition
```prisma
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
  confidenceScore   Float?   // populated after Claude responds
  reasoning         String?  @db.Text  // populated after Claude responds
  session           Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `unstable_after()` (experimental) | `after()` stable | Next.js 15.1.0 (Dec 2024) | Safe to use in production; no experimental flag needed |
| `anthropic-beta: structured-outputs-2025-11-13` header | `output_config.format` GA (no beta header) | Nov 2025 → GA Feb 2026 | Old header still works in transition, but new `output_config` shape is the current API |
| `output_format` parameter (old beta shape) | `output_config.format` | API change in GA release | Old parameter still works temporarily; use new shape |
| Manual `JSON.parse()` with `response_format: {type: "json"}` prompt engineering | `output_config.format.type: "json_schema"` | Nov 2025 | Constrained decoding replaces prompt-based JSON enforcement |

**Deprecated/outdated:**
- Beta header `anthropic-beta: structured-outputs-2025-11-13`: No longer required; `output_config.format` is GA.
- `context.waitUntil` in Route Handlers: Only available in Edge runtime; `after()` is the universal solution for both Node.js and Edge.

---

## Open Questions

1. **Status thresholds for FLAGGED vs CLEAR**
   - What we know: Phase 6 (Dashboard) has `DASH-02` requiring visual flagging above a configurable threshold
   - What's unclear: The exact threshold value (70? 80?) isn't specified in requirements
   - Recommendation: Hardcode `>= 70` as FLAGGED for Phase 5; Phase 6 can make this configurable via env var or database config

2. **Error handling: what status if Claude call fails inside after()?**
   - What we know: `RES-01` (graceful degradation to UNKNOWN state) is listed as v2 / deferred
   - What's unclear: Whether Phase 5 should at minimum catch errors and leave status as PENDING, or silently fail
   - Recommendation: Wrap the Claude call in try/catch inside `after()`; on error, leave `status` as PENDING and log to console. No v2 UNKNOWN state needed yet.

3. **Prisma `@db.Text` directive for reasoning field**
   - What we know: PostgreSQL `text` type is appropriate for potentially long reasoning strings; Prisma uses `String` by default which maps to `varchar(191)` in some adapters
   - What's unclear: Whether the `@prisma/adapter-pg` (already in use) enforces varchar limits
   - Recommendation: Add `@db.Text` to the `reasoning` field in schema to ensure there's no truncation on long Claude outputs.

---

## Validation Architecture

> Skipped — `workflow.nyquist_validation` is `false` in `.planning/config.json`.

---

## Sources

### Primary (HIGH confidence)
- [Next.js `after()` official docs](https://nextjs.org/docs/app/api-reference/functions/after) — confirmed stable in 15.1.0; Node.js server and Vercel supported; Route Handler usage verified
- [Anthropic structured outputs official docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — confirmed GA; `output_config.format` API shape; supported models; no beta header needed
- [anthropic-sdk-typescript GitHub](https://github.com/anthropics/anthropic-sdk-typescript) — `messages.create()` TypeScript API; `Anthropic` client instantiation pattern
- Existing codebase: `src/lib/detection.ts`, `src/app/api/session/record/route.ts`, `prisma/schema.prisma` — confirmed current DetectionEvent model and ingest route structure

### Secondary (MEDIUM confidence)
- npm `@anthropic-ai/sdk` v0.78.0 — latest version confirmed via WebSearch (8 days ago as of research date)
- [Vercel function duration docs](https://vercel.com/docs/functions/configuring-functions/duration) — Pro plan 15s default, 300s max; `after()` runs within that window

### Tertiary (LOW confidence)
- Specific Claude Sonnet 4.x completion time of 1–5 seconds — from general knowledge; validate empirically during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `after()` and `@anthropic-ai/sdk` are first-party, documented, and version-verified
- Architecture: HIGH — patterns are directly derived from official docs and existing codebase structure
- Pitfalls: HIGH — drawn from official docs (nullable columns, `after()` caveats) with MEDIUM for timing (empirical)

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable APIs; check if Anthropic promotes `output_config` to non-beta if it matters)
