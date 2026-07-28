import { describe, it, expect } from 'vitest'
import { prismaMock } from '../__mocks__/db'
import { computeSimilarity, runDetection } from '../detection'
import { fingerprintRow, detectionEventRow } from '@/test/fixtures'

describe('computeSimilarity', () => {
  it('returns 1.0 when all four components match', () => {
    const result = computeSimilarity(
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' },
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' }
    )
    expect(result).toBeCloseTo(1.0)
  })

  it('returns 0.0 when all four components differ', () => {
    const result = computeSimilarity(
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' },
      { os: 'Windows', browser: 'Firefox', screenRes: '1366x768', timezone: 'Europe/London' }
    )
    expect(result).toBeCloseTo(0.0)
  })

  it('treats both-null as a match (contributes 0.25 per null-null field)', () => {
    const result = computeSimilarity({}, {})
    expect(result).toBeCloseTo(1.0)
  })

  it('treats one-side-null as inconclusive (no bonus, no penalty)', () => {
    const result = computeSimilarity(
      { os: 'Mac OS', browser: null, screenRes: null, timezone: null },
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'America/New_York' }
    )
    expect(result).toBeCloseTo(0.25)
  })

  it('is case-insensitive and trims whitespace', () => {
    const result = computeSimilarity(
      { os: '  Mac OS  ' },
      { os: 'mac os' }
    )
    expect(result).toBeCloseTo(1.0)
  })

  it('returns 0.5 for exactly two matching fields out of four', () => {
    const result = computeSimilarity(
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1920x1080', timezone: 'UTC' },
      { os: 'Mac OS', browser: 'Chrome', screenRes: '1366x768', timezone: 'Europe/London' }
    )
    expect(result).toBeCloseTo(0.5)
  })
})

describe('runDetection', () => {
  it('returns detected:false when no original fingerprint exists', async () => {
    prismaMock.fingerprint.findFirst.mockResolvedValue(null)

    const result = await runDetection(prismaMock, {
      sessionId: 'sess-1',
      userId: 'user-1',
      newVisitorId: 'fp-new',
      newIp: '1.2.3.4',
    })
    expect(result.detected).toBe(false)
  })

  it('returns detected:false when visitorId matches original', async () => {
    prismaMock.fingerprint.findFirst.mockResolvedValue(fingerprintRow({
      id: 'fp-1',
      visitorId: 'fp-same',
      sessionId: 'sess-1',
      userId: 'user-1',
      requestId: 'req-1',
      ip: '1.2.3.4',
      userAgent: null,
      os: null,
      browser: null,
      screenRes: null,
      timezone: null,
      verification: 'unknown',
      isOriginal: true,
      createdAt: new Date(),
    }))

    const result = await runDetection(prismaMock, {
      sessionId: 'sess-1',
      userId: 'user-1',
      newVisitorId: 'fp-same',
      newIp: '1.2.3.4',
    })
    expect(result.detected).toBe(false)
  })

  it('returns detected:true and creates DetectionEvent on visitorId mismatch', async () => {
    prismaMock.fingerprint.findFirst.mockResolvedValue(fingerprintRow({
      id: 'fp-1',
      visitorId: 'fp-original',
      sessionId: 'sess-1',
      userId: 'user-1',
      requestId: 'req-1',
      ip: '1.2.3.4',
      userAgent: null,
      os: 'Mac OS',
      browser: 'Chrome',
      screenRes: '1920x1080',
      timezone: 'America/New_York',
      verification: 'unknown',
      isOriginal: true,
      createdAt: new Date(),
    }))
    prismaMock.detectionEvent.create.mockResolvedValue(detectionEventRow({
      id: 'event-1',
      createdAt: new Date(),
      userId: 'user-1',
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-new',
      originalIp: '1.2.3.4',
      newIp: '9.9.9.9',
      originalOs: 'Mac OS',
      originalBrowser: 'Chrome',
      originalScreenRes: '1920x1080',
      originalTimezone: 'America/New_York',
      originalUserAgent: null,
      newOs: 'Windows',
      newBrowser: 'Firefox',
      newScreenRes: '1366x768',
      newTimezone: 'Europe/London',
      newUserAgent: null,
      similarityScore: 0.0,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
    }))

    const result = await runDetection(prismaMock, {
      sessionId: 'sess-1',
      userId: 'user-1',
      newVisitorId: 'fp-new',
      newIp: '9.9.9.9',
      os: 'Windows',
      browser: 'Firefox',
      screenRes: '1366x768',
      timezone: 'Europe/London',
    })

    expect(result.detected).toBe(true)
    expect(result.eventId).toBe('event-1')
    expect(prismaMock.detectionEvent.create).toHaveBeenCalledOnce()
  })

  it('flags downgraded:true when the original was verified and the new one is not', async () => {
    prismaMock.fingerprint.findFirst.mockResolvedValue(fingerprintRow({
      id: 'fp-1',
      visitorId: 'fp-original',
      sessionId: 'sess-1',
      userId: 'user-1',
      requestId: 'req-1',
      ip: '1.2.3.4',
      userAgent: null,
      os: 'Mac OS',
      browser: 'Chrome',
      screenRes: '1920x1080',
      timezone: 'America/New_York',
      verification: 'verified',
      isOriginal: true,
      createdAt: new Date(),
    }))
    prismaMock.detectionEvent.create.mockResolvedValue(detectionEventRow({
      id: 'event-2',
      createdAt: new Date(),
      userId: 'user-1',
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-new',
      originalIp: '1.2.3.4',
      newIp: '9.9.9.9',
      originalOs: 'Mac OS',
      originalBrowser: 'Chrome',
      originalScreenRes: '1920x1080',
      originalTimezone: 'America/New_York',
      originalUserAgent: null,
      newOs: null,
      newBrowser: null,
      newScreenRes: null,
      newTimezone: null,
      newUserAgent: null,
      similarityScore: 0.0,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
    }))

    const result = await runDetection(prismaMock, {
      sessionId: 'sess-1',
      userId: 'user-1',
      newVisitorId: 'fp-new',
      newIp: '9.9.9.9',
      verification: 'unverifiable',
    })

    expect(result.downgraded).toBe(true)
  })

  it('does not flag downgraded when the original was never verified', async () => {
    prismaMock.fingerprint.findFirst.mockResolvedValue(fingerprintRow({
      id: 'fp-1',
      visitorId: 'fp-original',
      sessionId: 'sess-1',
      userId: 'user-1',
      requestId: 'req-1',
      ip: '1.2.3.4',
      userAgent: null,
      os: null,
      browser: null,
      screenRes: null,
      timezone: null,
      verification: 'not_configured',
      isOriginal: true,
      createdAt: new Date(),
    }))
    prismaMock.detectionEvent.create.mockResolvedValue(detectionEventRow({
      id: 'event-3',
      createdAt: new Date(),
      userId: 'user-1',
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-new',
      originalIp: '1.2.3.4',
      newIp: '9.9.9.9',
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
      similarityScore: 0.0,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
    }))

    const result = await runDetection(prismaMock, {
      sessionId: 'sess-1',
      userId: 'user-1',
      newVisitorId: 'fp-new',
      newIp: '9.9.9.9',
      verification: 'unverifiable',
    })

    expect(result.downgraded).toBe(false)
  })

  describe('impossible travel', () => {
    function mockPair(original: Parameters<typeof fingerprintRow>[0]) {
      prismaMock.fingerprint.findFirst.mockResolvedValue(
        fingerprintRow({ visitorId: 'fp-original', ...original }),
      )
      prismaMock.detectionEvent.create.mockResolvedValue(
        detectionEventRow({ id: 'event-travel' }),
      )
    }

    it('reports the distance with the summed accuracy radii', async () => {
      mockPair({ ipLatitude: 30.2671, ipLongitude: -97.7431, ipAccuracyRadius: 20 })

      const result = await runDetection(prismaMock, {
        sessionId: 'sess-1',
        userId: 'user-1',
        newVisitorId: 'fp-new',
        newIp: '9.9.9.9',
        ipLatitude: 52.3676,
        ipLongitude: 4.9041,
        ipAccuracyRadius: 50,
      })

      expect(result.ipDistanceKm).toBeGreaterThan(8000)
      expect(result.ipDistanceUncertaintyKm).toBe(70)
    })

    it('reports no uncertainty rather than zero when a radius is missing', async () => {
      // 0 would read as perfect precision and turn any distance into travel.
      mockPair({ ipLatitude: 30.2671, ipLongitude: -97.7431, ipAccuracyRadius: null })

      const result = await runDetection(prismaMock, {
        sessionId: 'sess-1',
        userId: 'user-1',
        newVisitorId: 'fp-new',
        newIp: '9.9.9.9',
        ipLatitude: 30.3,
        ipLongitude: -97.8,
        ipAccuracyRadius: 20,
      })

      expect(result.ipDistanceKm).not.toBeNull()
      expect(result.ipDistanceUncertaintyKm).toBeNull()
    })

    it('leaves both null when only one side resolved coordinates', async () => {
      mockPair({ ipLatitude: null, ipLongitude: null, ipAccuracyRadius: null })

      const result = await runDetection(prismaMock, {
        sessionId: 'sess-1',
        userId: 'user-1',
        newVisitorId: 'fp-new',
        newIp: '9.9.9.9',
        ipLatitude: 52.3676,
        ipLongitude: 4.9041,
        ipAccuracyRadius: 50,
      })

      expect(result.ipDistanceKm).toBeNull()
      expect(result.ipDistanceUncertaintyKm).toBeNull()
    })
  })
})
