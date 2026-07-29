import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
export function AuthCallbackPage() { return <Navigate to={useAuthStore((s) => s.session) ? '/' : '/login'} replace /> }
