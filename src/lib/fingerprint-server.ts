import {
  FingerprintJsServerApiClient,
  Region,
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

export function isServerVerificationEnabled(): boolean {
  return Boolean(process.env.FINGERPRINT_SERVER_API_KEY)
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
    console.warn("[fingerprint] server verification failed for", requestId, err)
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

/** Render signals for the Claude prompt. Server-observed, so safe to inline. */
export function formatSignals(signals: FingerprintSignals): string {
  const yesNo = (v: boolean | null) => (v === null ? "unknown" : v ? "yes" : "no")
  return [
    `  Incognito/private browsing: ${yesNo(signals.incognito)}`,
    `  VPN detected: ${yesNo(signals.vpn)}`,
    `  Bot detected: ${yesNo(signals.bot)}`,
    `  Browser tampering / anti-detect browser: ${yesNo(signals.tampered)}`,
    `  Request ID replayed: ${yesNo(signals.replayed)}`,
    `  Identification confidence: ${signals.confidence ?? "unknown"}`,
    `  Event older than the 2-minute replay window: ${signals.stale ? "yes" : "no"}`,
  ].join("\n")
}
