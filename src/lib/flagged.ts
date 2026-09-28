import { prisma } from "@/lib/db"

/**
 * How many of the user's live sessions are currently flagged, by the same
 * rule the /sessions page uses for its "Flagged" count: a session counts when
 * its most recent detection event is FLAGGED. Expired sessions and old events
 * on sessions that have since cleared don't count, so the header badge goes
 * away once nothing live is flagged.
 */
export async function countFlaggedSessions(userId: string): Promise<number> {
  const sessions = await prisma.session.findMany({
    where: { userId, expires: { gt: new Date() } },
    select: {
      detectionEvents: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  })
  return sessions.filter((s) => s.detectionEvents[0]?.status === "FLAGGED").length
}
