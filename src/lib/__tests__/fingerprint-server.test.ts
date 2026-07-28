import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Both must be hoisted: vi.mock's factory runs before top-level declarations.
const { mockGetEvent, MockRequestError } = vi.hoisted(() => ({
  mockGetEvent: vi.fn(),
  MockRequestError: class extends Error {
    statusCode: number
    errorCode: string
    constructor(statusCode: number, errorCode: string) {
      super(`${statusCode} ${errorCode}`)
      this.statusCode = statusCode
      this.errorCode = errorCode
    }
  },
}))

vi.mock('@fingerprintjs/fingerprintjs-pro-server-api', () => ({
  FingerprintJsServerApiClient: class {
    getEvent = mockGetEvent
  },
  Region: { Global: 'Global', EU: 'EU', AP: 'AP' },
  RequestError: MockRequestError,
}))

import {
  verifyFingerprint,
  resolveFingerprint,
  formatSignals,
  formatDerivedSignals,
  formatLocation,
  formatNetwork,
  ipDistanceKm,
  checkServerApiHealth,
  getCachedServerApiHealth,
  describeErrorCode,
} from '../fingerprint-server'
import { clampThreshold, MIN_FLAG_THRESHOLD } from '../settings'

function eventFixture(overrides: Record<string, unknown> = {}) {
  return {
    products: {
      identification: {
        data: {
          visitorId: 'server-visitor',
          requestId: 'req-1',
          ip: '203.0.113.7',
          time: new Date().toISOString(),
          replayed: false,
          confidence: { score: 0.99 },
          browserDetails: {
            os: 'Mac OS X',
            browserName: 'Chrome',
            userAgent: 'Mozilla/5.0',
          },
          ...overrides,
        },
      },
      incognito: { data: { result: true } },
      vpn: { data: { result: false } },
      botd: { data: { bot: { result: 'notDetected' } } },
      tampering: { data: { result: false } },
    },
  }
}

describe('verifyFingerprint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FINGERPRINT_SERVER_API_KEY = 'secret'
  })

  afterEach(() => {
    delete process.env.FINGERPRINT_SERVER_API_KEY
  })

  it('returns null when no server key is configured', async () => {
    delete process.env.FINGERPRINT_SERVER_API_KEY

    const result = await verifyFingerprint('req-1', { visitorId: 'client' })

    expect(result).toBeNull()
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it('returns server-observed values over client claims', async () => {
    mockGetEvent.mockResolvedValue(eventFixture())

    const result = await verifyFingerprint('req-1', {
      visitorId: 'server-visitor',
      os: 'Mac OS X',
      browser: 'Chrome',
    })

    expect(result?.visitorId).toBe('server-visitor')
    expect(result?.ip).toBe('203.0.113.7')
    expect(result?.os).toBe('Mac OS X')
    expect(result?.clientMismatch).toBe(false)
    expect(result?.signals.incognito).toBe(true)
    expect(result?.signals.bot).toBe(false)
    expect(result?.signals.stale).toBe(false)
  })

  it('flags a client that lied about its own components', async () => {
    mockGetEvent.mockResolvedValue(eventFixture())

    const result = await verifyFingerprint('req-1', {
      visitorId: 'server-visitor',
      os: 'Windows',
      browser: 'Chrome',
    })

    expect(result?.clientMismatch).toBe(true)
    // Server value wins regardless
    expect(result?.os).toBe('Mac OS X')
  })

  it('marks events older than the replay window as stale', async () => {
    mockGetEvent.mockResolvedValue(
      eventFixture({ time: new Date(Date.now() - 5 * 60 * 1000).toISOString() }),
    )

    const result = await verifyFingerprint('req-1', { visitorId: 'server-visitor' })

    expect(result?.signals.stale).toBe(true)
  })

  it('detects bots from the botd signal', async () => {
    const fixture = eventFixture()
    fixture.products.botd.data.bot.result = 'bad'
    mockGetEvent.mockResolvedValue(fixture)

    const result = await verifyFingerprint('req-1', { visitorId: 'server-visitor' })

    expect(result?.signals.bot).toBe(true)
  })

  it('fails open when the lookup throws', async () => {
    mockGetEvent.mockRejectedValue(new Error('network down'))

    const result = await verifyFingerprint('req-1', { visitorId: 'client' })

    expect(result).toBeNull()
  })

  it('returns null when the event has no identification data', async () => {
    mockGetEvent.mockResolvedValue({ products: {} })

    const result = await verifyFingerprint('req-1', { visitorId: 'client' })

    expect(result).toBeNull()
  })
})

describe('verifyFingerprint enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FINGERPRINT_SERVER_API_KEY = 'secret'
  })

  afterEach(() => {
    delete process.env.FINGERPRINT_SERVER_API_KEY
  })

  // Shaped after a real Server API response. The paths here are the whole point
  // of the test: the dashboard/webhook payload is flat snake_case, the Server
  // API is nested camelCase under `products`, and reading one while coding
  // against the other fails silently by producing nulls everywhere.
  function enrichedFixture() {
    const base = eventFixture()
    return {
      products: {
        ...base.products,
        identification: {
          data: {
            ...base.products.identification.data,
            visitorFound: false,
            firstSeenAt: { global: null, subscription: '2026-07-28T09:25:13.000Z' },
            lastSeenAt: { global: null, subscription: '2026-07-28T09:25:13.000Z' },
            browserDetails: {
              ...base.products.identification.data.browserDetails,
              osVersion: '10.15.7',
              browserFullVersion: '150.0.0',
              device: 'Other',
            },
          },
        },
        ipInfo: {
          data: {
            v4: {
              address: '136.49.184.216',
              geolocation: {
                accuracyRadius: 20,
                latitude: 30.26715,
                longitude: -97.74306,
                timezone: 'America/Chicago',
                city: { name: 'Austin' },
                country: { name: 'United States', code: 'US' },
                subdivisions: [{ isoCode: 'TX', name: 'Texas' }],
              },
              asn: { asn: '16591', name: 'Google Fiber Inc.', network: '136.32.0.0/11', type: 'isp' },
              datacenter: { result: false, name: '' },
            },
          },
        },
        velocity: {
          data: {
            distinctIp: { intervals: { '5m': 1, '1h': 1, '24h': 2 } },
            distinctCountry: { intervals: { '5m': 1, '1h': 1, '24h': 1 } },
          },
        },
        suspectScore: { data: { result: 0 } },
        ipBlocklist: { data: { result: false, details: { emailSpam: false, attackSource: false } } },
        proxy: { data: { result: false, confidence: 'high' } },
        vpn: { data: { result: false, confidence: 'high', methods: { timezoneMismatch: false } } },
        tampering: { data: { result: false, confidence: 'high', mlScore: 0.0263, anomalyScore: 0, antiDetectBrowser: false } },
        highActivity: { data: { result: false } },
      },
    }
  }

  it('maps geolocation, ASN and datacenter off the v4 block', async () => {
    mockGetEvent.mockResolvedValue(enrichedFixture())

    const result = await verifyFingerprint('pro-request-id', { visitorId: 'server-visitor' })

    expect(result?.details.ipCity).toBe('Austin')
    expect(result?.details.ipSubdivision).toBe('Texas')
    expect(result?.details.ipCountry).toBe('United States')
    expect(result?.details.ipAccuracyRadius).toBe(20)
    expect(result?.details.ipTimezone).toBe('America/Chicago')
    expect(result?.details.asnName).toBe('Google Fiber Inc.')
    expect(result?.details.asnType).toBe('isp')
    expect(result?.signals.datacenter).toBe(false)
  })

  it('maps device detail and visitor history', async () => {
    mockGetEvent.mockResolvedValue(enrichedFixture())

    const result = await verifyFingerprint('pro-request-id', { visitorId: 'server-visitor' })

    expect(result?.details.osVersion).toBe('10.15.7')
    expect(result?.details.browserVersion).toBe('150.0.0')
    expect(result?.signals.visitorFound).toBe(false)
    expect(result?.details.firstSeenAt).toBeInstanceOf(Date)
  })

  it('keeps ML scores and velocity intervals', async () => {
    mockGetEvent.mockResolvedValue(enrichedFixture())

    const result = await verifyFingerprint('pro-request-id', { visitorId: 'server-visitor' })

    expect(result?.signals.tamperingDetail?.mlScore).toBe(0.0263)
    expect(result?.signals.tamperingDetail?.confidence).toBe('high')
    expect(result?.signals.suspectScore).toBe(0)
    expect(result?.signals.distinctIp?.twentyFourHours).toBe(2)
  })

  it('stores the event but drops the components dump', async () => {
    const fixture = enrichedFixture()
    ;(fixture.products.identification.data as Record<string, unknown>).components = {
      canvas: { value: 'huge' },
    }
    mockGetEvent.mockResolvedValue(fixture)

    const result = await verifyFingerprint('pro-request-id', { visitorId: 'server-visitor' })
    const raw = result?.rawEvent as {
      products: { identification: { data: Record<string, unknown> } }
    }

    expect(raw.products.identification.data.components).toBeUndefined()
    expect(raw.products.identification.data.visitorId).toBe('server-visitor')
    // The source object must not be mutated — it is the caller's event.
    expect(
      (fixture.products.identification.data as Record<string, unknown>).components,
    ).toBeDefined()
  })

  it('leaves every enriched field null when the products are absent', async () => {
    mockGetEvent.mockResolvedValue(eventFixture())

    const result = await verifyFingerprint('pro-request-id', { visitorId: 'server-visitor' })

    expect(result?.details.ipCity).toBeNull()
    expect(result?.details.asn).toBeNull()
    expect(result?.signals.suspectScore).toBeNull()
    expect(result?.signals.datacenter).toBeNull()
  })
})

describe('resolveFingerprint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FINGERPRINT_SERVER_API_KEY = 'secret'
  })

  afterEach(() => {
    delete process.env.FINGERPRINT_SERVER_API_KEY
  })

  it('classifies not_configured when no server key is set, without calling the API', async () => {
    delete process.env.FINGERPRINT_SERVER_API_KEY

    const result = await resolveFingerprint('req-1', { visitorId: 'client' })

    expect(result).toEqual({ verification: 'not_configured', verified: null })
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it('classifies unverifiable for a UUID-shaped requestId, without calling the API', async () => {
    const result = await resolveFingerprint(
      '123e4567-e89b-12d3-a456-426614174000',
      { visitorId: 'client' },
    )

    expect(result).toEqual({ verification: 'unverifiable', verified: null })
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it('classifies verified when the lookup succeeds for a non-UUID requestId', async () => {
    mockGetEvent.mockResolvedValue(eventFixture())

    const result = await resolveFingerprint('pro-request-id', { visitorId: 'server-visitor' })

    expect(result.verification).toBe('verified')
    expect(result.verified?.visitorId).toBe('server-visitor')
  })

  it('classifies unresolved when the lookup fails for a non-UUID requestId', async () => {
    mockGetEvent.mockRejectedValue(new Error('network down'))

    const result = await resolveFingerprint('pro-request-id', { visitorId: 'client' })

    expect(result).toEqual({ verification: 'unresolved', verified: null })
  })
})

describe('checkServerApiHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FINGERPRINT_SERVER_API_KEY = 'secret'
  })

  afterEach(() => {
    delete process.env.FINGERPRINT_SERVER_API_KEY
    delete process.env.FINGERPRINT_REGION
  })

  it('reports not_configured when the key is absent', async () => {
    delete process.env.FINGERPRINT_SERVER_API_KEY

    const health = await checkServerApiHealth()

    expect(health.status).toBe('not_configured')
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it('treats RequestNotFound as a healthy, authenticated key', async () => {
    mockGetEvent.mockRejectedValue(new MockRequestError(404, 'RequestNotFound'))

    const health = await checkServerApiHealth()

    expect(health.status).toBe('ok')
    expect(health.errorCode).toBe('RequestNotFound')
  })

  it('reports a rejected key', async () => {
    mockGetEvent.mockRejectedValue(new MockRequestError(403, 'TokenNotFound'))

    const health = await checkServerApiHealth()

    expect(health.status).toBe('error')
    expect(health.detail).toContain('Secret (Server API) key')
  })

  it('names a region mismatch and echoes the configured region', async () => {
    process.env.FINGERPRINT_REGION = 'Global'
    mockGetEvent.mockRejectedValue(new MockRequestError(403, 'WrongRegion'))

    const health = await checkServerApiHealth()

    expect(health.status).toBe('error')
    expect(health.errorCode).toBe('WrongRegion')
    expect(health.detail).toContain('Global')
  })

  it('never leaks the key in its result', async () => {
    process.env.FINGERPRINT_SERVER_API_KEY = 'super-secret-value'
    mockGetEvent.mockRejectedValue(new MockRequestError(403, 'TokenNotFound'))

    const health = await checkServerApiHealth()

    expect(JSON.stringify(health)).not.toContain('super-secret-value')
  })
})

describe('getCachedServerApiHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FINGERPRINT_SERVER_API_KEY = 'secret'
  })

  afterEach(() => {
    delete process.env.FINGERPRINT_SERVER_API_KEY
  })

  it('probes once and serves the cached result afterwards', async () => {
    mockGetEvent.mockRejectedValue(new MockRequestError(404, 'RequestNotFound'))

    const first = await getCachedServerApiHealth()
    const second = await getCachedServerApiHealth()

    expect(first.status).toBe('ok')
    expect(second).toEqual(first)
    // Second call served from cache — no additional API round-trip
    expect(mockGetEvent).toHaveBeenCalledTimes(1)
  })
})

describe('clampThreshold', () => {
  it('enforces the floor, ceiling, and integer rounding', () => {
    expect(clampThreshold(0)).toBe(MIN_FLAG_THRESHOLD)
    expect(clampThreshold(5)).toBe(MIN_FLAG_THRESHOLD)
    expect(clampThreshold(150)).toBe(100)
    expect(clampThreshold(70)).toBe(70)
    expect(clampThreshold(70.6)).toBe(71)
  })
})

describe('describeErrorCode', () => {
  it('falls back gracefully on unknown codes', () => {
    expect(describeErrorCode('SomethingNew')).toContain('Unrecognized')
  })
})

const NO_SIGNALS = {
  incognito: null,
  vpn: null,
  bot: null,
  tampered: null,
  replayed: null,
  confidence: null,
  stale: null,
  serverVerified: false,
} as const

describe('formatSignals', () => {
  it('omits signals the plan did not provide', () => {
    const out = formatSignals({ ...NO_SIGNALS, stale: false, serverVerified: true })

    expect(out).not.toContain('Incognito')
    expect(out).not.toContain('VPN')
    expect(out).not.toContain('confidence')
    // Derived from the event timestamp rather than a paid signal, so it is
    // reported whenever an event was actually resolved
    expect(out).toContain('replay window: no')
  })

  it('includes only the signals that are present', () => {
    const out = formatSignals({
      ...NO_SIGNALS,
      serverVerified: true,
      incognito: true,
      bot: false,
      confidence: 0.97,
      stale: false,
    })

    expect(out).toContain('Incognito/private browsing: yes')
    expect(out).toContain('Bot detected: no')
    expect(out).toContain('Identification confidence: 0.97')
    expect(out).not.toContain('VPN')
    expect(out).not.toContain('tampering')
  })

  it('omits the staleness line when no event was resolved', () => {
    // stale null means there was no identification event to age-check.
    // Printing "not stale" here would assert a clean result the API never gave.
    const out = formatSignals({ ...NO_SIGNALS, downgraded: true })

    expect(out).toBe('')
    expect(out).not.toContain('replay window')
  })

  it('never renders the locally-derived flags as server-observed', () => {
    const out = formatSignals({
      ...NO_SIGNALS,
      serverVerified: true,
      stale: false,
      downgraded: true,
      shapeAnomaly: true,
    })

    expect(out).not.toContain('downgraded')
    expect(out).not.toContain('shape check')
  })
})

describe('ipDistanceKm', () => {
  it('returns null unless both sides resolved coordinates', () => {
    expect(ipDistanceKm({ lat: 30.26, lon: -97.74 }, { lat: null, lon: null })).toBeNull()
    expect(ipDistanceKm({ lat: null, lon: null }, { lat: 52.37, lon: 4.89 })).toBeNull()
  })

  it('measures a known distance', () => {
    // Austin to Amsterdam is roughly 8,300km great-circle.
    const km = ipDistanceKm({ lat: 30.2671, lon: -97.7431 }, { lat: 52.3676, lon: 4.9041 })
    expect(km).toBeGreaterThan(8000)
    expect(km).toBeLessThan(8600)
  })

  it('returns zero for the same point', () => {
    expect(ipDistanceKm({ lat: 30.26, lon: -97.74 }, { lat: 30.26, lon: -97.74 })).toBe(0)
  })
})

describe('formatLocation / formatNetwork', () => {
  it('renders what resolved and nothing more', () => {
    expect(
      formatLocation({ ipCity: 'Austin', ipSubdivision: 'Texas', ipCountry: 'United States', ipAccuracyRadius: 20 }),
    ).toBe('Austin, Texas, United States (±20km)')
    expect(formatNetwork({ asn: '16591', asnName: 'Google Fiber Inc.', asnType: 'isp' })).toBe(
      'Google Fiber Inc. (AS16591, isp)',
    )
  })

  it('returns null rather than a string of unknowns when nothing resolved', () => {
    expect(formatLocation({})).toBeNull()
    expect(formatNetwork({})).toBeNull()
  })
})

describe('formatSignals enrichment', () => {
  it('reports the ML score beside the verdict, since a near-miss reads as a pass without it', () => {
    const out = formatSignals({
      ...NO_SIGNALS,
      serverVerified: true,
      stale: false,
      tamperingDetail: { result: false, confidence: 'high', mlScore: 0.94 },
    })

    expect(out).toContain('0.94')
    expect(out).toContain('high confidence')
  })

  it('renders velocity counters per interval', () => {
    const out = formatSignals({
      ...NO_SIGNALS,
      serverVerified: true,
      stale: false,
      distinctCountry: { fiveMinutes: 1, oneHour: 3, twentyFourHours: null },
    })

    expect(out).toContain('1 in 5min')
    expect(out).toContain('3 in 1hr')
    // Omitted above 20k events, so absence is a cap and must not read as zero
    expect(out).not.toContain('24hr')
  })

  it('omits a scored signal entirely when the product returned nothing', () => {
    const out = formatSignals({
      ...NO_SIGNALS,
      serverVerified: true,
      stale: false,
      vpnDetail: { result: null, confidence: null, mlScore: null },
    })

    expect(out).not.toContain('VPN')
  })
})

describe('formatDerivedSignals', () => {
  it('always pairs distance with its uncertainty', () => {
    const out = formatDerivedSignals({
      ...NO_SIGNALS,
      ipDistanceKm: 12,
      ipDistanceUncertaintyKm: 40,
    })

    // 12km inside a 40km combined radius is not movement, and the model must be
    // told so rather than left to infer travel from a bare number.
    expect(out).toContain('12 km')
    expect(out).toContain('40 km')
    expect(out).toContain('not evidence of movement')
  })

  it('reports the distance bare when the uncertainty is unknown', () => {
    const out = formatDerivedSignals({
      ...NO_SIGNALS,
      ipDistanceKm: 12,
      ipDistanceUncertaintyKm: null,
    })

    // No radius clause at all rather than one claiming 0 km of uncertainty,
    // which would read as perfect precision.
    expect(out).toContain('12 km')
    expect(out).not.toContain('accuracy radius')
  })

  it('renders only the flags this app worked out for itself', () => {
    const out = formatDerivedSignals({
      ...NO_SIGNALS,
      serverVerified: true,
      stale: false,
      incognito: true,
      downgraded: true,
      shapeAnomaly: false,
    })

    expect(out).toContain('Verification downgraded from established session: yes')
    expect(out).toContain('Client-reported component failed its shape check: no')
    expect(out).not.toContain('Incognito')
    expect(out).not.toContain('replay window')
  })

  it('returns empty when there is nothing derived to report', () => {
    expect(formatDerivedSignals({ ...NO_SIGNALS, serverVerified: true, stale: false })).toBe('')
  })
})
