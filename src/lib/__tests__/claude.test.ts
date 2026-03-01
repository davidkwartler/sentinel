import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Anthropic SDK
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

import { prismaMock } from '../__mocks__/db'
import { analyzeDetectionEvent } from '../claude'

describe('analyzeDetectionEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early when event is not found', async () => {
    prismaMock.detectionEvent.findUnique.mockResolvedValue(null)

    await analyzeDetectionEvent('nonexistent-id')

    expect(mockCreate).not.toHaveBeenCalled()
    expect(prismaMock.detectionEvent.update).not.toHaveBeenCalled()
  })

  it('calls Claude and updates event to FLAGGED when confidence >= 70', async () => {
    prismaMock.detectionEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      createdAt: new Date(),
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-new',
      originalIp: '1.2.3.4',
      newIp: '9.9.9.9',
      similarityScore: 0.0,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
      session: {
        id: 'sess-1',
        fingerprints: [
          {
            visitorId: 'fp-original',
            ip: '1.2.3.4',
            os: 'Mac OS',
            browser: 'Chrome',
            screenRes: '1920x1080',
            timezone: 'America/New_York',
            userAgent: 'Mozilla/5.0',
            isOriginal: true,
            createdAt: new Date(),
          },
          {
            visitorId: 'fp-new',
            ip: '9.9.9.9',
            os: 'Windows',
            browser: 'Firefox',
            screenRes: '1366x768',
            timezone: 'Europe/London',
            userAgent: 'Mozilla/5.0',
            isOriginal: false,
            createdAt: new Date(),
          },
        ],
      },
    } as any)

    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            confidenceScore: 92,
            reasoning: '• Different OS, browser, screen resolution, and timezone indicate a different device.',
          }),
        },
      ],
    })

    prismaMock.detectionEvent.update.mockResolvedValue({} as any)

    await analyzeDetectionEvent('event-1')

    expect(mockCreate).toHaveBeenCalledOnce()
    expect(prismaMock.detectionEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        confidenceScore: 92,
        reasoning: expect.stringContaining('Different OS'),
        status: 'FLAGGED',
      },
    })
  })

  it('updates event to CLEAR when confidence < 70', async () => {
    prismaMock.detectionEvent.findUnique.mockResolvedValue({
      id: 'event-2',
      createdAt: new Date(),
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-incognito',
      originalIp: '1.2.3.4',
      newIp: '1.2.3.4',
      similarityScore: 0.75,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
      session: {
        id: 'sess-1',
        fingerprints: [
          {
            visitorId: 'fp-original',
            ip: '1.2.3.4',
            os: 'Mac OS',
            browser: 'Chrome',
            screenRes: '1920x1080',
            timezone: 'America/New_York',
            userAgent: 'Mozilla/5.0',
            isOriginal: true,
            createdAt: new Date(),
          },
          {
            visitorId: 'fp-incognito',
            ip: '1.2.3.4',
            os: 'Mac OS',
            browser: 'Chrome',
            screenRes: '1920x1080',
            timezone: 'America/New_York',
            userAgent: 'Mozilla/5.0',
            isOriginal: false,
            createdAt: new Date(),
          },
        ],
      },
    } as any)

    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            confidenceScore: 25,
            reasoning: '• Same device characteristics, likely incognito browsing.',
          }),
        },
      ],
    })

    prismaMock.detectionEvent.update.mockResolvedValue({} as any)

    await analyzeDetectionEvent('event-2')

    expect(prismaMock.detectionEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-2' },
      data: {
        confidenceScore: 25,
        reasoning: expect.any(String),
        status: 'CLEAR',
      },
    })
  })

  it('uses modelOverride when provided', async () => {
    prismaMock.detectionEvent.findUnique.mockResolvedValue({
      id: 'event-3',
      createdAt: new Date(),
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-new',
      originalIp: '1.2.3.4',
      newIp: '9.9.9.9',
      similarityScore: 0.0,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
      session: {
        id: 'sess-1',
        fingerprints: [
          {
            visitorId: 'fp-original',
            ip: '1.2.3.4',
            os: null,
            browser: null,
            screenRes: null,
            timezone: null,
            userAgent: null,
            isOriginal: true,
            createdAt: new Date(),
          },
        ],
      },
    } as any)

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ confidenceScore: 50, reasoning: 'test' }) }],
    })
    prismaMock.detectionEvent.update.mockResolvedValue({} as any)

    await analyzeDetectionEvent('event-3', 'claude-opus-4-6')

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-6' }),
    )
  })

  it('throws when Claude returns unexpected content type', async () => {
    prismaMock.detectionEvent.findUnique.mockResolvedValue({
      id: 'event-4',
      createdAt: new Date(),
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-new',
      originalIp: null,
      newIp: null,
      similarityScore: 0.0,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
      session: {
        id: 'sess-1',
        fingerprints: [],
      },
    } as any)

    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'tool-1', name: 'test', input: {} }],
    })

    await expect(analyzeDetectionEvent('event-4')).rejects.toThrow(
      'Unexpected Claude response type',
    )
  })
})
