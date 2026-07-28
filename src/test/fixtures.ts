// Shared row shapes for tests that mock Prisma.
//
// Fingerprint gained a wide block of server-observed columns; without a fixture
// every mockResolvedValue has to enumerate all of them, and adding one column
// breaks a dozen unrelated tests. Defaults here are the OSS/unverified case —
// nothing server-observed resolved — so a test only states what it is actually
// exercising.

import type { Fingerprint, DetectionEvent } from "@/generated/prisma/client"
import type {
  VerifiedFingerprint,
  VerifiedDetails,
  FingerprintSignals,
} from "@/lib/fingerprint-server"

/** A resolved Pro lookup with nothing notable in it — override what matters. */
export function verifiedFingerprint(
  overrides: Partial<VerifiedFingerprint> & {
    details?: Partial<VerifiedDetails>
    signals?: Partial<FingerprintSignals>
  } = {},
): VerifiedFingerprint {
  const { details, signals, ...rest } = overrides
  return {
    visitorId: "server-visitor",
    ip: null,
    os: null,
    browser: null,
    userAgent: null,
    clientMismatch: false,
    rawEvent: null,
    details: {
      osVersion: null,
      browserVersion: null,
      device: null,
      ipTimezone: null,
      ipCity: null,
      ipCountry: null,
      ipSubdivision: null,
      ipLatitude: null,
      ipLongitude: null,
      ipAccuracyRadius: null,
      asn: null,
      asnName: null,
      asnType: null,
      firstSeenAt: null,
      lastSeenAt: null,
      ...details,
    },
    signals: {
      incognito: null,
      vpn: null,
      bot: null,
      tampered: null,
      replayed: null,
      confidence: null,
      stale: false,
      serverVerified: true,
      ...signals,
    },
    ...rest,
  }
}

export function fingerprintRow(overrides: Partial<Fingerprint> = {}): Fingerprint {
  return {
    id: "fp-1",
    userId: "user-1",
    sessionId: "sess-1",
    visitorId: "visitor-1",
    requestId: "req-1",
    ip: null,
    userAgent: null,
    os: null,
    browser: null,
    screenRes: null,
    timezone: null,
    verification: "not_configured",
    osVersion: null,
    browserVersion: null,
    device: null,
    ipTimezone: null,
    ipCity: null,
    ipCountry: null,
    ipSubdivision: null,
    ipLatitude: null,
    ipLongitude: null,
    ipAccuracyRadius: null,
    asn: null,
    asnName: null,
    asnType: null,
    firstSeenAt: null,
    lastSeenAt: null,
    suspectScore: null,
    rawEvent: null,
    isOriginal: true,
    createdAt: new Date(),
    ...overrides,
  }
}

export function detectionEventRow(
  overrides: Partial<DetectionEvent> = {},
): DetectionEvent {
  return {
    id: "event-1",
    createdAt: new Date(),
    userId: "user-1",
    sessionId: "sess-1",
    originalVisitorId: "visitor-1",
    newVisitorId: "visitor-2",
    originalIp: null,
    newIp: null,
    originalOs: null,
    originalBrowser: null,
    originalScreenRes: null,
    originalTimezone: null,
    originalUserAgent: null,
    newOs: null,
    newBrowser: null,
    newScreenRes: null,
    newTimezone: null,
    newUserAgent: null,
    originalLocation: null,
    originalNetwork: null,
    newLocation: null,
    newNetwork: null,
    similarityScore: 0,
    status: "PENDING",
    confidenceScore: null,
    reasoning: null,
    ...overrides,
  }
}
