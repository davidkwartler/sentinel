import { NextRequest, NextResponse, after } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { runDetection } from "@/lib/detection"
import { analyzeDetectionEvent } from "@/lib/claude"
import {
  ANALYSIS_MODEL_IDS,
  ANALYSIS_OFF,
  MAX_FLAG_THRESHOLD,
  MIN_FLAG_THRESHOLD,
} from "@/lib/settings"
import { verifyFingerprint } from "@/lib/fingerprint-server"

// Length caps double as prompt-injection hardening: these values are
// interpolated into the Claude analysis prompt, so keep them short and
// data-shaped. modelOverride is restricted to the known model allowlist so a
// crafted request can't select an arbitrary (or expensive) model.
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
  // Only Pro requestIds are resolvable against Fingerprint's server API; OSS
  // mode generates a local UUID, so verification is skipped for it.
  mode: z.enum(["pro", "oss"]).optional(),
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
  // and prefer that over anything the client told us about itself. Returns null
  // when no server key is configured or the lookup fails, in which case we fall
  // back to the client-reported values.
  const verified =
    data.mode === "oss" ? null : await verifyFingerprint(data.requestId, data)

  if (verified?.clientMismatch) {
    console.warn(
      "[fingerprint] client-reported components disagree with server for",
      data.requestId,
    )
  }

  const visitorId = verified?.visitorId ?? data.visitorId
  const os = verified?.os ?? data.os ?? null
  const browser = verified?.browser ?? data.browser ?? null
  const signals = verified?.signals ?? null

  const ip =
    verified?.ip ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  const userAgent = verified?.userAgent ?? request.headers.get("user-agent") ?? null

  // Dedupe check, isOriginal decision, insert, and detection all commit atomically.
  // Serializable isolation prevents two concurrent first-loads (React strict mode,
  // prefetch) from both reading "no fingerprints yet" and both inserting
  // isOriginal=true; the loser gets a serialization conflict (P2034) and retries.
  type RecordOutcome =
    | { kind: "duplicate"; id: string }
    | { kind: "rate_limited" }
    | { kind: "created"; id: string; detected: boolean; eventId?: string }

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
              visitorId,
              requestId: data.requestId,
              ip,
              userAgent,
              os,
              browser,
              screenRes: data.screenRes ?? null,
              timezone: data.timezone ?? null,
              isOriginal: !hasExisting,
            },
          })

          const detection = await runDetection(tx, {
            sessionId: dbSession.id,
            newVisitorId: visitorId,
            newIp: ip,
            os,
            browser,
            screenRes: data.screenRes ?? null,
            timezone: data.timezone ?? null,
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
    after(async () => {
      try {
        const allowModelOverride =
          process.env.NEXT_PUBLIC_MODEL_PICKER_ENABLED === "true"
        const modelOverride = allowModelOverride ? data.modelOverride : undefined

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
          data.thresholdOverride,
          signals ?? undefined,
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
