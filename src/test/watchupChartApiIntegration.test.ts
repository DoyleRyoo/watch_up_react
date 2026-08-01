import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCoinChart } from '../features/watchup/api'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }))
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }))

const session = {
  access_token: 'fake-chart-access',
  refresh_token: 'fake-refresh',
  user: { id: 'fake-user' },
} as Session

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '/api')
  auth.getSession.mockReset().mockResolvedValue({ data: { session }, error: null })
  auth.refreshSession.mockReset()
  auth.signOut.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

describe('차트 API와 공통 Client 연결', () => {
  it('보호된 GET /api/coins/{marketCode}/chart 응답과 meta를 보존한다', async () => {
    const response = {
      data: {
        marketCode: 'KRW-BTC',
        period: '30d',
        candles: [{ date: '2026-06-16', closingPrice: 100 }],
      },
      meta: { count: 1 },
    }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(getCoinChart('KRW-BTC')).resolves.toEqual(response)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/coins/KRW-BTC/chart')
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fake-chart-access')
    expect(response.data).not.toHaveProperty('isStale')
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })
})
