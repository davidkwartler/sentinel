import { prisma } from "@/lib/db"

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
  newVisitorId: string
  newIp: string | null
  os?: string | null
  browser?: string | null
  screenRes?: string | null
  timezone?: string | null
}

export interface DetectionResult {
  detected: boolean
  eventId?: string
}

/**
 * Check whether the incoming fingerprint represents a session hijack.
 * Runs inside a Prisma $transaction for atomicity.
 * MUST be called AFTER the new fingerprint is already persisted (so isOriginal=true row exists).
 * Returns { detected: false } if no original exists or visitorIds match.
 * Returns { detected: true, eventId } and writes a DetectionEvent on mismatch.
 */
export async function runDetection(params: DetectionInput): Promise<DetectionResult> {
  const { sessionId, newVisitorId, newIp } = params

  return await prisma.$transaction(async (tx) => {
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
