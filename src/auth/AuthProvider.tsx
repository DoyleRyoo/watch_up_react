import { useEffect, type ReactNode } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

const SAFE_ERROR = '로그인 정보를 확인하지 못했습니다. 다시 시도해주세요.'

/** Supabase 세션 복원과 이후 인증 이벤트를 Zustand 메모리 상태에 동기화한다. */
export function AuthProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const initialized = useAuthStore((state) => state.authInitialized)
  useEffect(() => {
    let active = true
    let eventVersion = 0
    const store = useAuthStore.getState()
    try {
      const auth = getSupabaseClient().auth
      const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
        eventVersion += 1
        if (active) {
          const currentStore = useAuthStore.getState()
          currentStore.setSession(session)
          if (session) currentStore.setAuthError(null)
        }
      })
      // getSession보다 최신 onAuthStateChange가 먼저 오면 늦은 초기 조회 결과를 버린다.
      const requestedAt = eventVersion
      void auth.getSession().then(({ data, error }) => {
        if (!active) return
        if (error) {
          store.setAuthError(SAFE_ERROR)
          store.completeInitialization(null)
          return
        }
        const session = eventVersion === requestedAt ? data.session : useAuthStore.getState().session
        if (session) store.setAuthError(null)
        store.completeInitialization(session)
      }).catch(() => {
        if (!active) return
        store.setAuthError(SAFE_ERROR)
        store.completeInitialization(null)
      })
      return () => { active = false; subscription.unsubscribe() }
    } catch {
      store.setAuthError(SAFE_ERROR)
      store.completeInitialization(null)
    }
    return () => { active = false }
  }, [])
  return initialized ? children : fallback
}
