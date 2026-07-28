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
  /**
   * Event was older than the replay window when we looked it up. Null when no
   * identification event was resolved at all — there is no timestamp to judge,
   * and reporting "not stale" from an absent lookup would assert a clean result
   * the API never gave us.
   */
  stale: boolean | null
  /**
   * These values came from Fingerprint's Server API. False when the object
   * exists only to carry the locally-derived flags below, which must not be
   * presented to the model as server-observed evidence.
   */
  serverVerified: boolean
  /**
   * This session established under server-verified identification and this
   * fingerprint reports one that cannot be verified — evasion evidence, not a
   * benign mode change. Null when there is no prior verification to compare.
   */
  downgraded?: boolean | null
  /**
   * A client-reported component (screen resolution, timezone, OS, browser)
   * failed its shape check and was normalized away. Null when nothing to report.
   */
  shapeAnomaly?: boolean | null
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

// Pro requestIds are issued by Fingerprint; OSS ones are crypto.randomUUID()
// output, so a canonical UUID is self-evidently unresolvable — sending one
// to dodge a lookup lands in the weaker "unverifiable" state, not a skip.
//
// Confirmed against Fingerprint's Server API reference: request IDs are a Unix
// millisecond timestamp, a period, and a base62 suffix (`1708102555327.NLOjmg`),
// or a bare base62 string (`8nbmT18x79m54PQ0GvPq`). Neither form contains the
// dashes this pattern requires, so live Pro traffic cannot be misclassified as
// unverifiable. https://docs.fingerprint.com/reference/server-api-get-event
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Verification = "verified" | "unresolved" | "unverifiable" | "not_configured"

export interface ResolvedFingerprint {
  verification: Verification
  verified: VerifiedFingerprint | null
}

/**
 * Decide verification status server-side, from the data rather than from a
 * client-supplied flag. A request carrying a UUID-shaped requestId cannot be
 * Pro-issued, so it is classified `unverifiable` without spending an API call.
 * Anything else attempts `verifyFingerprint`.
 */
export async function resolveFingerprint(
  requestId: string,
  claims: ClientClaims,
): Promise<ResolvedFingerprint> {
  if (!process.env.FINGERPRINT_SERVER_API_KEY) {
    return { verification: "not_configured", verified: null }
  }
  if (UUID_SHAPE.test(requestId)) {
    return { verification: "unverifiable", verified: null }
  }
  const verified = await verifyFingerprint(requestId, claims)
  return { verification: verified ? "verified" : "unresolved", verified }
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
      serverVerified: true,
    },
  }
}

function renderLines(
  entries: [label: string, value: boolean | null | undefined][],
): string[] {
  return entries
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([label, value]) => `  ${label}: ${value ? "yes" : "no"}`)
}

/**
 * Render the server-observed signals for the Claude prompt. Only these are
 * safe to present under a "server-verified" heading — the locally-derived
 * flags go through formatDerivedSignals so the model is never told that
 * something we worked out ourselves came from Fingerprint's API.
 *
 * Smart Signals are plan-gated — on lower tiers most arrive as null. Emit only
 * the ones actually present rather than a wall of "unknown", which would spend
 * tokens telling the model nothing and invites hedging on absent evidence.
 * Staleness is derived from the event timestamp rather than a paid signal, so
 * it is reported whenever an event was actually resolved — but it is null when
 * no lookup happened, and printing "not stale" then would assert a clean result
 * the API never gave us.
 */
export function formatSignals(signals: FingerprintSignals): string {
  const lines = renderLines([
    ["Incognito/private browsing", signals.incognito],
    ["VPN detected", signals.vpn],
    ["Bot detected", signals.bot],
    ["Browser tampering / anti-detect browser", signals.tampered],
    ["Request ID replayed", signals.replayed],
  ])

  if (signals.confidence !== null) {
    lines.push(`  Identification confidence: ${signals.confidence}`)
  }
  if (signals.stale !== null) {
    lines.push(
      `  Event older than the 2-minute replay window: ${signals.stale ? "yes" : "no"}`,
    )
  }

  return lines.join("\n")
}

/**
 * Render the signals this application worked out for itself, which are not
 * observations from Fingerprint and must not be labelled as such. Returns an
 * empty string when there is nothing to report, so the caller can omit the
 * block entirely rather than emitting an empty heading.
 */
export function formatDerivedSignals(signals: FingerprintSignals): string {
  return renderLines([
    ["Verification downgraded from established session", signals.downgraded],
    ["Client-reported component failed its shape check", signals.shapeAnomaly],
  ]).join("\n")
}
