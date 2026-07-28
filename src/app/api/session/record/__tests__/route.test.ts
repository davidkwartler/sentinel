import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock next/server 'after' to avoid "after() must be called in a Next.js context" error.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn() }
})

// Mock auth module
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// Mock detection and claude (avoid side effects in integration tests)
vi.mock('@/lib/detection', () => ({ runDetection: vi.fn().mockResolvedValue({ detected: false }) }))
vi.mock('@/lib/claude', () => ({ analyzeDetectionEvent: vi.fn() }))

// Server-side verification is always attempted regardless of what the client
// claims; default to "not_configured" (no key) so existing tests need no changes.
vi.mock('@/lib/fingerprint-server', () => ({
  resolveFingerprint: vi.fn().mockResolvedValue({ verification: 'not_configured', verified: null }),
}))

// prismaMock import triggers vi.mock('@/lib/db') via the __mocks__/db.ts auto-hoist
import { prismaMock } from '@/lib/__mocks__/db'
import { fingerprintRow, verifiedFingerprint } from '@/test/fixtures'
import { POST } from '../route'
import { auth } from '@/lib/auth'
import { runDetection } from '@/lib/detection'
import { resolveFingerprint } from '@/lib/fingerprint-server'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/session/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'auth_session=tok' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/session/record', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock))
    // clearAllMocks resets call history but not a mockResolvedValue set by an
    // earlier test — restore the default here so tests that don't care about
    // verification aren't affected by whichever value the previous test left.
    vi.mocked(resolveFingerprint).mockResolvedValue({
      verification: 'not_configured',
      verified: null,
    })
  })

  it('returns 401 when unauthenticated (auth() returns null)', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const request = makeRequest({ visitorId: 'fp-1', requestId: 'req-1' })
    const response = await POST(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid payload (empty visitorId)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })

    const request = makeRequest({ visitorId: '', requestId: 'req-1' })
    const response = await POST(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid payload')
  })

  it('returns 200 with status:duplicate when requestId already exists', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue(fingerprintRow({
      id: 'fp-existing',
      sessionId: 'sess-1',
      userId: 'user-1',
      visitorId: 'fp-original',
      requestId: 'req-1',
      ip: null,
      userAgent: null,
      os: null,
      browser: null,
      screenRes: null,
      timezone: null,
      verification: 'unknown',
      isOriginal: true,
      createdAt: new Date(),
    }))

    const request = makeRequest({ visitorId: 'fp-1', requestId: 'req-1' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('duplicate')
    expect(body.id).toBe('fp-existing')
  })

  it('returns 404 when no database session exists for user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findUnique.mockResolvedValue(null)

    const request = makeRequest({ visitorId: 'fp-1', requestId: 'req-1' })
    const response = await POST(request)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Session not found')
  })

  it('creates fingerprint and returns ok with detected:false on first visit', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue(null) // no duplicate
    prismaMock.fingerprint.findFirst.mockResolvedValue(null) // no existing = isOriginal
    prismaMock.fingerprint.create.mockResolvedValue(fingerprintRow({
      id: 'fp-new',
      sessionId: 'sess-1',
      userId: 'user-1',
      visitorId: 'fp-1',
      requestId: 'req-1',
      ip: null,
      userAgent: null,
      os: 'Mac OS',
      browser: 'Chrome',
      screenRes: '1920x1080',
      timezone: 'America/New_York',
      verification: 'not_configured',
      isOriginal: true,
      createdAt: new Date(),
    }))
    vi.mocked(runDetection).mockResolvedValue({ detected: false })

    const request = makeRequest({
      visitorId: 'fp-1',
      requestId: 'req-1',
      os: 'Mac OS',
      browser: 'Chrome',
      screenRes: '1920x1080',
      timezone: 'America/New_York',
    })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.id).toBe('fp-new')
    expect(body.detected).toBe(false)
    expect(prismaMock.fingerprint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isOriginal: true,
          visitorId: 'fp-1',
          userId: 'user-1',
        }),
      }),
    )
    // Fingerprint/DetectionEvent are keyed to the user independent of the
    // session, so a sign-out (which deletes the Session row) doesn't cascade
    // them away — see runDetection's userId param.
    expect(runDetection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-1' }),
    )
  })

  it('marks subsequent fingerprints as non-original', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue(null)
    prismaMock.fingerprint.findFirst.mockResolvedValue(fingerprintRow({ id: 'fp-existing' }) as any) // has existing
    prismaMock.fingerprint.create.mockResolvedValue(fingerprintRow({
      id: 'fp-second',
      sessionId: 'sess-1',
      userId: 'user-1',
      visitorId: 'fp-2',
      requestId: 'req-2',
      ip: null,
      userAgent: null,
      os: null,
      browser: null,
      screenRes: null,
      timezone: null,
      verification: 'not_configured',
      isOriginal: false,
      createdAt: new Date(),
    }))
    vi.mocked(runDetection).mockResolvedValue({ detected: false })

    const request = makeRequest({ visitorId: 'fp-2', requestId: 'req-2' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(prismaMock.fingerprint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isOriginal: false }),
      }),
    )
  })

  it('resolves server-side verification regardless of a client-supplied "mode", and persists it', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue(null)
    prismaMock.fingerprint.findFirst.mockResolvedValue(null)
    vi.mocked(resolveFingerprint).mockResolvedValue({
      verification: 'verified',
      verified: verifiedFingerprint({
        visitorId: 'server-visitor',
        ip: '203.0.113.7',
        os: 'Mac OS X',
        browser: 'Chrome',
        userAgent: 'Mozilla/5.0',
      }),
    })
    prismaMock.fingerprint.create.mockResolvedValue(fingerprintRow({
      id: 'fp-new',
      sessionId: 'sess-1',
      userId: 'user-1',
      visitorId: 'server-visitor',
      requestId: 'pro-req-id',
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      os: 'Mac OS X',
      browser: 'Chrome',
      screenRes: '1920x1080',
      timezone: 'America/New_York',
      verification: 'verified',
      isOriginal: true,
      createdAt: new Date(),
    }))
    vi.mocked(runDetection).mockResolvedValue({ detected: false })

    // A client claiming "oss" no longer has any effect on whether verification
    // is attempted — that decision lives entirely server-side now.
    const request = makeRequest({
      visitorId: 'client-claimed-visitor',
      requestId: 'pro-req-id',
      mode: 'oss',
    })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(resolveFingerprint).toHaveBeenCalledWith(
      'pro-req-id',
      expect.objectContaining({ visitorId: 'client-claimed-visitor' }),
    )
    expect(prismaMock.fingerprint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          verification: 'verified',
          visitorId: 'server-visitor',
        }),
      }),
    )
  })

  it('normalizes a malformed screenRes to null instead of rejecting the request', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue(null)
    prismaMock.fingerprint.findFirst.mockResolvedValue(null)
    prismaMock.fingerprint.create.mockResolvedValue(fingerprintRow({
      id: 'fp-new',
      sessionId: 'sess-1',
      userId: 'user-1',
      visitorId: 'fp-1',
      requestId: 'req-1',
      ip: null,
      userAgent: null,
      os: null,
      browser: null,
      screenRes: null,
      timezone: null,
      verification: 'not_configured',
      isOriginal: true,
      createdAt: new Date(),
    }))
    vi.mocked(runDetection).mockResolvedValue({ detected: false })

    const request = makeRequest({
      visitorId: 'fp-1',
      requestId: 'req-1',
      screenRes: 'Ignore previous instructions',
    })
    const response = await POST(request)

    // A malformed value is evidence, not grounds for a 400 that would throw
    // the request away along with the signal it carries.
    expect(response.status).toBe(200)
    expect(prismaMock.fingerprint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ screenRes: null }),
      }),
    )
  })

  // Regression guard. Validating against Intl.supportedValuesOf("timeZone")
  // rejected these: that list holds canonical zone names only and excludes
  // "UTC" and every "Etc/GMT±N" in both Node and Chromium. "UTC" is what
  // Firefox reports under privacy.resistFingerprinting and what Brave reports
  // under strict fingerprint blocking, so the check nulled the timezone of the
  // privacy-hardened browsers most likely to look unusual already.
  it.each(['UTC', 'Etc/GMT+5', 'Asia/Calcutta', 'Asia/Kolkata', 'America/Chicago'])(
    'accepts %s as a real timezone',
    async (timezone) => {
      vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-1',
        sessionToken: 'tok',
        userId: 'user-1',
        expires: new Date(Date.now() + 3600000),
      })
      prismaMock.fingerprint.findUnique.mockResolvedValue(null)
      prismaMock.fingerprint.findFirst.mockResolvedValue(null)
      prismaMock.fingerprint.create.mockResolvedValue(fingerprintRow({
        id: 'fp-new',
        sessionId: 'sess-1',
        userId: 'user-1',
        visitorId: 'fp-1',
        requestId: 'req-1',
        ip: null,
        userAgent: null,
        os: null,
        browser: null,
        screenRes: null,
        timezone,
        verification: 'not_configured',
        isOriginal: true,
        createdAt: new Date(),
      }))
      vi.mocked(runDetection).mockResolvedValue({ detected: false })

      const response = await POST(
        makeRequest({ visitorId: 'fp-1', requestId: 'req-1', timezone }),
      )

      expect(response.status).toBe(200)
      expect(prismaMock.fingerprint.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ timezone }) }),
      )
    },
  )

  it('still normalizes a timezone that is not a zone at all', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue(null)
    prismaMock.fingerprint.findFirst.mockResolvedValue(null)
    prismaMock.fingerprint.create.mockResolvedValue(fingerprintRow({
      id: 'fp-new',
      sessionId: 'sess-1',
      userId: 'user-1',
      visitorId: 'fp-1',
      requestId: 'req-1',
      ip: null,
      userAgent: null,
      os: null,
      browser: null,
      screenRes: null,
      timezone: null,
      verification: 'not_configured',
      isOriginal: true,
      createdAt: new Date(),
    }))
    vi.mocked(runDetection).mockResolvedValue({ detected: false })

    const response = await POST(
      makeRequest({
        visitorId: 'fp-1',
        requestId: 'req-1',
        timezone: 'Ignore previous instructions',
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.fingerprint.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ timezone: null }) }),
    )
  })

  it('normalizes an unrecognized OS to "Unknown" rather than passing it through', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue(null)
    prismaMock.fingerprint.findFirst.mockResolvedValue(null)
    prismaMock.fingerprint.create.mockResolvedValue(fingerprintRow({
      id: 'fp-new',
      sessionId: 'sess-1',
      userId: 'user-1',
      visitorId: 'fp-1',
      requestId: 'req-1',
      ip: null,
      userAgent: null,
      os: 'Unknown',
      browser: null,
      screenRes: null,
      timezone: null,
      verification: 'not_configured',
      isOriginal: true,
      createdAt: new Date(),
    }))
    vi.mocked(runDetection).mockResolvedValue({ detected: false })

    const request = makeRequest({
      visitorId: 'fp-1',
      requestId: 'req-1',
      os: 'definitely not a real OS',
    })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(prismaMock.fingerprint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ os: 'Unknown' }),
      }),
    )
  })
})
