import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { SessionTable, DetectionHistoryList } from "@/components/SessionTable"
import { PollingRefresher } from "./PollingRefresher"

// Bounds the detection history payload; this is a monitoring view, not an
// unbounded audit export.
const DETECTION_HISTORY_LIMIT = 50

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  // Used only to mark which row is the browser being viewed from. The token
  // itself is never sent to the client — only the derived boolean.
  const currentToken = (await cookies()).get("auth_session")?.value ?? null

  const sessions = await prisma.session.findMany({
    where: { userId: session.user!.id!, expires: { gt: new Date() } },
    select: {
      id: true,
      sessionToken: true,
      expires: true,
      fingerprints: {
        orderBy: { createdAt: "asc" },
        take: 25, // dashboard polls; bound the payload per session
        select: {
          visitorId: true,
          ip: true,
          userAgent: true,
          os: true,
          browser: true,
          screenRes: true,
          timezone: true,
          verification: true,
          isOriginal: true,
          createdAt: true,
        },
      },
      detectionEvents: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          confidenceScore: true,
          reasoning: true,
          similarityScore: true,
          createdAt: true,
        },
      },
      _count: { select: { detectionEvents: true } },
    },
    orderBy: { expires: "desc" },
  })

  const rows = sessions.map(({ sessionToken, _count, ...rest }) => ({
    ...rest,
    isCurrent: sessionToken === currentToken,
    detectionEventCount: _count.detectionEvents,
  }))

  const flagged = rows.filter((r) => r.detectionEvents[0]?.status === "FLAGGED").length
  const pending = rows.filter((r) => r.detectionEvents[0]?.status === "PENDING").length

  // Detection events whose session is not among the cards above — either the
  // session was deleted by signing out (sessionId is now null, since these rows
  // survive that rather than cascading away) or it has expired out of the live
  // list. Without this query those rows exist in the database and appear
  // nowhere, which is the data loss this whole change set exists to stop.
  //
  // Scoped to sessions NOT rendered above rather than to every event, so a
  // flagged live session isn't listed twice on the same page.
  const liveSessionIds = rows.map((r) => r.id)
  const detectionHistory = await prisma.detectionEvent.findMany({
    where: {
      userId: session.user!.id!,
      OR: [{ sessionId: null }, { sessionId: { notIn: liveSessionIds } }],
    },
    orderBy: { createdAt: "desc" },
    take: DETECTION_HISTORY_LIMIT,
    select: {
      id: true,
      status: true,
      confidenceScore: true,
      reasoning: true,
      similarityScore: true,
      createdAt: true,
      sessionId: true,
      originalVisitorId: true,
      newVisitorId: true,
    },
  })

  return (
    <div>
      <PollingRefresher intervalMs={8000} />
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900">Sessions</h1>
        <p className="text-sm text-gray-500">
          View sessions, fingerprints, and detection engine outcomes.
        </p>
      </div>
      <SessionTable
        sessions={rows}
        stats={{ total: rows.length, flagged, pending }}
      />
      <DetectionHistoryList events={detectionHistory} />
    </div>
  )
}
