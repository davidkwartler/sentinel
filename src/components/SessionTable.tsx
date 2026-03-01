"use client"

import { useState } from "react"

type DetectionEventRow = {
  id: string
  status: string
  confidenceScore: number | null
  reasoning: string | null
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
  detectionEvents: DetectionEventRow[]
  fingerprints: FingerprintRow[]
}

export function SessionTable({ sessions }: { sessions: SessionRow[] }) {
  const firstFlagged = sessions.find(
    (s) => s.detectionEvents[0]?.status === "FLAGGED" && s.detectionEvents[0]?.reasoning,
  )
  const [expandedId, setExpandedId] = useState<string | null>(firstFlagged?.id ?? null)
  const [showFingerprints, setShowFingerprints] = useState<string | null>(null)

  function toggleAnalysis(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  function toggleFingerprints(id: string) {
    setShowFingerprints((prev) => (prev === id ? null : id))
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
        <p className="text-3xl">🛡️</p>
        <p className="mt-3 text-sm font-medium text-gray-700">
          No detection events yet
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Browse the site normally, then try the hijack simulation from the
          README to see detection in action.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => {
        // Deduplicate fingerprints by visitorId, keeping the first (earliest) of each
        const uniqueFps = session.fingerprints.filter(
          (f, i, arr) => arr.findIndex((x) => x.visitorId === f.visitorId) === i,
        )
        const fp = uniqueFps.find((f) => f.isOriginal) ?? uniqueFps[0]
        const event = session.detectionEvents[0]
        const status = event?.status ?? "ACTIVE"
        const hasAnalysis = !!event?.reasoning
        const isAnalysisOpen = expandedId === session.id
        const isFingerprintsOpen = showFingerprints === session.id
        const fpCount = uniqueFps.length

        const confidenceColor =
          event?.confidenceScore != null
            ? event.confidenceScore >= 70
              ? "bg-red-100 text-red-700"
              : event.confidenceScore >= 40
                ? "bg-yellow-100 text-yellow-700"
                : "bg-green-100 text-green-700"
            : ""

        const analysisBg =
          status === "FLAGGED"
            ? "bg-red-50 border-red-100"
            : status === "CLEAR"
              ? "bg-green-50 border-green-100"
              : "bg-yellow-50 border-yellow-100"

        return (
          <div
            key={session.id}
            className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
          >
            {/* Main row */}
            <div className="flex items-center justify-between px-4 py-3 sm:px-5">
              <div className="flex items-center gap-4 overflow-hidden">
                <StatusBadge status={status} />
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-gray-700">
                    {fp?.visitorId ?? "\u2014"}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {fp?.ip ?? "No IP"}{" "}
                    {fp?.browser && fp?.os ? `\u00B7 ${fp.browser} on ${fp.os}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleFingerprints(session.id)}
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
                    onClick={() => toggleAnalysis(session.id)}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    {isAnalysisOpen ? "Hide" : "View"} analysis
                  </button>
                )}
              </div>
            </div>

            {/* Fingerprint comparison */}
            {isFingerprintsOpen && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 sm:px-5">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Fingerprint Comparison
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {uniqueFps.map((f, i) => {
                    const isOrig = f.isOriginal
                    const isDiff = (field: keyof FingerprintRow) => {
                      if (!fp || isOrig) return false
                      return f[field] !== fp[field]
                    }

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
                            {isOrig ? "Original" : `Fingerprint #${i + 1}`}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {new Date(f.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <FpField
                            label="Visitor ID"
                            value={f.visitorId}
                            diff={isDiff("visitorId")}
                            mono
                          />
                          <FpField
                            label="IP"
                            value={f.ip}
                            diff={isDiff("ip")}
                          />
                          <FpField
                            label="OS"
                            value={f.os}
                            diff={isDiff("os")}
                          />
                          <FpField
                            label="Browser"
                            value={f.browser}
                            diff={isDiff("browser")}
                          />
                          <FpField
                            label="Screen"
                            value={f.screenRes}
                            diff={isDiff("screenRes")}
                          />
                          <FpField
                            label="Timezone"
                            value={f.timezone}
                            diff={isDiff("timezone")}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Analysis */}
            {hasAnalysis && isAnalysisOpen && event && (
              <div className={`border-t px-4 py-4 sm:px-5 ${analysisBg}`}>
                <div className="flex items-start gap-3">
                  {event.confidenceScore != null && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${confidenceColor}`}
                    >
                      {event.confidenceScore}/100
                    </span>
                  )}
                  <p className="text-sm leading-relaxed text-gray-700">
                    {event.reasoning}
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
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
        {value ?? "\u2014"}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    FLAGGED: "bg-red-100 text-red-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    CLEAR: "bg-green-100 text-green-700",
    ACTIVE: "bg-gray-100 text-gray-600",
  }
  const cls = styles[status] ?? styles.ACTIVE
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  )
}
