import { NextRequest, NextResponse } from "next/server"
import { keepFingerprintWorkspaceAlive } from "@/lib/fingerprint-server"

// Daily Vercel Cron target (schedule in vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET` on every cron invocation when that env
// var is set; anything else calling this route is refused. Fails closed when
// CRON_SECRET is unset, so a missing variable can't turn this into a public
// endpoint that spends Fingerprint API calls on demand.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await keepFingerprintWorkspaceAlive()
  const log = result.ok ? console.log : console.error
  log("[cron] fingerprint keepalive:", result.call ?? "failed", "—", result.detail)

  // Non-2xx on failure so the run shows as failed in Vercel's cron logs.
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
