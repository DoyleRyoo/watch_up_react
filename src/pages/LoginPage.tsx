import { getSupabaseClient } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
const SAFE_ERROR = '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.'
export function LoginPage() {
  const loading = useAuthStore((s) => s.loginLoading)
  const error = useAuthStore((s) => s.authError)
  const login = async () => {
    if (useAuthStore.getState().loginLoading) return
    const store = useAuthStore.getState()
    store.setLoginLoading(true); store.setAuthError(null)
    try {
      const result = await getSupabaseClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
      if (result.error) { store.setAuthError(SAFE_ERROR); store.setLoginLoading(false) }
    } catch { store.setAuthError(SAFE_ERROR); store.setLoginLoading(false) }
  }
  
  return <main className="centered-page">
    <section className="auth-card" aria-labelledby="login-title">
      <h1 id="login-title">WatchUp</h1>
      <p>관심 있는 코인의 흐름을 한눈에 확인하세요.</p>
      <button type="button" disabled={loading} onClick={() => void login()}>{loading ? '로그인 중입니다.' : 'Google로 로그인'}</button>
      { error && <p role="alert">{error}</p>}
    </section>
  </main>
}
