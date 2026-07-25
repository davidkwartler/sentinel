import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { ProfileSettings } from "@/components/ProfileSettings"
import { isServerVerificationEnabled } from "@/lib/fingerprint-server"

export default async function ProfilePage() {
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
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Account</h1>

      {/* Identity. Name and email appear here and nowhere else on the page. */}
      <div className="mb-6 flex items-center gap-4">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-sm font-medium text-gray-500">This session</p>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <dl className="space-y-3 text-sm">
              <Fact
                label="Fingerprints recorded"
                value={currentSession ? String(currentSession._count.fingerprints) : "—"}
              />
              <Fact
                label="Session expires"
                value={
                  currentSession ? currentSession.expires.toISOString().slice(0, 10) : "—"
                }
              />
              <Fact
                label="Active sessions"
                value={String(activeSessions)}
                hint={activeSessions > 1 ? "across your devices" : undefined}
              />
              <Fact
                label="Server-side verification"
                value={verificationOn ? "On" : "Off"}
                hint={
                  verificationOn
                    ? "verified against Fingerprint's API"
                    : "fingerprints are client-reported"
                }
              />
            </dl>
            <div className="mt-4 border-t border-gray-100 pt-3">
              <Link
                href="/dashboard"
                className="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900"
              >
                {flaggedCount > 0
                  ? `Review ${flaggedCount} flagged ${flaggedCount === 1 ? "event" : "events"}`
                  : "View session monitoring"}
              </Link>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium text-gray-500">Detection settings</p>
          <ProfileSettings />
        </div>
      </div>
    </div>
  )
}

function Fact({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-right">
        <span className="font-medium text-gray-900">{value}</span>
        {hint && <span className="ml-2 text-xs text-gray-500">{hint}</span>}
      </dd>
    </div>
  )
}
