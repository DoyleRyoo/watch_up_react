import type { Session } from '@supabase/supabase-js'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthLoading } from '../routes/AuthRoutes'
import { useAuthStore } from '../stores/authStore'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithOAuth: vi.fn(), signOut: vi.fn(), unsubscribe: vi.fn(), callback: undefined as ((event: string, session: Session | null) => void) | undefined,
}))
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth: {
  getSession: mocks.getSession,
  onAuthStateChange: mocks.onAuthStateChange,
  signInWithOAuth: mocks.signInWithOAuth,
  signOut: mocks.signOut,
} }) }))

const session = { access_token: 'fake', refresh_token: 'fake', expires_in: 3600, token_type: 'bearer', user: { id: 'user' } } as Session
function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider fallback={<AuthLoading />}><AppRoutes /></AuthProvider></MemoryRouter>)
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mocks.signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
  mocks.unsubscribe.mockReset()
  mocks.onAuthStateChange.mockImplementation((callback) => {
    mocks.callback = callback
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
  })
})

describe('인증 초기화와 라우팅', () => {
  it('초기화 전에는 로그인 화면 대신 고정 로딩을 표시한다', () => {
    mocks.getSession.mockReturnValue(new Promise(() => {}))
    renderApp('/login')
    expect(screen.getByRole('status')).toHaveTextContent('로그인 정보를 확인하는 중입니다.')
    expect(screen.queryByRole('button', { name: 'Google로 로그인' })).not.toBeInTheDocument()
  })
  it('비로그인 사용자를 보호 경로에서 로그인으로 보낸다', async () => {
    renderApp('/')
    expect(await screen.findByRole('button', { name: 'Google로 로그인' })).toBeInTheDocument()
  })
  it('로그인 사용자는 메인 화면에 접근하고 로그인 경로에서도 메인으로 간다', async () => {
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderApp('/login')
    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })
  it('callback은 세션이 있으면 메인으로 replace 이동한다', async () => {
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderApp('/auth/callback?code=fake-code')
    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument()
    expect(screen.queryByText('fake-code')).not.toBeInTheDocument()
  })
  it('알 수 없는 경로는 루트 guard를 거쳐 로그인으로 간다', async () => {
    renderApp('/unknown')
    expect(await screen.findByRole('button', { name: 'Google로 로그인' })).toBeInTheDocument()
  })
  it('auth event가 오래된 getSession 결과에 덮어쓰이지 않는다', async () => {
    let resolve!: (value: { data: { session: null }; error: null }) => void
    mocks.getSession.mockReturnValue(new Promise((done) => { resolve = done }))
    renderApp('/')
    act(() => mocks.callback?.('SIGNED_IN', session))
    act(() => resolve({ data: { session: null }, error: null }))
    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })
  it('초기 조회 실패는 안전한 오류를 보여주고 loading을 종료한다', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: new Error('secret detail') })
    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인 정보를 확인하지 못했습니다. 다시 시도해주세요.')
    expect(screen.queryByText('secret detail')).not.toBeInTheDocument()
  })
  it('unmount 시 subscription을 해제한다', () => {
    const view = renderApp('/')
    view.unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('로그인과 로그아웃', () => {
  it('Google OAuth를 callback URL과 함께 시작한다', async () => {
    renderApp('/login')
    fireEvent.click(await screen.findByRole('button', { name: 'Google로 로그인' }))
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
    expect(useAuthStore.getState().session).toBeNull()
  })
  it('로그인 중 버튼을 비활성화해 중복 요청을 막는다', async () => {
    mocks.signInWithOAuth.mockReturnValue(new Promise(() => {}))
    renderApp('/login')
    const button = await screen.findByRole('button', { name: 'Google로 로그인' })
    fireEvent.click(button); fireEvent.click(button)
    expect(await screen.findByRole('button', { name: '로그인 중입니다.' })).toBeDisabled()
    expect(mocks.signInWithOAuth).toHaveBeenCalledOnce()
  })
  it('로그인 실패 시 원본 오류 대신 안전한 문구를 표시한다', async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: {}, error: new Error('provider secret') })
    renderApp('/login')
    fireEvent.click(await screen.findByRole('button', { name: 'Google로 로그인' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인에 실패했습니다. 잠시 후 다시 시도해주세요.')
  })
  it('로그아웃 성공 시 세션을 제거하고 로그인으로 간다', async () => {
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderApp('/')
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }))
    expect(await screen.findByRole('button', { name: 'Google로 로그인' })).toBeInTheDocument()
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })
  it('로그아웃 실패 시 세션과 보호 화면을 유지한다', async () => {
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    mocks.signOut.mockResolvedValue({ error: new Error('token detail') })
    renderApp('/')
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('로그아웃에 실패했습니다. 다시 시도해주세요.')
    await waitFor(() => expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled())
    expect(useAuthStore.getState().session).toBe(session)
  })
})
