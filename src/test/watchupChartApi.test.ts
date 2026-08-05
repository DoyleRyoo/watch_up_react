import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCoinChart } from '../features/watchup/api'

const apiRequest = vi.hoisted(() => vi.fn())
vi.mock('../api/client', () => ({ apiRequest }))

beforeEach(() => {
  apiRequest.mockReset()
})

describe('차트 feature API', () => {
  it('marketCode path segment와 AbortSignal만 공통 Client에 전달한다', async () => {
    const response = {
      data: {
        marketCode: 'KRW/BTC ?',
        period: '30d' as const,
        candles: [{ date: '2026-06-16', closingPrice: 100 }],
      },
      meta: { count: 1 },
    }
    const controller = new AbortController()
    apiRequest.mockResolvedValue(response)

    await expect(getCoinChart('KRW/BTC ?', controller.signal)).resolves.toBe(response)

    expect(apiRequest).toHaveBeenCalledWith('/coins/KRW%2FBTC%20%3F/chart', {
      signal: controller.signal,
    })
  })
})
