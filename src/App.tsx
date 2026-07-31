import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AuthProvider } from './auth/AuthProvider'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { AuthLoading, ProtectedRoute, PublicOnlyRoute } from './routes/AuthRoutes'

export function AppRoutes() {
  return <Routes>
    <Route element={<PublicOnlyRoute />}><Route path="/login" element={<LoginPage />} /></Route>
    <Route path="/auth/callback" element={<AuthCallbackPage />} />
    <Route element={<ProtectedRoute />}><Route path="/" element={<HomePage />} /></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

export default function App() {
  return <BrowserRouter><AuthProvider fallback={<AuthLoading />}><AppRoutes /></AuthProvider></BrowserRouter>
}
