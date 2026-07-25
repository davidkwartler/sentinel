import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { checkServerApiHealth } from "@/lib/fingerprint-server"

// Diagnostic endpoint: reports whether Fingerprint server-side verification is
// configured and working in THIS environment, without ever exposing the key.
// Signed-in users only — the error codes describe the deployment's config.
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const health = await checkServerApiHealth()
  return NextResponse.json(health, {
    status: health.status === "error" ? 503 : 200,
  })
}
