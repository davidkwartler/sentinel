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
  formatSignals,
  checkServerApiHealth,
  describeErrorCode,
} from '../fingerprint-server'

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

describe('describeErrorCode', () => {
  it('falls back gracefully on unknown codes', () => {
    expect(describeErrorCode('SomethingNew')).toContain('Unrecognized')
  })
})

describe('formatSignals', () => {
  it('omits signals the plan did not provide', () => {
    const out = formatSignals({
      incognito: null,
      vpn: null,
      bot: null,
      tampered: null,
      replayed: null,
      confidence: null,
      stale: false,
    })

    expect(out).not.toContain('Incognito')
    expect(out).not.toContain('VPN')
    expect(out).not.toContain('confidence')
    // Staleness is derived locally, so it is always reported
    expect(out).toContain('replay window: no')
  })

  it('includes only the signals that are present', () => {
    const out = formatSignals({
      incognito: true,
      vpn: null,
      bot: false,
      tampered: null,
      replayed: null,
      confidence: 0.97,
      stale: false,
    })

    expect(out).toContain('Incognito/private browsing: yes')
    expect(out).toContain('Bot detected: no')
    expect(out).toContain('Identification confidence: 0.97')
    expect(out).not.toContain('VPN')
    expect(out).not.toContain('tampering')
  })
})
