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
import { detectionEventRow } from '@/test/fixtures'
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
      originalUserAgent: 'Mozilla/5.0',
      newOs: 'Windows',
      newBrowser: 'Firefox',
      newScreenRes: '1366x768',
      newTimezone: 'Europe/London',
      newUserAgent: 'Mozilla/5.0',
      similarityScore: 0.0,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
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
    // The prompt should carry the denormalized components straight off the
    // event — no session/fingerprint join involved.
    const promptContent = mockCreate.mock.calls[0][0].messages[0].content
    expect(promptContent).toContain('OS: Mac OS')
    expect(promptContent).toContain('OS: Windows')
    expect(prismaMock.detectionEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        confidenceScore: 92,
        reasoning: expect.stringContaining('Different OS'),
        status: 'FLAGGED',
      },
    })
  })

  it('never offers incognito as the explanation for a changed visitor ID', async () => {
    // `incognito` is not on the Fingerprint plan — confirmed against a stored
    // rawEvent from a live Server API capture, which carried nineteen products
    // with no `incognito` key. The signal therefore never reaches the prompt.
    //
    // Guidance that reaches for it as a *cause* is worse than useless: it tells
    // the model to explain away a changed visitor ID using evidence it can never
    // receive, and that error runs toward under-flagging — a real hijack read as
    // benign private browsing, the wrong direction for a hijack detector.
    prismaMock.detectionEvent.findUnique.mockResolvedValue(
      detectionEventRow({ id: 'event-1', originalOs: 'Mac OS', newOs: 'Mac OS' }) as any,
    )
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ confidenceScore: 10, reasoning: '• benign' }) }],
    })
    prismaMock.detectionEvent.update.mockResolvedValue({} as any)

    await analyzeDetectionEvent('event-1')

    const system = mockCreate.mock.calls[0][0].system
    // Assert on the word, not on the two phrasings that happened to carry the
    // problem. A narrower matcher passed while the SERVER-VERIFIED block still
    // told the model that "Incognito = yes largely explains a changed visitor
    // ID ... lower the score substantially" — the same instruction in a
    // different sentence.
    expect(system).not.toMatch(/incognito/i)
    // The observable pattern must still be described, just without naming a
    // cause this plan cannot measure.
    expect(system).toMatch(/fresh browser state/i)
  })

  it('subordinates the impossible-travel rule to the tor signal', async () => {
    // These two instructions describe the same number and pull opposite ways:
    // the Tor bullet says geolocation and distance describe the exit node and
    // must be discounted, while the derived-signals bullet calls a large
    // distance over a short interval decisive. A Tor circuit is routinely a
    // transatlantic hop, so left unqualified the second one manufactures
    // impossible travel out of every Tor session. Precedence has to be stated
    // where the conflict is, not inferred from block ordering.
    prismaMock.detectionEvent.findUnique.mockResolvedValue(
      detectionEventRow({ id: 'event-1' }) as any,
    )
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ confidenceScore: 10, reasoning: '• benign' }) }],
    })
    prismaMock.detectionEvent.update.mockResolvedValue({} as any)

    await analyzeDetectionEvent('event-1')

    const system = mockCreate.mock.calls[0][0].system
    const distanceRule = system.slice(system.indexOf('Distance between the two IP locations'))
    expect(distanceRule).toMatch(/is decisive[^.]*EXCEPT[^.]*Tor exit node/i)
  })

  it('updates event to CLEAR when confidence < 70', async () => {
    prismaMock.detectionEvent.findUnique.mockResolvedValue({
      id: 'event-2',
      createdAt: new Date(),
      userId: 'user-1',
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-incognito',
      originalIp: '1.2.3.4',
      newIp: '1.2.3.4',
      originalOs: 'Mac OS',
      originalBrowser: 'Chrome',
      originalScreenRes: '1920x1080',
      originalTimezone: 'America/New_York',
      originalUserAgent: 'Mozilla/5.0',
      newOs: 'Mac OS',
      newBrowser: 'Chrome',
      newScreenRes: '1920x1080',
      newTimezone: 'America/New_York',
      newUserAgent: 'Mozilla/5.0',
      similarityScore: 0.75,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
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
    } as any)

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ confidenceScore: 50, reasoning: 'test' }) }],
    })
    prismaMock.detectionEvent.update.mockResolvedValue({} as any)

    await analyzeDetectionEvent('event-3', 'claude-opus-5')

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-5' }),
    )
  })

  it('respects a custom flag threshold', async () => {
    prismaMock.detectionEvent.findUnique.mockResolvedValue({
      id: 'event-5',
      createdAt: new Date(),
      userId: 'user-1',
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-new',
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
      similarityScore: 0.5,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
    } as any)

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ confidenceScore: 50, reasoning: 'test' }) }],
    })
    prismaMock.detectionEvent.update.mockResolvedValue({} as any)

    // 50 is below the default 70 threshold, but at a stricter threshold of 40
    // the same score should flag
    await analyzeDetectionEvent('event-5', undefined, 40)

    expect(prismaMock.detectionEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-5' },
      data: expect.objectContaining({ status: 'FLAGGED' }),
    })
  })

  it('renders correctly for an orphaned event whose session was deleted', async () => {
    // sessionId null: the Session row was deleted on sign-out, but the event
    // survives with its own denormalized components — this must not throw or
    // read as "no data".
    prismaMock.detectionEvent.findUnique.mockResolvedValue({
      id: 'event-6',
      createdAt: new Date(),
      userId: 'user-1',
      sessionId: null,
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-new',
      originalIp: '1.2.3.4',
      newIp: '9.9.9.9',
      originalOs: 'Mac OS',
      originalBrowser: 'Chrome',
      originalScreenRes: '1920x1080',
      originalTimezone: 'America/New_York',
      originalUserAgent: 'Mozilla/5.0',
      newOs: 'Windows',
      newBrowser: 'Firefox',
      newScreenRes: '1366x768',
      newTimezone: 'Europe/London',
      newUserAgent: 'Mozilla/5.0',
      similarityScore: 0.0,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
    } as any)

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ confidenceScore: 88, reasoning: 'test' }) }],
    })
    prismaMock.detectionEvent.update.mockResolvedValue({} as any)

    await analyzeDetectionEvent('event-6')

    expect(mockCreate).toHaveBeenCalledOnce()
    expect(prismaMock.detectionEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'event-6' } }),
    )
  })

  it('throws when Claude returns unexpected content type', async () => {
    prismaMock.detectionEvent.findUnique.mockResolvedValue({
      id: 'event-4',
      createdAt: new Date(),
      userId: 'user-1',
      sessionId: 'sess-1',
      originalVisitorId: 'fp-original',
      newVisitorId: 'fp-new',
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
      similarityScore: 0.0,
      status: 'PENDING',
      confidenceScore: null,
      reasoning: null,
    } as any)

    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'tool-1', name: 'test', input: {} }],
    })

    await expect(analyzeDetectionEvent('event-4')).rejects.toThrow(
      'Unexpected Claude response type',
    )
  })
})
