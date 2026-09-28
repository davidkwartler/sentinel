import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCachedServerApiHealth } from "@/lib/fingerprint-server"

// Diagnostic endpoint: reports whether Fingerprint server-side verification is
// configured and working in THIS environment, without ever exposing the key.
// Signed-in users only — the error codes describe the deployment's config.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Cached: every call here would otherwise spend a Fingerprint API request,
  // and any signed-in user can call it in a loop.
  const health = await getCachedServerApiHealth()
  return NextResponse.json(health, {
    status: health.status === "error" ? 503 : 200,
  })
}
