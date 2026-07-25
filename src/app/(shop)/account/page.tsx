import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { ProfileSettings } from "@/components/ProfileSettings"
import { isServerVerificationEnabled } from "@/lib/fingerprint-server"

export default async function AccountPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const { user } = session
  const userId = user!.id!
  const currentToken = (await cookies()).get("auth_session")?.value ?? null

  const [activeSessions, currentSession, flaggedCount] = await Promise.all([
    prisma.session.count({ where: { userId, expires: { gt: new Date() } } }),
    currentToken
      ? prisma.session.findUnique({
          where: { sessionToken: currentToken },
          select: { expires: true, _count: { select: { fingerprints: true } } },
        })
      : null,
    prisma.detectionEvent.count({
      where: { session: { userId }, status: "FLAGGED" },
    }),
  ])

  const verificationOn = isServerVerificationEnabled()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Account</h1>

      {/* Identity. Name and email appear here and nowhere else on the page. */}
      <div className="mb-8 flex items-center gap-4">
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-14 w-14 rounded-full" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500">
            {user?.name?.[0] ?? "?"}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-medium text-gray-900">
            {user?.name ?? "Unknown"}
          </p>
          <p className="truncate text-sm text-gray-600">{user?.email}</p>
        </div>
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-gray-900">This session</h2>
          <Link
            href="/sessions"
            className="text-xs text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            {flaggedCount > 0
              ? `Review ${flaggedCount} flagged ${flaggedCount === 1 ? "event" : "events"}`
              : "View all sessions"}
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Fingerprints"
            value={currentSession ? String(currentSession._count.fingerprints) : "—"}
          />
          <Stat
            label="Expires"
            value={currentSession ? currentSession.expires.toISOString().slice(0, 10) : "—"}
          />
          <Stat label="Active sessions" value={String(activeSessions)} />
          <Stat
            label="Verification"
            value={verificationOn ? "Server-side" : "Client only"}
          />
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-900">Detection settings</h2>
        <ProfileSettings />
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold text-gray-900">{value}</dd>
    </div>
  )
}
