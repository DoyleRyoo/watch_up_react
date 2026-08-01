import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWatchlist, registerWatchlist, searchCoins } from '../features/watchup/api'

const apiRequest = vi.hoisted(() => vi.fn())
vi.mock('../api/client', () => ({ apiRequest }))

beforeEach(() => {
  apiRequest.mockReset()
})

describe('WatchUp feature API', () => {
  it.each(['비트 코인&원화', 'bitcoin', 'KRW-BTC'])('검색어 %s를 query로 안전하게 전달한다', async (query) => {
    const response = {
      data: [
        { marketCode: 'KRW-XRP', koreanName: '리플', englishName: 'XRP', status: 'CAUTION' },
        { marketCode: 'KRW-BTC', koreanName: '비트코인', englishName: 'Bitcoin', status: 'ACTIVE' },
      ],
      meta: { count: 2 },
    }
    apiRequest.mockResolvedValue(response)

    await expect(searchCoins(query)).resolves.toBe(response)

    const [endpoint, options] = apiRequest.mock.calls[0]
    const url = new URL(endpoint, 'https://watchup.test')
    expect(url.pathname).toBe('/coins/search')
    expect(url.searchParams.get('query')).toBe(query)
    expect(endpoint).not.toContain('/api/api')
    expect(options).toEqual({ signal: undefined })
    expect(response.data.map((item) => item.marketCode)).toEqual(['KRW-XRP', 'KRW-BTC'])
    expect(response.meta.count).toBe(2)
  })

  it('등록은 marketCode만 담은 POST를 보호된 공통 Client에 위임한다', async () => {
    const response = {
      data: {
        id: 1,
        marketCode: 'KRW-BTC',
        koreanName: '비트코인',
        englishName: 'Bitcoin',
        createdAt: '2026-08-01T00:00:00Z',
      },
      meta: null,
    }
    apiRequest.mockResolvedValue(response)

    await expect(registerWatchlist('KRW-BTC')).resolves.toBe(response)

    expect(apiRequest).toHaveBeenCalledWith('/watchlist', {
      method: 'POST',
      body: { marketCode: 'KRW-BTC' },
      signal: undefined,
    })
    const body = apiRequest.mock.calls[0][1].body
    expect(Object.keys(body)).toEqual(['marketCode'])
    expect(body).not.toHaveProperty('userId')
    expect(body).not.toHaveProperty('koreanName')
    expect(body).not.toHaveProperty('englishName')
    expect(body).not.toHaveProperty('symbol')
    expect(body).not.toHaveProperty('status')
  })

  it('관심 목록은 GET /watchlist 응답과 nullable 가격을 그대로 보존한다', async () => {
    const response = {
      data: [{
        id: 2,
        marketCode: 'KRW-OLD',
        koreanName: '이전코인',
        englishName: 'Old Coin',
        symbol: 'OLD',
        currentPrice: null,
        signedChangeRate: null,
        status: 'PRICE_ERROR',
        isStale: false,
        createdAt: '2026-08-01T00:00:00Z',
      }],
      meta: { count: 1 },
    }
    apiRequest.mockResolvedValue(response)

    await expect(getWatchlist()).resolves.toBe(response)
    expect(apiRequest).toHaveBeenCalledWith('/watchlist', { signal: undefined })
    expect(response.data[0].currentPrice).toBeNull()
    expect(response.data[0].signedChangeRate).toBeNull()
  })
})
