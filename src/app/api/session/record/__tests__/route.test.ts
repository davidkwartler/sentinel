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

// prismaMock import triggers vi.mock('@/lib/db') via the __mocks__/db.ts auto-hoist
import { prismaMock } from '@/lib/__mocks__/db'
import { POST } from '../route'
import { auth } from '@/lib/auth'
import { runDetection } from '@/lib/detection'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/session/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/session/record', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    prismaMock.session.findFirst.mockResolvedValue({
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
    prismaMock.session.findFirst.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue({
      id: 'fp-existing',
      sessionId: 'sess-1',
      visitorId: 'fp-original',
      requestId: 'req-1',
      ip: null,
      userAgent: null,
      os: null,
      browser: null,
      screenRes: null,
      timezone: null,
      isOriginal: true,
      createdAt: new Date(),
    })

    const request = makeRequest({ visitorId: 'fp-1', requestId: 'req-1' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('duplicate')
    expect(body.id).toBe('fp-existing')
  })

  it('returns 404 when no database session exists for user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findFirst.mockResolvedValue(null)

    const request = makeRequest({ visitorId: 'fp-1', requestId: 'req-1' })
    const response = await POST(request)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Session not found')
  })

  it('creates fingerprint and returns ok with detected:false on first visit', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findFirst.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue(null) // no duplicate
    prismaMock.fingerprint.findFirst.mockResolvedValue(null) // no existing = isOriginal
    prismaMock.fingerprint.create.mockResolvedValue({
      id: 'fp-new',
      sessionId: 'sess-1',
      visitorId: 'fp-1',
      requestId: 'req-1',
      ip: null,
      userAgent: null,
      os: 'Mac OS',
      browser: 'Chrome',
      screenRes: '1920x1080',
      timezone: 'America/New_York',
      isOriginal: true,
      createdAt: new Date(),
    })
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
        }),
      }),
    )
  })

  it('marks subsequent fingerprints as non-original', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' }, expires: '' } as any)
    prismaMock.session.findFirst.mockResolvedValue({
      id: 'sess-1',
      sessionToken: 'tok',
      userId: 'user-1',
      expires: new Date(Date.now() + 3600000),
    })
    prismaMock.fingerprint.findUnique.mockResolvedValue(null)
    prismaMock.fingerprint.findFirst.mockResolvedValue({ id: 'fp-existing' } as any) // has existing
    prismaMock.fingerprint.create.mockResolvedValue({
      id: 'fp-second',
      sessionId: 'sess-1',
      visitorId: 'fp-2',
      requestId: 'req-2',
      ip: null,
      userAgent: null,
      os: null,
      browser: null,
      screenRes: null,
      timezone: null,
      isOriginal: false,
      createdAt: new Date(),
    })
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
})
