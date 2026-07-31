import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { useAuthStore } from '../stores/authStore'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }))
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }))

const oldSession = { access_token: 'fake-old-access', refresh_token: 'fake-refresh', user: { id: 'fake-user' } } as Session
const newSession = { access_token: 'fake-new-access', refresh_token: 'fake-refresh', user: { id: 'fake-user' } } as Session
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const success = (data: unknown = { marketCode: 'KRW-BTC' }, meta: unknown = null) => jsonResponse(200, { data, meta })
const failure = (status: number, code = 'TEST_ERROR', details: unknown = null) => jsonResponse(status, { error: { code, message: '테스트 오류', details } })

async function loadClient() {
  const module = await import('../api/client')
  return module
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '/api')
  auth.getSession.mockReset().mockResolvedValue({ data: { session: oldSession }, error: null })
  auth.refreshSession.mockReset().mockResolvedValue({ data: { session: newSession, user: newSession.user }, error: null })
  auth.signOut.mockReset().mockResolvedValue({ error: null })
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(success())))
})

describe('API URL과 envelope', () => {
  it.each([
    ['/api', '/health', '/api/health'],
    ['/api/', 'health', '/api/health'],
    ['/api', '/api/health?ready=true', '/api/health?ready=true'],
    ['https://api.example.test/api/', '/health?ready=true', 'https://api.example.test/api/health?ready=true'],
    ['', '/health', '/api/health'],
  ])('base %s와 endpoint %s를 %s로 결합한다', async (base, endpoint, expected) => {
    const { joinApiUrl } = await loadClient()
    expect(joinApiUrl(base, endpoint)).toBe(expected)
  })

  it('공개 요청에는 session과 Authorization이 필요하지 않다', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/health', { authenticated: false })).resolves.toEqual({ data: { marketCode: 'KRW-BTC' }, meta: null })
    expect(auth.getSession).not.toHaveBeenCalled()
    const init = vi.mocked(fetch).mock.calls[0][1]
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
  })

  it('200 목록과 meta.count를 보존한다', async () => {
    vi.mocked(fetch).mockResolvedValue(success([], { count: 0 }))
    const { apiRequest } = await loadClient()
    await expect(apiRequest<unknown[], { count: number }>('/fixture')).resolves.toEqual({ data: [], meta: { count: 0 } })
  })

  it('201 성공과 camelCase 데이터를 보존한다', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { data: { marketCode: 'KRW-BTC' }, meta: null }))
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/fixture')).resolves.toEqual({ data: { marketCode: 'KRW-BTC' }, meta: null })
  })

  it.each([400, 403, 404, 409, 500, 502, 503])('%i 오류의 status, code, message, details를 보존하고 refresh하지 않는다', async (status) => {
    vi.mocked(fetch).mockResolvedValue(failure(status, `UNKNOWN_${status}`, { field: 'query' }))
    const { apiRequest } = await loadClient()
    const error = await apiRequest('/fixture').catch((caught: unknown) => caught)
    expect(error).toMatchObject({ status, code: `UNKNOWN_${status}`, message: '테스트 오류', details: { field: 'query' } })
    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each([
    [200, { meta: null }],
    [200, { data: {} }],
    [500, { message: 'raw server output' }],
  ])('malformed status %i 응답을 안전한 공통 오류로 변환한다', async (status, body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body))
    const { apiRequest } = await loadClient()
    const error = await apiRequest('/fixture').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status, code: 'INTERNAL_SERVER_ERROR' })
    expect((error as Error).message).not.toContain('raw server output')
  })
})

describe('보호 요청', () => {
  it('요청마다 현재 session을 조회하고 caller Authorization을 현재 token으로 덮어쓴다', async () => {
    auth.getSession
      .mockResolvedValueOnce({ data: { session: oldSession }, error: null })
      .mockResolvedValueOnce({ data: { session: newSession }, error: null })
    const { apiRequest } = await loadClient()
    await apiRequest('/first', { headers: { Authorization: 'Bearer caller-value' } })
    await apiRequest('/second')
    const firstHeaders = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers)
    const secondHeaders = new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers)
    expect(firstHeaders.get('Authorization')).toBe('Bearer fake-old-access')
    expect(secondHeaders.get('Authorization')).toBe('Bearer fake-new-access')
  })

  it('session이 없으면 network 요청을 보내지 않는다', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/fixture')).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' })
    expect(fetch).not.toHaveBeenCalled()
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('JSON body와 일반 header를 구성한다', async () => {
    const { apiRequest } = await loadClient()
    await apiRequest('/fixture', { method: 'POST', body: { marketCode: 'KRW-BTC' }, headers: { 'X-Request-ID': 'fake-id' } })
    const init = vi.mocked(fetch).mock.calls[0][1]
    const headers = new Headers(init?.headers)
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"marketCode":"KRW-BTC"}')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-Request-ID')).toBe('fake-id')
  })

  it('body가 없으면 Content-Type과 body를 추가하지 않는다', async () => {
    const { apiRequest } = await loadClient()
    await apiRequest('/fixture')
    const init = vi.mocked(fetch).mock.calls[0][1]
    expect(init?.body).toBeUndefined()
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
  })
})

describe('401 refresh와 retry', () => {
  it('401에서 한 번 refresh하고 새 token으로 원 요청을 한 번 재시도한다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(failure(401, 'AUTH_TOKEN_EXPIRED')).mockResolvedValueOnce(success())
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/fixture', { method: 'POST', body: { value: 1 }, headers: { 'X-Test': 'kept' } })).resolves.toMatchObject({ meta: null })
    expect(auth.refreshSession).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
    const first = vi.mocked(fetch).mock.calls[0]
    const retry = vi.mocked(fetch).mock.calls[1]
    expect(first[0]).toBe(retry[0])
    expect(retry[1]?.method).toBe('POST')
    expect(retry[1]?.body).toBe(first[1]?.body)
    expect(new Headers(first[1]?.headers).get('Authorization')).toBe('Bearer fake-old-access')
    expect(new Headers(retry[1]?.headers).get('Authorization')).toBe('Bearer fake-new-access')
    expect(new Headers(retry[1]?.headers).get('X-Test')).toBe('kept')
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each([
    ['SDK error', () => Promise.resolve({ data: { session: null, user: null }, error: new Error('sdk detail') })],
    ['reject', () => Promise.reject(new Error('sdk detail'))],
    ['session 없음', () => Promise.resolve({ data: { session: null, user: null }, error: null })],
    ['token 없음', () => Promise.resolve({ data: { session: { ...newSession, access_token: '' }, user: newSession.user }, error: null })],
  ])('refresh 실패(%s) 시 retry 없이 session을 만료 처리한다', async (_label, implementation) => {
    auth.refreshSession.mockImplementation(implementation)
    vi.mocked(fetch).mockResolvedValue(failure(401, 'AUTH_TOKEN_EXPIRED'))
    const { apiRequest } = await loadClient()
    const error = await apiRequest('/fixture').catch((caught: unknown) => caught)
    expect(error).toMatchObject({ status: 401, code: 'AUTH_TOKEN_EXPIRED' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(auth.refreshSession).toHaveBeenCalledOnce()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(useAuthStore.getState()).toMatchObject({ session: null, authError: '로그인이 만료되었습니다. 다시 로그인해주세요.' })
  })

  it('retry도 401이면 두 번째 refresh 없이 최종 code를 보존하고 만료 처리한다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(failure(401, 'AUTH_REQUIRED')).mockResolvedValueOnce(failure(401, 'AUTH_TOKEN_EXPIRED'))
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/fixture')).rejects.toMatchObject({ status: 401, code: 'AUTH_TOKEN_EXPIRED' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(auth.refreshSession).toHaveBeenCalledOnce()
    expect(auth.signOut).toHaveBeenCalledOnce()
  })

  it('retry가 503이면 강제 로그아웃 없이 retry 오류를 보존한다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(failure(503, 'UPBIT_RATE_LIMITED'))
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/fixture')).rejects.toMatchObject({ status: 503, code: 'UPBIT_RATE_LIMITED' })
    expect(auth.refreshSession).toHaveBeenCalledOnce()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('malformed 401도 status 기준으로 refresh하고 한 번 재시도한다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>unauthorized</html>', { status: 401 })).mockResolvedValueOnce(success())
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/fixture')).resolves.toMatchObject({ meta: null })
    expect(auth.refreshSession).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('공개 요청의 401에서는 refresh하지 않는다', async () => {
    vi.mocked(fetch).mockResolvedValue(failure(401))
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/health', { authenticated: false })).rejects.toMatchObject({ status: 401 })
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('동시 401 요청은 진행 중인 refresh를 공유하고 각각 한 번만 retry한다', async () => {
    let release!: (value: { data: { session: Session; user: Session['user'] }; error: null }) => void
    auth.refreshSession.mockReturnValue(new Promise((resolve) => { release = resolve }))
    vi.mocked(fetch).mockImplementation((_url, init) => {
      const token = new Headers(init?.headers).get('Authorization')
      return Promise.resolve(token === 'Bearer fake-new-access' ? success() : failure(401))
    })
    const { apiRequest } = await loadClient()
    const first = apiRequest('/first')
    const second = apiRequest('/second')
    await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledOnce())
    release({ data: { session: newSession, user: newSession.user }, error: null })
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(auth.refreshSession).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('동시 refresh 실패는 만료 처리를 한 번만 수행하고 다음 독립 401에서는 새 refresh가 가능하다', async () => {
    let release!: (value: { data: { session: null; user: null }; error: Error }) => void
    auth.refreshSession
      .mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
      .mockResolvedValueOnce({ data: { session: newSession, user: newSession.user }, error: null })
    vi.mocked(fetch).mockImplementation((_url, init) => {
      const token = new Headers(init?.headers).get('Authorization')
      return Promise.resolve(token === 'Bearer fake-new-access' ? success() : failure(401, 'AUTH_TOKEN_EXPIRED'))
    })
    const { apiRequest } = await loadClient()
    const first = apiRequest('/first')
    const second = apiRequest('/second')
    await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledOnce())
    release({ data: { session: null, user: null }, error: new Error('fake refresh failure') })
    const results = await Promise.allSettled([first, second])
    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect(auth.refreshSession).toHaveBeenCalledOnce()
    expect(auth.signOut).toHaveBeenCalledOnce()

    await expect(apiRequest('/next')).resolves.toMatchObject({ meta: null })
    expect(auth.refreshSession).toHaveBeenCalledTimes(2)
  })
})

describe('network와 cancellation', () => {
  it('network 오류를 안전한 공통 오류로 변환하고 인증 만료 처리하지 않는다', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network detail'))
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/fixture')).rejects.toMatchObject({ status: 0, code: 'INTERNAL_SERVER_ERROR' })
    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('AbortError와 signal을 보존하고 refresh하지 않는다', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.mocked(fetch).mockRejectedValue(abortError)
    const { apiRequest } = await loadClient()
    await expect(apiRequest('/fixture', { signal: controller.signal })).rejects.toBe(abortError)
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBe(controller.signal)
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })
})
