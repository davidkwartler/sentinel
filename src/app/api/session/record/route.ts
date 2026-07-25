import { NextRequest, NextResponse, after } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { runDetection } from "@/lib/detection"
import { analyzeDetectionEvent } from "@/lib/claude"

const fingerprintSchema = z.object({
  visitorId: z.string().min(1),
  requestId: z.string().min(1),
  os: z.string().optional(),
  browser: z.string().optional(),
  screenRes: z.string().optional(),
  timezone: z.string().optional(),
  modelOverride: z.string().optional(),
})

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

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  const userAgent = request.headers.get("user-agent") ?? null

  // Dedupe check, isOriginal decision, insert, and detection all commit atomically.
  // Serializable isolation prevents two concurrent first-loads (React strict mode,
  // prefetch) from both reading "no fingerprints yet" and both inserting
  // isOriginal=true; the loser gets a serialization conflict (P2034) and retries.
  type RecordOutcome =
    | { kind: "duplicate"; id: string }
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

          const hasExisting = await tx.fingerprint.findFirst({
            where: { sessionId: dbSession.id },
          })

          const fingerprint = await tx.fingerprint.create({
            data: {
              sessionId: dbSession.id,
              visitorId: data.visitorId,
              requestId: data.requestId,
              ip,
              userAgent,
              os: data.os ?? null,
              browser: data.browser ?? null,
              screenRes: data.screenRes ?? null,
              timezone: data.timezone ?? null,
              isOriginal: !hasExisting,
            },
          })

          const detection = await runDetection(tx, {
            sessionId: dbSession.id,
            newVisitorId: data.visitorId,
            newIp: ip,
            os: data.os ?? null,
            browser: data.browser ?? null,
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

  const detectionResult = outcome! as Extract<RecordOutcome, { kind: "created" }>

  if (detectionResult.detected && detectionResult.eventId) {
    const eventId = detectionResult.eventId
    after(async () => {
      try {
        const allowModelOverride =
          process.env.NEXT_PUBLIC_MODEL_PICKER_ENABLED === "true"
        await analyzeDetectionEvent(
          eventId,
          allowModelOverride ? data.modelOverride : undefined,
        )
      } catch (err) {
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
