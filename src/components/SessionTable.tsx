"use client"

import { useEffect, useState } from "react"
import { DEFAULT_FLAG_THRESHOLD, THRESHOLD_KEY } from "@/lib/settings"

type DetectionEventRow = {
  id: string
  status: string
  confidenceScore: number | null
  reasoning: string | null
  similarityScore: number
  createdAt: Date | string
}

type FingerprintRow = {
  visitorId: string
  ip: string | null
  userAgent: string | null
  os: string | null
  browser: string | null
  screenRes: string | null
  timezone: string | null
  isOriginal: boolean
  createdAt: Date | string
}

type SessionRow = {
  id: string
  expires: Date | string
  isCurrent: boolean
  detectionEventCount: number
  detectionEvents: DetectionEventRow[]
  fingerprints: FingerprintRow[]
}

type Stats = { total: number; flagged: number; pending: number }

// Flagged first, then still-analyzing, then everything else — a monitoring
// view should lead with what needs attention, not with what expires last.
const STATUS_RANK: Record<string, number> = {
  FLAGGED: 0,
  PENDING: 1,
  CLEAR: 2,
  ACTIVE: 3,
}

function statusOf(session: SessionRow): string {
  return session.detectionEvents[0]?.status ?? "ACTIVE"
}

export function SessionTable({
  sessions,
  stats,
}: {
  sessions: SessionRow[]
  stats: Stats
}) {
  const firstFlagged = sessions.find(
    (s) => statusOf(s) === "FLAGGED" && s.detectionEvents[0]?.reasoning,
  )
  const [expandedId, setExpandedId] = useState<string | null>(firstFlagged?.id ?? null)
  const [showFingerprints, setShowFingerprints] = useState<string | null>(null)
  const [threshold, setThreshold] = useState(DEFAULT_FLAG_THRESHOLD)

  // The flag threshold lives in localStorage (profile settings); read it after
  // mount so the score colours here match the rule the analysis actually used.
  useEffect(() => {
    const stored = Number(localStorage.getItem(THRESHOLD_KEY))
    if (localStorage.getItem(THRESHOLD_KEY) !== null && Number.isFinite(stored)) {
      setThreshold(stored)
    }
  }, [])

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-700">No active sessions</p>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-gray-400">
          Sessions appear here once you sign in and a fingerprint is recorded.
          To see detection work, follow the hijack simulation in the README:
          copy your <code className="font-mono">auth_session</code> cookie into a
          second browser and load the site there.
        </p>
      </div>
    )
  }

  const ordered = [...sessions].sort(
    (a, b) => (STATUS_RANK[statusOf(a)] ?? 9) - (STATUS_RANK[statusOf(b)] ?? 9),
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Active sessions" value={stats.total} />
        <StatCard label="Flagged" value={stats.flagged} tone={stats.flagged > 0 ? "danger" : "neutral"} />
        <StatCard label="Analyzing" value={stats.pending} tone={stats.pending > 0 ? "pending" : "neutral"} />
      </div>

      {ordered.map((session) => {
        // Deduplicate fingerprints by visitorId, keeping the first (earliest) of each
        const uniqueFps = session.fingerprints.filter(
          (f, i, arr) => arr.findIndex((x) => x.visitorId === f.visitorId) === i,
        )
        const original = uniqueFps.find((f) => f.isOriginal) ?? uniqueFps[0]
        const latest = uniqueFps[uniqueFps.length - 1] ?? original
        const event = session.detectionEvents[0]
        const status = statusOf(session)
        const hasAnalysis = !!event?.reasoning
        const isAnalysisOpen = expandedId === session.id
        const isFingerprintsOpen = showFingerprints === session.id
        const fpCount = uniqueFps.length

        return (
          <div
            key={session.id}
            className={`overflow-hidden rounded-lg border bg-white shadow-sm ${
              status === "FLAGGED" ? "border-red-200" : "border-gray-200"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <StatusBadge status={status} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-mono text-xs text-gray-700">
                      {original?.visitorId ?? "—"}
                    </p>
                    {session.isCurrent && (
                      <span className="shrink-0 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        This device
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-400">
                    {original?.ip ?? "No IP"}
                    {original?.browser && original?.os
                      ? ` · ${original.browser} on ${original.os}`
                      : ""}
                    {fpCount > 1 ? ` · ${fpCount} devices seen` : ""}
                    {latest ? " · " : ""}
                    {latest && <RelativeTime value={latest.createdAt} />}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {event?.confidenceScore != null && (
                  <ConfidenceMeter
                    score={event.confidenceScore}
                    threshold={threshold}
                  />
                )}
                <button
                  onClick={() =>
                    setShowFingerprints((p) => (p === session.id ? null : session.id))
                  }
                  aria-expanded={isFingerprintsOpen}
                  className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                >
                  {isFingerprintsOpen
                    ? "Hide"
                    : fpCount > 1
                      ? `Compare ${fpCount} fingerprints`
                      : "View fingerprint"}
                </button>
                {hasAnalysis && (
                  <button
                    onClick={() =>
                      setExpandedId((p) => (p === session.id ? null : session.id))
                    }
                    aria-expanded={isAnalysisOpen}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    {isAnalysisOpen ? "Hide" : "View"} analysis
                  </button>
                )}
              </div>
            </div>

            {status === "PENDING" && (
              <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 sm:px-5">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
                Fingerprint mismatch detected. Claude is analyzing the evidence —
                this usually takes a few seconds.
              </div>
            )}

            {isFingerprintsOpen && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 sm:px-5">
                <div className="mb-3 flex items-baseline justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Session fingerprints
                  </p>
                  {fpCount > 1 && (
                    <p className="text-[11px] text-gray-400">
                      Red values differ from the original fingerprint
                    </p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {uniqueFps.map((f, i) => {
                    const isOrig = f.isOriginal
                    const isDiff = (field: keyof FingerprintRow) =>
                      !isOrig && !!original && f[field] !== original[field]

                    return (
                      <div
                        key={i}
                        className={`rounded-md border p-3 text-xs ${
                          isOrig
                            ? "border-gray-200 bg-white"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                          <p className="font-medium text-gray-700">
                            {isOrig ? "Original (established session)" : `Later fingerprint #${i}`}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            <RelativeTime value={f.createdAt} />
                          </p>
                        </div>
                        <div className="space-y-1">
                          <FpField label="Visitor ID" value={f.visitorId} diff={isDiff("visitorId")} mono />
                          <FpField label="IP" value={f.ip} diff={isDiff("ip")} />
                          <FpField label="OS" value={f.os} diff={isDiff("os")} />
                          <FpField label="Browser" value={f.browser} diff={isDiff("browser")} />
                          <FpField label="Screen" value={f.screenRes} diff={isDiff("screenRes")} />
                          <FpField label="Timezone" value={f.timezone} diff={isDiff("timezone")} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {hasAnalysis && isAnalysisOpen && event && (
              <div
                className={`border-t px-4 py-4 sm:px-5 ${
                  status === "FLAGGED"
                    ? "border-red-100 bg-red-50"
                    : status === "CLEAR"
                      ? "border-green-100 bg-green-50"
                      : "border-amber-100 bg-amber-50"
                }`}
              >
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {event.reasoning}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-black/5 pt-2 text-[11px] text-gray-500">
                  <span>
                    Score {event.confidenceScore ?? "—"}/100, flags at {threshold}
                  </span>
                  <span>
                    Component similarity {(event.similarityScore * 100).toFixed(0)}%
                  </span>
                  <span>
                    Analyzed <RelativeTime value={event.createdAt} />
                  </span>
                  {session.detectionEventCount > 1 && (
                    <span>{session.detectionEventCount} events on this session</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: number
  tone?: "neutral" | "danger" | "pending"
}) {
  const valueColor =
    tone === "danger"
      ? "text-red-600"
      : tone === "pending"
        ? "text-amber-600"
        : "text-gray-900"
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  )
}

function ConfidenceMeter({
  score,
  threshold,
}: {
  score: number
  threshold: number
}) {
  const flagged = score >= threshold
  return (
    <div
      className="flex items-center gap-1.5"
      title={`Confidence ${score}/100 (flags at ${threshold})`}
    >
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${flagged ? "bg-red-500" : "bg-green-500"}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <span
        className={`text-xs font-semibold tabular-nums ${
          flagged ? "text-red-600" : "text-green-600"
        }`}
      >
        {score}
      </span>
    </div>
  )
}

// Renders an absolute timestamp on the server and swaps to a relative one after
// mount. Formatting dates during SSR would mismatch the client's locale and
// clock, so the relative form is deliberately client-only.
function RelativeTime({ value }: { value: Date | string }) {
  const [relative, setRelative] = useState<string | null>(null)
  const iso = typeof value === "string" ? value : value.toISOString()

  useEffect(() => {
    function compute() {
      const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
      if (seconds < 60) return "just now"
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return `${minutes}m ago`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours}h ago`
      return `${Math.floor(hours / 24)}d ago`
    }
    setRelative(compute())
    const timer = setInterval(() => setRelative(compute()), 30_000)
    return () => clearInterval(timer)
  }, [iso])

  return (
    <time dateTime={iso} title={new Date(iso).toISOString()}>
      {relative ?? iso.replace("T", " ").slice(0, 16)}
    </time>
  )
}

function FpField({
  label,
  value,
  diff,
  mono,
}: {
  label: string
  value: string | null
  diff: boolean
  mono?: boolean
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      <span
        className={`truncate text-right ${
          diff ? "font-medium text-red-600" : "text-gray-600"
        } ${mono ? "font-mono" : ""}`}
      >
        {value ?? "—"}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    FLAGGED: "bg-red-100 text-red-700",
    PENDING: "bg-amber-100 text-amber-700",
    CLEAR: "bg-green-100 text-green-700",
    ACTIVE: "bg-gray-100 text-gray-600",
  }
  const labels: Record<string, string> = {
    FLAGGED: "FLAGGED",
    PENDING: "ANALYZING",
    CLEAR: "CLEAR",
    ACTIVE: "ACTIVE",
  }
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[status] ?? styles.ACTIVE
      }`}
    >
      {labels[status] ?? status}
    </span>
  )
}
