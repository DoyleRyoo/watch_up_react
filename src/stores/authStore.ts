import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

type AuthState = {
  session: Session | null
  authInitialized: boolean
  authError: string | null
  loginLoading: boolean
  logoutLoading: boolean
  setSession: (session: Session | null) => void
  completeInitialization: (session: Session | null) => void
  setAuthError: (error: string | null) => void
  setLoginLoading: (loading: boolean) => void
  setLogoutLoading: (loading: boolean) => void
  reset: () => void
}
const initialState = { session: null, authInitialized: false, authError: null, loginLoading: false, logoutLoading: false }
export const useAuthStore = create<AuthState>((set) => ({
  ...initialState,
  setSession: (session) => set({ session }),
  completeInitialization: (session) => set({ session, authInitialized: true }),
  setAuthError: (authError) => set({ authError }),
  setLoginLoading: (loginLoading) => set({ loginLoading }),
  setLogoutLoading: (logoutLoading) => set({ logoutLoading }),
  reset: () => set(initialState),
}))
