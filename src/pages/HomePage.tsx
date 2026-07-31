import { useNavigate } from 'react-router-dom'
import { getSupabaseClient } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
const SAFE_ERROR = '로그아웃에 실패했습니다. 다시 시도해주세요.'
export function HomePage() {
  const navigate = useNavigate(); const loading = useAuthStore((s) => s.logoutLoading); const error = useAuthStore((s) => s.authError)
  const logout = async () => {
    if (useAuthStore.getState().logoutLoading) return
    const store = useAuthStore.getState(); store.setLogoutLoading(true); store.setAuthError(null)
    try {
      const result = await getSupabaseClient().auth.signOut()
      if (result.error) { store.setAuthError(SAFE_ERROR); return }
      store.setSession(null); navigate('/login', { replace: true })
    } catch { store.setAuthError(SAFE_ERROR) } finally { store.setLogoutLoading(false) }
  }
  return <main className="app-shell"><header className="app-header"><h1>WatchUp</h1>
    <button type="button" disabled={loading} onClick={() => void logout()}>{loading ? '로그아웃 중입니다.' : '로그아웃'}</button></header>
    {error && <p role="alert">{error}</p>}<section className="next-step" aria-labelledby="main-title"><h2 id="main-title">관심 코인 대시보드</h2><p>관심 코인 기능은 다음 단계에서 제공됩니다.</p></section></main>
}
