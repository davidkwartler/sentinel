import { NextRequest, NextResponse, after } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { runDetection } from "@/lib/detection"
import { analyzeDetectionEvent } from "@/lib/claude"
import {
  ANALYSIS_MODEL_IDS,
  ANALYSIS_OFF,
  KNOWN_BROWSERS,
  KNOWN_OS,
  MAX_FLAG_THRESHOLD,
  MIN_FLAG_THRESHOLD,
  SCREEN_RES_PATTERN,
} from "@/lib/settings"
import { resolveFingerprint } from "@/lib/fingerprint-server"

const KNOWN_OS_SET = new Set<string>(KNOWN_OS)
const KNOWN_BROWSER_SET = new Set<string>(KNOWN_BROWSERS)
// Built once at module scope, not per request — Intl.supportedValuesOf reads
// the ICU timezone database, which doesn't change between requests.
const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"))

// Length caps double as prompt-injection hardening: these values are
// interpolated into the Claude analysis prompt, so keep them short and
// data-shaped. modelOverride is restricted to the known model allowlist so a
// crafted request can't select an arbitrary (or expensive) model.
//
// Deliberately no `mode` field: whether a requestId is verifiable is decided
// server-side in resolveFingerprint() from the requestId's own shape, not from
// a client-supplied claim — a client asking to skip verification is the one
// case verification exists to catch. z.object strips unknown keys, so a client
// still sending `mode` keeps working; it's read off the raw body below, for
// logging only.
const fingerprintSchema = z.object({
  visitorId: z.string().min(1).max(128),
  requestId: z.string().min(1).max(128),
  os: z.string().max(64).optional(),
  browser: z.string().max(64).optional(),
  screenRes: z.string().max(32).optional(),
  timezone: z.string().max(64).optional(),
  modelOverride: z.enum(ANALYSIS_MODEL_IDS).optional(),
  thresholdOverride: z
    .number()
    .int()
    .min(MIN_FLAG_THRESHOLD)
    .max(MAX_FLAG_THRESHOLD)
    .optional(),
})

// Each mismatched fingerprint triggers a Claude call, so an authenticated
// script looping on this endpoint is a direct cost lever. Cap ingest per
// session per hour.
const MAX_FINGERPRINTS_PER_HOUR = 30

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Resolve the DB session by the exact cookie presented on THIS request, not by
  // userId. A user can hold several legitimate sessions (laptop + phone); keying
  // off the cookie ties each fingerprint to the session it actually rode in on —
  // which is the whole premise of detecting one cookie on two devices.
  const sessionToken = request.cookies.get("auth_session")?.value
  const dbSession = sessionToken
    ? await prisma.session.findUnique({ where: { sessionToken } })
    : null

  if (!dbSession || dbSession.userId !== session.user.id) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  const body = await request.json()
  const parsed = fingerprintSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const data = parsed.data

  // Ask Fingerprint's server API what it actually observed for this requestId,
  // and prefer that over anything the client told us about itself. The client
  // does not get a say in whether this happens — resolveFingerprint classifies
  // from the requestId's own shape, not from a client-supplied mode flag.
  const { verification, verified } = await resolveFingerprint(data.requestId, data)

  if (verified?.clientMismatch) {
    console.warn(
      "[fingerprint] client-reported components disagree with server for",
      data.requestId,
    )
  }

  // Logging only: a client claiming "pro" on a requestId we classified as
  // unverifiable (UUID-shaped) is misreporting its own capture path.
  const clientClaimedMode =
    typeof body === "object" && body !== null && "mode" in body
      ? (body as { mode?: unknown }).mode
      : undefined
  if (clientClaimedMode === "pro" && verification === "unverifiable") {
    console.warn(
      "[fingerprint] client claims pro mode but requestId is UUID-shaped for",
      data.requestId,
    )
  }

  const visitorId = verified?.visitorId ?? data.visitorId
  const signals = verified?.signals ?? null

  const ip =
    verified?.ip ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  const userAgent = verified?.userAgent ?? request.headers.get("user-agent") ?? null

  // Shape validation, not just the length caps on fingerprintSchema above — a
  // value failing its check is itself evidence (a client sending "Ignore
  // previous instructions" as a screen resolution is already misbehaving), so
  // it's normalized away rather than causing a 400 that would throw the
  // signal out along with the request. Server-verified os/browser skip this:
  // they're Fingerprint's own observation, not attacker-controlled, so only
  // the client-reported fallback needs the check.
  let shapeAnomaly = false

  const rawScreenRes = data.screenRes ?? null
  const screenRes =
    rawScreenRes !== null && SCREEN_RES_PATTERN.test(rawScreenRes) ? rawScreenRes : null
  if (rawScreenRes !== null && screenRes === null) shapeAnomaly = true

  const rawTimezone = data.timezone ?? null
  const timezone =
    rawTimezone !== null && VALID_TIMEZONES.has(rawTimezone) ? rawTimezone : null
  if (rawTimezone !== null && timezone === null) shapeAnomaly = true

  let os = verified?.os ?? null
  if (!verified?.os && data.os) {
    os = KNOWN_OS_SET.has(data.os) ? data.os : "Unknown"
    if (!KNOWN_OS_SET.has(data.os)) shapeAnomaly = true
  }

  let browser = verified?.browser ?? null
  if (!verified?.browser && data.browser) {
    browser = KNOWN_BROWSER_SET.has(data.browser) ? data.browser : "Unknown"
    if (!KNOWN_BROWSER_SET.has(data.browser)) shapeAnomaly = true
  }

  // Dedupe check, isOriginal decision, insert, and detection all commit atomically.
  // Serializable isolation prevents two concurrent first-loads (React strict mode,
  // prefetch) from both reading "no fingerprints yet" and both inserting
  // isOriginal=true; the loser gets a serialization conflict (P2034) and retries.
  type RecordOutcome =
    | { kind: "duplicate"; id: string }
    | { kind: "rate_limited" }
    | {
        kind: "created"
        id: string
        detected: boolean
        eventId?: string
        downgraded?: boolean
      }

  let outcome: RecordOutcome | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      outcome = await prisma.$transaction(
        async (tx): Promise<RecordOutcome> => {
          const existing = await tx.fingerprint.findUnique({
            where: { requestId: data.requestId },
          })
          if (existing) return { kind: "duplicate", id: existing.id }

          const recentCount = await tx.fingerprint.count({
            where: {
              sessionId: dbSession.id,
              createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
            },
          })
          if (recentCount >= MAX_FINGERPRINTS_PER_HOUR) {
            return { kind: "rate_limited" }
          }

          const hasExisting = await tx.fingerprint.findFirst({
            where: { sessionId: dbSession.id },
            select: { id: true },
          })

          const fingerprint = await tx.fingerprint.create({
            data: {
              sessionId: dbSession.id,
              userId: dbSession.userId,
              visitorId,
              requestId: data.requestId,
              ip,
              userAgent,
              os,
              browser,
              screenRes,
              timezone,
              verification,
              isOriginal: !hasExisting,
            },
          })

          const detection = await runDetection(tx, {
            sessionId: dbSession.id,
            userId: dbSession.userId,
            newVisitorId: visitorId,
            newIp: ip,
            newUserAgent: userAgent,
            os,
            browser,
            screenRes,
            timezone,
            verification,
          })

          return { kind: "created", id: fingerprint.id, ...detection }
        },
        { isolationLevel: "Serializable" },
      )
      break
    } catch (err) {
      const isSerializationConflict =
        typeof err === "object" && err !== null && "code" in err && err.code === "P2034"
      if (!isSerializationConflict || attempt === 2) throw err
    }
  }

  if (outcome!.kind === "duplicate") {
    return NextResponse.json({ status: "duplicate", id: outcome!.id })
  }

  if (outcome!.kind === "rate_limited") {
    return NextResponse.json({ error: "Too many fingerprints" }, { status: 429 })
  }

  const detectionResult = outcome! as Extract<RecordOutcome, { kind: "created" }>

  if (detectionResult.detected && detectionResult.eventId) {
    const eventId = detectionResult.eventId
    // signals is null whenever verification did not resolve — exactly the
    // downgrade case — so a plain `signals ?? undefined` would drop the flag
    // before it reaches the prompt. Construct a signals-shaped object with
    // null fields when that's the only thing worth reporting. shapeAnomaly
    // travels the same way.
    const signalsForAnalysis =
      signals || detectionResult.downgraded || shapeAnomaly
        ? {
            incognito: signals?.incognito ?? null,
            vpn: signals?.vpn ?? null,
            bot: signals?.bot ?? null,
            tampered: signals?.tampered ?? null,
            replayed: signals?.replayed ?? null,
            confidence: signals?.confidence ?? null,
            stale: signals?.stale ?? false,
            downgraded: detectionResult.downgraded ?? null,
            shapeAnomaly,
          }
        : undefined
    after(async () => {
      try {
        const allowModelOverride =
          process.env.NEXT_PUBLIC_MODEL_PICKER_ENABLED === "true"
        const modelOverride = allowModelOverride ? data.modelOverride : undefined

        // The session being monitored should not set the sensitivity of the
        // monitor — gated the same way as the model picker, behind its own
        // flag so toggling one for a demo doesn't drag the other along.
        const allowThresholdOverride =
          process.env.NEXT_PUBLIC_THRESHOLD_PICKER_ENABLED === "true"
        const thresholdOverride = allowThresholdOverride
          ? data.thresholdOverride
          : undefined

        // Analysis "off": skip Claude and flag on fingerprint mismatch alone —
        // this event only exists because the visitor ID diverged.
        if (modelOverride === ANALYSIS_OFF) {
          await prisma.detectionEvent.update({
            where: { id: eventId },
            data: {
              status: "FLAGGED",
              reasoning:
                "GenAI analysis disabled — flagged on fingerprint mismatch alone.",
            },
          })
          return
        }

        await analyzeDetectionEvent(
          eventId,
          modelOverride,
          thresholdOverride,
          signalsForAnalysis,
        )
      } catch (err) {
        // Fail closed: a broken analysis pipeline must not let a suspicious
        // session pass silently, so flag it rather than leaving it PENDING.
        console.error("[claude] analyzeDetectionEvent failed for event", eventId, err)
        await prisma.detectionEvent.update({
          where: { id: eventId },
          data: {
            status: "FLAGGED",
            reasoning: "AI analysis unavailable — flagged automatically due to fingerprint mismatch.",
          },
        })
      }
    })
  }

  return NextResponse.json({
    status: "ok",
    id: detectionResult.id,
    detected: detectionResult.detected,
    eventId: detectionResult.eventId ?? null,
  })
}
