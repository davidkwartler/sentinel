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
}

type SessionRow = {
  id: string
  detectionEvents: DetectionEventRow[]
  fingerprints: FingerprintRow[]
}

export function SessionTable({ sessions }: { sessions: SessionRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
        No active sessions found.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left">Visitor ID</th>
            <th className="px-4 py-3 text-left">IP Address</th>
            <th className="px-4 py-3 text-left">User Agent</th>
            <th className="px-4 py-3 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sessions.map((session) => {
            const fp = session.fingerprints[0]
            const event = session.detectionEvents[0]
            const status = event?.status ?? "ACTIVE"
            const isFlagged = status === "FLAGGED"
            const isExpanded = expandedId === session.id

            return (
              <SessionRowFragment
                key={session.id}
                sessionId={session.id}
                fp={fp}
                event={event ?? null}
                status={status}
                isFlagged={isFlagged}
                isExpanded={isExpanded}
                onToggle={toggle}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SessionRowFragment({
  sessionId,
  fp,
  event,
  status,
  isFlagged,
  isExpanded,
  onToggle,
}: {
  sessionId: string
  fp: FingerprintRow | undefined
  event: DetectionEventRow | null
  status: string
  isFlagged: boolean
  isExpanded: boolean
  onToggle: (id: string) => void
}) {
  return (
    <>
      <tr
        onClick={() => isFlagged && onToggle(sessionId)}
        className={isFlagged ? "cursor-pointer hover:bg-red-50" : ""}
        title={isFlagged ? "Click to view Claude's reasoning" : undefined}
      >
        <td className="px-4 py-3 font-mono text-xs text-gray-700">
          {fp?.visitorId ? fp.visitorId.slice(0, 12) + "…" : "—"}
        </td>
        <td className="px-4 py-3 text-gray-600">{fp?.ip ?? "—"}</td>
        <td className="max-w-xs truncate px-4 py-3 text-xs text-gray-500">
          {fp?.userAgent ?? "—"}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={status} />
        </td>
      </tr>
      {isFlagged && isExpanded && event && (
        <tr>
          <td
            colSpan={4}
            className="border-t border-red-100 bg-red-50 px-4 py-4"
          >
            <p className="mb-2 text-xs font-semibold text-red-700">
              Confidence Score: {event.confidenceScore ?? "—"} / 100
            </p>
            <p className="text-sm leading-relaxed text-gray-700">
              {event.reasoning ?? "No reasoning available."}
            </p>
          </td>
        </tr>
      )}
    </>
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
