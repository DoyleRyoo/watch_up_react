import { beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn(() => ({ auth: {} }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

describe('Supabase client', () => {
  beforeEach(() => {
    vi.resetModules()
    createClient.mockClear()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key')
  })

  it('환경변수와 고정 세션 정책으로 singleton을 만든다', async () => {
    const { getSupabaseClient } = await import('../lib/supabase')
    const first = getSupabaseClient()
    const second = getSupabaseClient()
    expect(first).toBe(second)
    expect(createClient).toHaveBeenCalledOnce()
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'public-anon-key', {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  })

  it('필수 환경변수가 없으면 값이 포함되지 않은 안전한 오류를 낸다', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { getSupabaseClient } = await import('../lib/supabase')
    expect(() => getSupabaseClient()).toThrow('Supabase 환경변수가 설정되지 않았습니다.')
    expect(createClient).not.toHaveBeenCalled()
  })
})
