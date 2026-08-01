import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteWatchlistItem } from '../features/watchup/api'

const apiRequest = vi.hoisted(() => vi.fn())
vi.mock('../api/client', () => ({ apiRequest }))

beforeEach(() => {
  apiRequest.mockReset()
})

describe('관심 코인 삭제 feature API', () => {
  it('ID path와 AbortSignal만 DELETE로 공통 Client에 전달한다', async () => {
    const response = { data: { id: 17 }, meta: null }
    const controller = new AbortController()
    apiRequest.mockResolvedValue(response)

    await expect(deleteWatchlistItem(17, controller.signal)).resolves.toBe(response)

    expect(apiRequest).toHaveBeenCalledWith('/watchlist/17', {
      method: 'DELETE',
      signal: controller.signal,
    })
    expect(apiRequest.mock.calls[0][1]).not.toHaveProperty('body')
    expect(apiRequest.mock.calls[0][0]).not.toContain('?')
    expect(apiRequest.mock.calls[0][0]).not.toContain('/api/api')
  })
})
