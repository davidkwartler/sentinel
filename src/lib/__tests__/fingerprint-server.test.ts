import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockGetEvent } = vi.hoisted(() => ({ mockGetEvent: vi.fn() }))

vi.mock('@fingerprintjs/fingerprintjs-pro-server-api', () => ({
  FingerprintJsServerApiClient: class {
    getEvent = mockGetEvent
  },
  Region: { Global: 'Global', EU: 'EU', AP: 'AP' },
}))

import { verifyFingerprint, formatSignals } from '../fingerprint-server'

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

describe('formatSignals', () => {
  it('renders unknown for null signals', () => {
    const out = formatSignals({
      incognito: null,
      vpn: null,
      bot: null,
      tampered: null,
      replayed: null,
      confidence: null,
      stale: false,
    })

    expect(out).toContain('Incognito/private browsing: unknown')
    expect(out).toContain('Identification confidence: unknown')
  })
})
