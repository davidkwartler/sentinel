import type { Prisma } from "@/generated/prisma/client"

interface FingerprintComponents {
  os?: string | null
  browser?: string | null
  screenRes?: string | null
  timezone?: string | null
}

/**
 * Compute similarity score between two fingerprint component sets.
 * Each of 4 components contributes 0.25 to the score if they match.
 * Both-null is treated as a match (unknown ≠ mismatch).
 * One-side-null is treated as inconclusive (no bonus, no penalty).
 * Returns 0.0–1.0 float. 1.0 = identical, 0.0 = completely different.
 */
export function computeSimilarity(
  a: FingerprintComponents,
  b: FingerprintComponents
): number {
  const fields: (keyof FingerprintComponents)[] = ["os", "browser", "screenRes", "timezone"]
  const weight = 1 / fields.length

  return fields.reduce((score, field) => {
    const aVal = a[field]?.toLowerCase().trim() || null
    const bVal = b[field]?.toLowerCase().trim() || null
    if (aVal === null && bVal === null) return score + weight // both absent = match
    if (aVal === null || bVal === null) return score // one missing = inconclusive
    return aVal === bVal ? score + weight : score
  }, 0)
}

export interface DetectionInput {
  sessionId: string
  userId: string
  newVisitorId: string
  newIp: string | null
  newUserAgent?: string | null
  os?: string | null
  browser?: string | null
  screenRes?: string | null
  timezone?: string | null
  verification?: string
}

export interface DetectionResult {
  detected: boolean
  eventId?: string
  /**
   * The original fingerprint that established this session was server-verified
   * and this one is not — evasion evidence, not necessarily a benign mode
   * change (a user can legitimately switch Pro to OSS from /account).
   */
  downgraded?: boolean
}

/**
 * Check whether the incoming fingerprint represents a session hijack.
 * Joins the caller's transaction (pass the tx client) so the fingerprint insert
 * and the detection decision commit or roll back together.
 * MUST be called AFTER the new fingerprint is persisted in the same tx (so the
 * isOriginal=true row is visible).
 * Returns { detected: false } if no original exists or visitorIds match.
 * Returns { detected: true, eventId } and writes a DetectionEvent on mismatch.
 */
export async function runDetection(
  tx: Prisma.TransactionClient,
  params: DetectionInput
): Promise<DetectionResult> {
  const { sessionId, newVisitorId, newIp } = params

  const original = await tx.fingerprint.findFirst({
    where: { sessionId, isOriginal: true },
  })

  if (!original) return { detected: false }

  if (original.visitorId === newVisitorId) return { detected: false }

  const score = computeSimilarity(original, {
    os: params.os ?? null,
    browser: params.browser ?? null,
    screenRes: params.screenRes ?? null,
    timezone: params.timezone ?? null,
  })

  const event = await tx.detectionEvent.create({
    data: {
      sessionId,
      userId: params.userId,
      originalVisitorId: original.visitorId,
      newVisitorId,
      originalIp: original.ip,
      newIp,
      // Denormalized so this event can render and be re-analyzed without
      // joining through Fingerprint, which may itself go sessionId-null.
      originalOs: original.os,
      originalBrowser: original.browser,
      originalScreenRes: original.screenRes,
      originalTimezone: original.timezone,
      originalUserAgent: original.userAgent,
      newOs: params.os ?? null,
      newBrowser: params.browser ?? null,
      newScreenRes: params.screenRes ?? null,
      newTimezone: params.timezone ?? null,
      newUserAgent: params.newUserAgent ?? null,
      similarityScore: score,
      status: "PENDING",
    },
  })

  const downgraded =
    original.verification === "verified" && params.verification !== "verified"

  return { detected: true, eventId: event.id, downgraded }
}
