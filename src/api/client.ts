import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { ApiError, createAuthRequiredError, createContractError } from './errors'
import type { ApiErrorEnvelope, ApiSuccess } from './types'

/*
 * FastAPI 요청의 URL 조합, envelope 검증, 인증 만료 처리를 한곳에서 담당한다.
 * 기능 API는 `/api`를 제외한 상대 endpoint만 넘기며, 보호 요청은 기본적으로
 * 현재 Supabase access token을 사용한다.
 */
const SESSION_EXPIRED_MESSAGE = '로그인이 만료되었습니다. 다시 로그인해주세요.'
const DEFAULT_API_BASE_URL = '/api'

export type ApiRequestOptions = {
  method?: string
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
  authenticated?: boolean
}

// 여러 요청이 동시에 401을 받아도 refresh token을 한 번만 사용하도록 작업을 공유한다.
let refreshInFlight: Promise<Session | null> | null = null
let expirationInFlight: Promise<void> | null = null
let expirationHandled = false

function configuredBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
}

/** `/api`가 base와 endpoint 양쪽에 있어도 공개 경로에 한 번만 남긴다. */
export function joinApiUrl(baseUrl: string, endpoint: string): string {
  const base = (baseUrl.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
  let relativeEndpoint = endpoint.trim().replace(/^\/+/, '')
  const basePath = base.startsWith('http://') || base.startsWith('https://')
    ? new URL(base).pathname
    : base
  const normalizedBasePath = basePath.replace(/^\/+|\/+$/g, '')

  if (normalizedBasePath && (relativeEndpoint === normalizedBasePath || relativeEndpoint.startsWith(`${normalizedBasePath}/`))) {
    relativeEndpoint = relativeEndpoint.slice(normalizedBasePath.length).replace(/^\/+/, '')
  }

  return relativeEndpoint ? `${base}/${relativeEndpoint}` : base
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!isObject(value) || !isObject(value.error)) return false
  return typeof value.error.code === 'string'
    && typeof value.error.message === 'string'
    && Object.hasOwn(value.error, 'details')
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw createContractError(response.status)
  }
}

async function parseResponse<TData, TMeta>(response: Response): Promise<ApiSuccess<TData, TMeta>> {
  const body = await readJson(response)
  if (response.ok) {
    if (!isObject(body) || !Object.hasOwn(body, 'data') || !Object.hasOwn(body, 'meta')) {
      throw createContractError(response.status)
    }
    return { data: body.data as TData, meta: body.meta as TMeta }
  }
  if (isErrorEnvelope(body)) {
    throw new ApiError(response.status, body.error.code, body.error.message, body.error.details)
  }
  throw createContractError(response.status)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function executeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    if (isAbortError(error)) throw error
    throw createContractError()
  }
}

async function currentAccessToken(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getSession()
  const token = error ? undefined : data.session?.access_token
  if (!token) throw createAuthRequiredError()
  expirationHandled = false
  return token
}

function refreshSessionOnce(): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = getSupabaseClient().auth.refreshSession()
    .then(({ data, error }) => error || !data.session?.access_token ? null : data.session)
    .catch(() => null)
    .finally(() => { refreshInFlight = null })
  return refreshInFlight
}

function expireSessionOnce(): Promise<void> {
  if (expirationHandled) return Promise.resolve()
  if (expirationInFlight) return expirationInFlight
  expirationHandled = true
  expirationInFlight = getSupabaseClient().auth.signOut({ scope: 'local' })
    .then(() => undefined, () => undefined)
    .then(() => {
      const store = useAuthStore.getState()
      store.setSession(null)
      store.setAuthError(SESSION_EXPIRED_MESSAGE)
    })
    .finally(() => { expirationInFlight = null })
  return expirationInFlight
}

function buildRequestInit(options: ApiRequestOptions, token?: string): RequestInit {
  const headers = new Headers(options.headers)
  let body: string | undefined
  if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  else headers.delete('Authorization')
  return { method: options.method ?? 'GET', headers, body, signal: options.signal }
}

/**
 * 공통 envelope을 검증하고 보호 요청의 401을 refresh 후 한 번만 재시도한다.
 * `AbortError`는 호출자가 stale 요청을 조용히 취소할 수 있도록 변환하지 않는다.
 */
export async function apiRequest<TData, TMeta = null>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<ApiSuccess<TData, TMeta>> {
  // 401은 refresh 한 번과 원 요청 재시도 한 번으로 끝낸다. 재시도도 401이면
  // 공통 만료 처리가 세션과 화면 상태를 정리하므로 기능 컴포넌트가 재시도하지 않는다.
  const authenticated = options.authenticated ?? true
  const url = joinApiUrl(configuredBaseUrl(), endpoint)
  const initialToken = authenticated ? await currentAccessToken() : undefined
  const initialResponse = await executeFetch(url, buildRequestInit(options, initialToken))

  if (!authenticated || initialResponse.status !== 401) {
    return parseResponse<TData, TMeta>(initialResponse)
  }

  let initialError: ApiError
  try {
    await parseResponse<TData, TMeta>(initialResponse)
    initialError = createContractError(401)
  } catch (error) {
    initialError = error instanceof ApiError ? error : createContractError(401)
  }

  const refreshedSession = await refreshSessionOnce()
  if (!refreshedSession?.access_token) {
    await expireSessionOnce()
    throw initialError
  }

  const retryResponse = await executeFetch(url, buildRequestInit(options, refreshedSession.access_token))
  if (retryResponse.status === 401) {
    let retryError: ApiError
    try {
      await parseResponse<TData, TMeta>(retryResponse)
      retryError = createContractError(401)
    } catch (error) {
      retryError = error instanceof ApiError ? error : createContractError(401)
    }
    await expireSessionOnce()
    throw retryError
  }

  return parseResponse<TData, TMeta>(retryResponse)
}
