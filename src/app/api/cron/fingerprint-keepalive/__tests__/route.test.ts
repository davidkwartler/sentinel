import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/fingerprint-server', () => ({
  keepFingerprintWorkspaceAlive: vi.fn(),
}))

import { GET } from '../route'
import { keepFingerprintWorkspaceAlive } from '@/lib/fingerprint-server'

function makeRequest(authorization?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/fingerprint-keepalive', {
    headers: authorization ? { authorization } : {},
  })
}

describe('GET /api/cron/fingerprint-keepalive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.CRON_SECRET = 'cron-secret'
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('refuses a request without the cron secret', async () => {
    const response = await GET(makeRequest())

    expect(response.status).toBe(401)
    expect(keepFingerprintWorkspaceAlive).not.toHaveBeenCalled()
  })

  it('refuses everything when CRON_SECRET is unset, even a matching-looking header', async () => {
    delete process.env.CRON_SECRET

    const response = await GET(makeRequest('Bearer undefined'))

    expect(response.status).toBe(401)
    expect(keepFingerprintWorkspaceAlive).not.toHaveBeenCalled()
  })

  it('runs the keepalive for Vercel Cron and reports success', async () => {
    vi.mocked(keepFingerprintWorkspaceAlive).mockResolvedValue({
      ok: true,
      call: 'searchEvents',
      detail: 'Search succeeded.',
    })

    const response = await GET(makeRequest('Bearer cron-secret'))

    expect(response.status).toBe(200)
    expect((await response.json()).call).toBe('searchEvents')
  })

  it('returns 502 when the call fails, so the run shows as failed', async () => {
    vi.mocked(keepFingerprintWorkspaceAlive).mockResolvedValue({
      ok: false,
      call: null,
      detail: 'bad key',
    })

    const response = await GET(makeRequest('Bearer cron-secret'))

    expect(response.status).toBe(502)
  })
})
