import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { SessionTable } from "@/components/SessionTable"
import { PollingRefresher } from "./PollingRefresher"

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const sessions = await prisma.session.findMany({
    where: { userId: session.user!.id!, expires: { gt: new Date() } },
    select: {
      id: true,
      expires: true,
      fingerprints: {
        orderBy: { createdAt: "asc" },
        select: {
          visitorId: true,
          ip: true,
          userAgent: true,
          os: true,
          browser: true,
          screenRes: true,
          timezone: true,
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
        },
      },
    },
    orderBy: { expires: "desc" },
  })

  return (
    <div>
      <PollingRefresher intervalMs={5000} />
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900">
          Session Monitoring
        </h1>
        <p className="text-sm text-gray-500">
          Active sessions and detected fingerprint mismatches.
        </p>
      </div>
      <SessionTable sessions={sessions} />
    </div>
  )
}
