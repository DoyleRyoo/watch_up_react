import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export function AuthLoading() { 
  return <main className="centered-page">
    <p role="status">로그인 정보를 확인하는 중입니다.</p>
  </main> 
}

export function ProtectedRoute() {
  return useAuthStore((s) => s.session) ? <Outlet /> : <Navigate to="/login" replace />
}

export function PublicOnlyRoute() {
  return useAuthStore((s) => s.session) ? <Navigate to="/" replace /> : <Outlet />
}
