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

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Look up the database session by userId (auth() doesn't expose session ID directly)
  const dbSession = await prisma.session.findFirst({
    where: { userId: session.user.id! },
    orderBy: { expires: "desc" },
  })

  if (!dbSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  const body = await request.json()
  const parsed = fingerprintSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const data = parsed.data

  // Deduplication: skip if this requestId already exists
  const existing = await prisma.fingerprint.findUnique({
    where: { requestId: data.requestId },
  })
  if (existing) {
    return NextResponse.json({ status: "duplicate", id: existing.id })
  }

  // Check if this is the first fingerprint for this session (mark as original)
  const hasExisting = await prisma.fingerprint.findFirst({
    where: { sessionId: dbSession.id },
  })

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  const userAgent = request.headers.get("user-agent") ?? null

  const fingerprint = await prisma.fingerprint.create({
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

  // Run detection: compare new fingerprint against session's original
  const detectionResult = await runDetection({
    sessionId: dbSession.id,
    newVisitorId: data.visitorId,
    newIp: ip,
    os: data.os ?? null,
    browser: data.browser ?? null,
    screenRes: data.screenRes ?? null,
    timezone: data.timezone ?? null,
  })

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
      }
    })
  }

  return NextResponse.json({
    status: "ok",
    id: fingerprint.id,
    detected: detectionResult.detected,
    eventId: detectionResult.eventId ?? null,
  })
}
