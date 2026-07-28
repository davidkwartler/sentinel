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
  /** Fields promoted out of the event because the UI and detection query them. */
  details: VerifiedDetails
  /**
   * The event as returned, minus `identification.components`. Stored so a
   * fingerprint can be inspected long after Fingerprint's retention window has
   * dropped the original.
   */
  rawEvent: unknown
}

/**
 * Server-observed values that are not risk signals. These describe the device
 * and its network rather than scoring them, which is why they are separate from
 * FingerprintSignals — they belong in the comparison table, not the prompt's
 * signals block.
 */
export interface VerifiedDetails {
  osVersion: string | null
  browserVersion: string | null
  device: string | null
  /** Server-derived, unlike the `timezone` the browser reports about itself. */
  ipTimezone: string | null
  ipCity: string | null
  ipCountry: string | null
  ipSubdivision: string | null
  ipLatitude: number | null
  ipLongitude: number | null
  /** Kilometres. IP geolocation is coarse; any distance claim must respect it. */
  ipAccuracyRadius: number | null
  asn: string | null
  asnName: string | null
  /** "isp", "hosting", "business", ... — an ISP-to-hosting move is the tell. */
  asnType: string | null
  /** First time Fingerprint saw this visitor, on this subscription. */
  firstSeenAt: Date | null
  lastSeenAt: Date | null
}

/** One Smart Signal's boolean verdict alongside how sure Fingerprint is of it. */
export interface ScoredSignal {
  result: boolean | null
  /** "low" | "medium" | "high". */
  confidence: string | null
  /** 0–1. A near-miss and a clear pass both serialize to `false` without this. */
  mlScore: number | null
}

export interface VelocityCounts {
  fiveMinutes: number | null
  oneHour: number | null
  twentyFourHours: number | null
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

  // --- Added enrichment. All optional so a signals object built from nothing
  // --- but the locally-derived flags stays valid.

  /** Confidence and ML score for the three products that report them. */
  vpnDetail?: ScoredSignal
  proxyDetail?: ScoredSignal
  tamperingDetail?: ScoredSignal
  /** Tampering's own sub-signals, separate from its verdict. */
  antiDetectBrowser?: boolean | null
  tamperingAnomalyScore?: number | null
  /** Fingerprint's own 0–100 risk number, independent of Claude's. */
  suspectScore?: number | null
  /** The browser's claimed timezone disagrees with the one its IP implies. */
  timezoneMismatch?: boolean | null
  /** Request IP appears in a malicious-actor database. */
  ipBlocklisted?: boolean | null
  ipBlocklistEmailSpam?: boolean | null
  ipBlocklistAttackSource?: boolean | null
  /** Request came from a hosting provider rather than a consumer connection. */
  datacenter?: boolean | null
  highActivity?: boolean | null
  /** Has Fingerprint seen this visitor before this event? */
  visitorFound?: boolean | null
  distinctIp?: VelocityCounts
  distinctCountry?: VelocityCounts
  /** Straight-line km between the two IP locations. Locally derived. */
  ipDistanceKm?: number | null
  /** Sum of both accuracy radii — distance below this is not a real move. */
  ipDistanceUncertaintyKm?: number | null
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

function parseSeenAt(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// mlScore is optional because most products do not have one: per the Server API
// schema only tampering and virtualMachine report it, so vpn and proxy are
// called with two arguments rather than a trailing `undefined` that reads like
// a field someone forgot to wire up.
function scored(
  result: boolean | undefined,
  confidence: string | undefined,
  mlScore?: number | undefined,
): ScoredSignal {
  return {
    result: result ?? null,
    confidence: confidence ?? null,
    mlScore: mlScore ?? null,
  }
}

function intervals(
  source: { "5m"?: number; "1h"?: number; "24h"?: number } | undefined,
): VelocityCounts {
  return {
    fiveMinutes: source?.["5m"] ?? null,
    oneHour: source?.["1h"] ?? null,
    // Fingerprint omits the 24h interval entirely above 20,000 events, so its
    // absence is a cap rather than a zero.
    twentyFourHours: source?.["24h"] ?? null,
  }
}

/**
 * `identification.components` is the per-source entropy dump: large, and
 * nothing here reasons about individual sources. Everything else is kept.
 */
function stripComponents(event: unknown): unknown {
  const clone = structuredClone(event) as {
    products?: { identification?: { data?: { components?: unknown } } }
  }
  if (clone?.products?.identification?.data) {
    delete clone.products.identification.data.components
  }
  return clone
}

/**
 * Render geolocation and network as single strings.
 *
 * DetectionEvent denormalizes what it renders so it survives its fingerprints
 * being deleted. Copying fifteen columns per side to achieve that would be
 * absurd; these two lines carry everything the prompt and the UI actually read.
 * Returns null when nothing resolved, so the field stays honestly empty rather
 * than storing "unknown, unknown".
 */
export function formatLocation(d: {
  ipCity?: string | null
  ipSubdivision?: string | null
  ipCountry?: string | null
  ipAccuracyRadius?: number | null
}): string | null {
  const place = [d.ipCity, d.ipSubdivision, d.ipCountry].filter(Boolean).join(", ")
  if (!place) return null
  return d.ipAccuracyRadius !== null && d.ipAccuracyRadius !== undefined
    ? `${place} (±${d.ipAccuracyRadius}km)`
    : place
}

export function formatNetwork(d: {
  asn?: string | null
  asnName?: string | null
  asnType?: string | null
}): string | null {
  if (!d.asnName && !d.asn) return null
  const parts = [d.asn ? `AS${d.asn}` : null, d.asnType].filter(Boolean)
  return `${d.asnName ?? "Unknown"}${parts.length ? ` (${parts.join(", ")})` : ""}`
}

const EARTH_RADIUS_KM = 6371

/**
 * Great-circle distance between two IP geolocations.
 *
 * Returned alongside the summed accuracy radii rather than on its own: IP
 * geolocation resolves to tens of kilometres, so a distance smaller than the
 * combined uncertainty is not evidence of movement at all.
 */
export function ipDistanceKm(
  a: { lat: number | null; lon: number | null },
  b: { lat: number | null; lon: number | null },
): number | null {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) {
    return null
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)))
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

  const products = event.products ?? {}
  // v4 or v6 — a visitor arrives on one or the other, and everything below
  // (geolocation, ASN, datacenter) hangs off whichever one is populated.
  const ipInfo = products.ipInfo?.data?.v4 ?? products.ipInfo?.data?.v6
  const geo = ipInfo?.geolocation
  const velocity = products.velocity?.data

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
    details: {
      osVersion: identification.browserDetails?.osVersion ?? null,
      browserVersion: identification.browserDetails?.browserFullVersion ?? null,
      device: identification.browserDetails?.device ?? null,
      ipTimezone: geo?.timezone ?? null,
      ipCity: geo?.city?.name ?? null,
      ipCountry: geo?.country?.name ?? null,
      ipSubdivision: geo?.subdivisions?.[0]?.name ?? null,
      ipLatitude: geo?.latitude ?? null,
      ipLongitude: geo?.longitude ?? null,
      ipAccuracyRadius: geo?.accuracyRadius ?? null,
      asn: ipInfo?.asn?.asn ?? null,
      asnName: ipInfo?.asn?.name ?? null,
      asnType: ipInfo?.asn?.type ?? null,
      // `subscription` rather than `global`: how long this workspace has known
      // the visitor is the useful number, and `global` leaks nothing useful
      // about whether *this* app has seen them.
      firstSeenAt: parseSeenAt(identification.firstSeenAt?.subscription),
      lastSeenAt: parseSeenAt(identification.lastSeenAt?.subscription),
    },
    rawEvent: stripComponents(event),
    signals: {
      incognito: products.incognito?.data?.result ?? null,
      vpn: products.vpn?.data?.result ?? null,
      bot: products.botd?.data?.bot?.result
        ? products.botd.data.bot.result !== "notDetected"
        : null,
      tampered: products.tampering?.data?.result ?? null,
      replayed: identification.replayed ?? null,
      confidence: identification.confidence?.score ?? null,
      vpnDetail: scored(products.vpn?.data?.result, products.vpn?.data?.confidence),
      proxyDetail: scored(
        products.proxy?.data?.result,
        products.proxy?.data?.confidence,
      ),
      tamperingDetail: scored(
        products.tampering?.data?.result,
        products.tampering?.data?.confidence,
        products.tampering?.data?.mlScore,
      ),
      antiDetectBrowser: products.tampering?.data?.antiDetectBrowser ?? null,
      tamperingAnomalyScore: products.tampering?.data?.anomalyScore ?? null,
      suspectScore: products.suspectScore?.data?.result ?? null,
      timezoneMismatch: products.vpn?.data?.methods?.timezoneMismatch ?? null,
      ipBlocklisted: products.ipBlocklist?.data?.result ?? null,
      ipBlocklistEmailSpam: products.ipBlocklist?.data?.details?.emailSpam ?? null,
      ipBlocklistAttackSource:
        products.ipBlocklist?.data?.details?.attackSource ?? null,
      datacenter: ipInfo?.datacenter?.result ?? null,
      highActivity: products.highActivity?.data?.result ?? null,
      visitorFound: identification.visitorFound ?? null,
      distinctIp: intervals(velocity?.distinctIp?.intervals),
      distinctCountry: intervals(velocity?.distinctCountry?.intervals),
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
  const lines: string[] = []

  // A boolean alone loses the difference between a near-miss and a clear pass:
  // an ML score of 0.94 and one of 0.04 both render as "no". Emit the score
  // beside the verdict wherever the product supplies one.
  const addScored = (label: string, signal: ScoredSignal | undefined) => {
    if (!signal || signal.result === null) return
    const detail = [
      signal.confidence !== null ? `${signal.confidence} confidence` : null,
      signal.mlScore !== null ? `ML score ${signal.mlScore}` : null,
    ].filter(Boolean)
    lines.push(
      `  ${label}: ${signal.result ? "yes" : "no"}` +
        (detail.length ? ` (${detail.join(", ")})` : ""),
    )
  }

  const addNumber = (label: string, value: number | null | undefined) => {
    if (value !== null && value !== undefined) lines.push(`  ${label}: ${value}`)
  }

  const addVelocity = (label: string, counts: VelocityCounts | undefined) => {
    if (!counts) return
    const parts = [
      counts.fiveMinutes !== null ? `${counts.fiveMinutes} in 5min` : null,
      counts.oneHour !== null ? `${counts.oneHour} in 1hr` : null,
      counts.twentyFourHours !== null ? `${counts.twentyFourHours} in 24hr` : null,
    ].filter(Boolean)
    if (parts.length) lines.push(`  ${label}: ${parts.join(", ")}`)
  }

  lines.push(...renderLines([["Incognito/private browsing", signals.incognito]]))
  addScored("VPN detected", signals.vpnDetail)
  addScored("Proxy detected", signals.proxyDetail)
  addScored("Browser tampering / anti-detect browser", signals.tamperingDetail)
  lines.push(
    ...renderLines([
      ["Bot detected", signals.bot],
      ["Anti-detect browser specifically", signals.antiDetectBrowser],
      ["Request ID replayed", signals.replayed],
      ["Browser timezone disagrees with its IP's timezone", signals.timezoneMismatch],
      ["Request IP on a malicious-actor blocklist", signals.ipBlocklisted],
      ["IP known for network attacks", signals.ipBlocklistAttackSource],
      ["IP from a datacenter/hosting provider rather than a consumer ISP", signals.datacenter],
      ["Visitor seen by Fingerprint before this event", signals.visitorFound],
      ["Unusually high request volume for this device", signals.highActivity],
    ]),
  )
  addNumber("Fingerprint's own suspect score (0-100)", signals.suspectScore)
  addNumber("Tampering anomaly score", signals.tamperingAnomalyScore)
  addNumber("Identification confidence", signals.confidence)
  addVelocity("Distinct IPs for this visitor", signals.distinctIp)
  addVelocity("Distinct countries for this visitor", signals.distinctCountry)

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
  const lines = renderLines([
    ["Verification downgraded from established session", signals.downgraded],
    ["Client-reported component failed its shape check", signals.shapeAnomaly],
  ])

  // Distance is meaningless without the uncertainty beside it — IP geolocation
  // resolves to tens of kilometres, so a 15km "move" inside a 40km combined
  // radius is the same address as far as this data can tell.
  if (signals.ipDistanceKm !== null && signals.ipDistanceKm !== undefined) {
    const uncertainty = signals.ipDistanceUncertaintyKm
    lines.push(
      `  Distance between the two IP locations: ${signals.ipDistanceKm} km` +
        (uncertainty !== null && uncertainty !== undefined
          ? ` (combined geolocation accuracy radius ${uncertainty} km — a distance at or below this is not evidence of movement)`
          : ""),
    )
  }

  return lines.join("\n")
}
