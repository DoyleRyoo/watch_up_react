import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DetailArea } from '../features/watchup/DetailArea'
import { SearchArea } from '../features/watchup/SearchArea'
import { WatchlistArea } from '../features/watchup/WatchlistArea'
import { getSupabaseClient } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useWatchupStore } from '../stores/watchupStore'

const SAFE_ERROR = '로그아웃에 실패했습니다. 다시 시도해주세요.'
// 개발 Strict Mode의 effect 재실행 사이에는 요청을 유지하고, 실제로 대시보드를
// 떠나 모든 mount가 사라진 경우에만 공유 store의 진행 중 요청을 취소한다.
let dashboardMountCount = 0

export function HomePage() {
  const navigate = useNavigate()
  const loading = useAuthStore((state) => state.logoutLoading)
  const error = useAuthStore((state) => state.authError)
  const loadInitialWatchlist = useWatchupStore((state) => state.loadInitialWatchlist)

  useEffect(() => {
    dashboardMountCount += 1
    void loadInitialWatchlist()

    return () => {
      dashboardMountCount -= 1
      queueMicrotask(() => {
        if (dashboardMountCount === 0) useWatchupStore.getState().cancelPendingRequests()
      })
    }
  }, [loadInitialWatchlist])

  const logout = async () => {
    if (useAuthStore.getState().logoutLoading) return
    const store = useAuthStore.getState()
    store.setLogoutLoading(true)
    store.setAuthError(null)
    try {
      const result = await getSupabaseClient().auth.signOut()
      if (result.error) {
        store.setAuthError(SAFE_ERROR)
        return
      }
      useWatchupStore.getState().cancelPendingRequests()
      store.setSession(null)
      navigate('/login', { replace: true })
    } catch {
      store.setAuthError(SAFE_ERROR)
    } finally {
      store.setLogoutLoading(false)
    }
  }

  return <main className="app-shell">
    <header className="app-header">
      <h1>WatchUp</h1>
      <button type="button" disabled={loading} onClick={() => void logout()}>
        {loading ? '로그아웃 중입니다.' : '로그아웃'}
      </button>
    </header>
    {error && <p role="alert">{error}</p>}
    <SearchArea />
    <div className="dashboard-grid">
      <WatchlistArea />
      <DetailArea />
    </div>
  </main>
}
