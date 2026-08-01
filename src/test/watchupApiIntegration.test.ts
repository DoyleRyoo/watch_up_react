import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWatchlist, registerWatchlist, searchCoins } from '../features/watchup/api'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }))
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }))

const session = {
  access_token: 'fake-feature-access',
  refresh_token: 'fake-refresh',
  user: { id: 'fake-user' },
} as Session

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '/api')
  auth.getSession.mockReset().mockResolvedValue({ data: { session }, error: null })
  auth.refreshSession.mockReset()
  auth.signOut.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

describe('WatchUp feature API와 공통 Client 연결', () => {
  it('검색을 최종 /api/coins/search URL과 보호된 GET으로 호출한다', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {
      data: [{ marketCode: 'KRW-BTC', koreanName: '비트코인', englishName: 'Bitcoin', status: 'ACTIVE' }],
      meta: { count: 1 },
    }))

    const response = await searchCoins('비트 코인&원화')

    const [requestUrl, init] = vi.mocked(fetch).mock.calls[0]
    const url = new URL(String(requestUrl), 'https://watchup.test')
    expect(url.pathname).toBe('/api/coins/search')
    expect(url.searchParams.get('query')).toBe('비트 코인&원화')
    expect(String(requestUrl)).not.toContain('/api/api')
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fake-feature-access')
    expect(response).toEqual({
      data: [{ marketCode: 'KRW-BTC', koreanName: '비트코인', englishName: 'Bitcoin', status: 'ACTIVE' }],
      meta: { count: 1 },
    })
  })

  it('등록 201과 목록 GET을 공통 Client 계약 그대로 처리한다', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(201, {
        data: {
          id: 1,
          marketCode: 'KRW-BTC',
          koreanName: '비트코인',
          englishName: 'Bitcoin',
          createdAt: '2026-08-01T00:00:00Z',
        },
        meta: null,
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        data: [{
          id: 1,
          marketCode: 'KRW-BTC',
          koreanName: '비트코인',
          englishName: 'Bitcoin',
          symbol: 'BTC',
          currentPrice: null,
          signedChangeRate: null,
          status: 'PRICE_ERROR',
          isStale: false,
          createdAt: '2026-08-01T00:00:00Z',
        }],
        meta: { count: 1 },
      }))

    const registered = await registerWatchlist('KRW-BTC')
    const watchlist = await getWatchlist()

    const [postUrl, postInit] = vi.mocked(fetch).mock.calls[0]
    const [getUrl, getInit] = vi.mocked(fetch).mock.calls[1]
    expect(postUrl).toBe('/api/watchlist')
    expect(postInit?.method).toBe('POST')
    expect(postInit?.body).toBe('{"marketCode":"KRW-BTC"}')
    expect(Object.keys(JSON.parse(String(postInit?.body)) as Record<string, unknown>)).toEqual(['marketCode'])
    expect(registered.meta).toBeNull()
    expect(getUrl).toBe('/api/watchlist')
    expect(getInit?.method).toBe('GET')
    expect(watchlist.data[0]).toMatchObject({
      status: 'PRICE_ERROR',
      currentPrice: null,
      signedChangeRate: null,
    })
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })
})
