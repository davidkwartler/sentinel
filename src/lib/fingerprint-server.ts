import {
  FingerprintJsServerApiClient,
  Region,
  RequestError,
} from "@fingerprintjs/fingerprintjs-pro-server-api"

// Server-side verification of a client-reported fingerprint.
//
// Without this, the browser is the sole source of truth for its own visitorId,
// OS, and browser — an attacker who replays the victim's payload looks
// identical to the victim. Here we take only the requestId from the client and
// ask Fingerprint's API what it actually observed, then use that instead.

export interface VerifiedFingerprint {
  visitorId: string
  ip: string | null
  os: string | null
  browser: string | null
  userAgent: string | null
  /** Server-observed values disagreed with what the client claimed. */
  clientMismatch: boolean
  signals: FingerprintSignals
}

export interface FingerprintSignals {
  incognito: boolean | null
  vpn: boolean | null
  bot: boolean | null
  tampered: boolean | null
  /** Fingerprint saw this exact requestId used more than once. */
  replayed: boolean | null
  /** Identification confidence, 0–1. */
  confidence: number | null
  /** Event was older than the replay window when we looked it up. */
  stale: boolean
}

// Fingerprint's own guidance: an identification event older than two minutes
// should be treated as a possible replay rather than a live page load.
const MAX_EVENT_AGE_MS = 2 * 60 * 1000

// Deliberately no isVerificationEnabled() helper: a key being present says
// nothing about whether lookups succeed. Anything reporting verification state
// should use checkServerApiHealth, which actually probes the API.

/** Plain-English meaning of Fingerprint's API error codes. */
export function describeErrorCode(code: string): string {
  switch (code) {
    case "TokenRequired":
      return "No API key was sent — FINGERPRINT_SERVER_API_KEY is missing from this environment."
    case "TokenNotFound":
      return "The API key was rejected. Check it is the Secret (Server API) key, not the Public key."
    case "WrongRegion":
      return `The key is valid but belongs to a different region. Set FINGERPRINT_REGION (currently ${process.env.FINGERPRINT_REGION ?? "Global"}) to EU or AP to match your workspace.`
    case "SubscriptionNotActive":
      return "The Fingerprint subscription is not active."
    case "FeatureNotEnabled":
      return "This endpoint is not included in the current Fingerprint plan."
    case "WorkspaceScopedSecretKeyRequired":
      return "A workspace-scoped secret key is required for this request."
    case "RequestNotFound":
      return "Key authenticated successfully; the request ID simply does not exist."
    default:
      return "Unrecognized error code — see Fingerprint's Server API docs."
  }
}

export type HealthStatus = "ok" | "not_configured" | "error"

// Config changes require a redeploy, so a stale-by-a-minute answer is fine and
// keeps the account page from making an API call on every load. Per-instance,
// which is all a serverless runtime can offer here.
const HEALTH_TTL_MS = 60_000
let healthCache: { at: number; result: HealthResult } | null = null

/** checkServerApiHealth with a short TTL, for anything on a render path. */
export async function getCachedServerApiHealth(): Promise<HealthResult> {
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) {
    return healthCache.result
  }
  const result = await checkServerApiHealth()
  healthCache = { at: Date.now(), result }
  return result
}

export interface HealthResult {
  status: HealthStatus
  region: string
  errorCode?: string
  detail: string
}

/**
 * Probe the Server API with a request ID that cannot exist. A RequestNotFound
 * error means credentials and region are correct — anything else names the
 * actual misconfiguration. Never returns or logs the key itself.
 */
export async function checkServerApiHealth(): Promise<HealthResult> {
  const apiKey = process.env.FINGERPRINT_SERVER_API_KEY
  const region = process.env.FINGERPRINT_REGION ?? "Global"

  if (!apiKey) {
    return {
      status: "not_configured",
      region,
      detail:
        "FINGERPRINT_SERVER_API_KEY is not set in this environment. Fingerprints are client-reported and unverified.",
    }
  }

  try {
    await getClient(apiKey).getEvent("sentinel-health-check-nonexistent")
    // A hit on a nonexistent ID would be surprising, but it still proves auth.
    return { status: "ok", region, detail: "Server API reachable and authenticated." }
  } catch (err) {
    if (err instanceof RequestError) {
      const authenticated =
        err.errorCode === "RequestNotFound" || err.errorCode === "VisitorNotFound"
      return {
        status: authenticated ? "ok" : "error",
        region,
        errorCode: err.errorCode,
        detail: describeErrorCode(err.errorCode),
      }
    }
    return {
      status: "error",
      region,
      detail: `Could not reach the Server API: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// The client is cheap to construct but holds connection state; memoize it.
let client: FingerprintJsServerApiClient | null = null

function getClient(apiKey: string): FingerprintJsServerApiClient {
  client ??= new FingerprintJsServerApiClient({
    apiKey,
    region: (process.env.FINGERPRINT_REGION as Region) ?? Region.Global,
  })
  return client
}

interface ClientClaims {
  visitorId: string
  os?: string | null
  browser?: string | null
}

/**
 * Look up an identification event by requestId and return what Fingerprint
 * actually observed.
 *
 * Returns null when verification is unavailable (no API key, unknown
 * requestId, API error). Callers fall back to the client-reported values —
 * the demo keeps working without a server key, it just trusts the browser.
 */
export async function verifyFingerprint(
  requestId: string,
  claims: ClientClaims,
): Promise<VerifiedFingerprint | null> {
  const apiKey = process.env.FINGERPRINT_SERVER_API_KEY
  if (!apiKey) return null

  let event
  try {
    event = await getClient(apiKey).getEvent(requestId)
  } catch (err) {
    // Fail open on transport/lookup errors: detection still runs on the
    // client-reported fingerprint, which is the pre-verification behaviour.
    // Log the API's own error code — it distinguishes a bad key from a wrong
    // region from a plan that doesn't include the endpoint.
    console.warn(
      "[fingerprint] server verification failed for",
      requestId,
      err instanceof RequestError
        ? `${err.statusCode} ${err.errorCode}: ${describeErrorCode(err.errorCode)}`
        : err,
    )
    return null
  }

  const identification = event.products?.identification?.data
  if (!identification) return null

  const eventAge = Date.now() - new Date(identification.time).getTime()

  return {
    visitorId: identification.visitorId,
    ip: identification.ip ?? null,
    os: identification.browserDetails?.os ?? null,
    browser: identification.browserDetails?.browserName ?? null,
    userAgent: identification.browserDetails?.userAgent ?? null,
    clientMismatch:
      identification.visitorId !== claims.visitorId ||
      (Boolean(claims.os) && identification.browserDetails?.os !== claims.os) ||
      (Boolean(claims.browser) &&
        identification.browserDetails?.browserName !== claims.browser),
    signals: {
      incognito: event.products?.incognito?.data?.result ?? null,
      vpn: event.products?.vpn?.data?.result ?? null,
      bot: event.products?.botd?.data?.bot?.result
        ? event.products.botd.data.bot.result !== "notDetected"
        : null,
      tampered: event.products?.tampering?.data?.result ?? null,
      replayed: identification.replayed ?? null,
      confidence: identification.confidence?.score ?? null,
      stale: Number.isFinite(eventAge) && eventAge > MAX_EVENT_AGE_MS,
    },
  }
}

/**
 * Render signals for the Claude prompt. Server-observed, so safe to inline.
 *
 * Smart Signals are plan-gated — on lower tiers most arrive as null. Emit only
 * the ones actually present rather than a wall of "unknown", which would spend
 * tokens telling the model nothing and invites hedging on absent evidence.
 * The staleness line is always present — it comes from the event timestamp, not
 * from a paid signal — so there is always at least one line to report.
 */
export function formatSignals(signals: FingerprintSignals): string {
  const lines: string[] = []
  const add = (label: string, value: boolean | null) => {
    if (value !== null) lines.push(`  ${label}: ${value ? "yes" : "no"}`)
  }

  add("Incognito/private browsing", signals.incognito)
  add("VPN detected", signals.vpn)
  add("Bot detected", signals.bot)
  add("Browser tampering / anti-detect browser", signals.tampered)
  add("Request ID replayed", signals.replayed)
  if (signals.confidence !== null) {
    lines.push(`  Identification confidence: ${signals.confidence}`)
  }
  // Always meaningful: derived from the event timestamp, not a paid signal.
  lines.push(
    `  Event older than the 2-minute replay window: ${signals.stale ? "yes" : "no"}`,
  )

  return lines.join("\n")
}
