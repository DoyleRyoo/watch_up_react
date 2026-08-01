import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteWatchlistItem } from '../features/watchup/api'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }))
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }))

const session = {
  access_token: 'fake-delete-access',
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

describe('삭제 API와 공통 Client 연결', () => {
  it('보호된 DELETE /api/watchlist/{id}의 200 envelope을 보존한다', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { data: { id: 17 }, meta: null }))

    await expect(deleteWatchlistItem(17)).resolves.toEqual({ data: { id: 17 }, meta: null })

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/watchlist/17')
    expect(init?.method).toBe('DELETE')
    expect(init?.body).toBeUndefined()
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fake-delete-access')
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('204 빈 응답을 문서상 삭제 성공으로 합성하지 않는다', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }))

    await expect(deleteWatchlistItem(17)).rejects.toMatchObject({
      status: 204,
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('404 오류의 status, code, message, details를 그대로 보존한다', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, {
      error: {
        code: 'WATCHLIST_NOT_FOUND',
        message: 'not found',
        details: { id: 17 },
      },
    }))

    await expect(deleteWatchlistItem(17)).rejects.toMatchObject({
      status: 404,
      code: 'WATCHLIST_NOT_FOUND',
      message: 'not found',
      details: { id: 17 },
    })
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })
})
