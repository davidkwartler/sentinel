"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

/**
 * Fetch one fingerprint's stored identification event.
 *
 * Deliberately not part of the /sessions payload. That page polls every 8
 * seconds and selects up to 25 fingerprints per session; a raw event runs to
 * kilobytes, so including it would multiply the poll by an order of magnitude
 * to serve a panel that is collapsed almost all of the time.
 *
 * Scoped by userId, not just by id. The fingerprint id is not sensitive, but it
 * is also not a secret — the query has to establish that the caller owns the row
 * rather than merely knowing its identifier.
 *
 * Returns null for "no event stored" and for "not yours" alike, so this cannot
 * be used to probe which ids exist.
 */
export async function getRawEvent(fingerprintId: string): Promise<unknown | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const fingerprint = await prisma.fingerprint.findFirst({
    where: { id: fingerprintId, userId: session.user.id },
    select: { rawEvent: true },
  })

  return fingerprint?.rawEvent ?? null
}
