import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Join from './pages/Join'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'

// Heavy pages — loaded on demand
const Demo       = lazy(() => import('./pages/Demo'))
const Docs       = lazy(() => import('./pages/Docs'))
const BlogPost   = lazy(() => import('./pages/BlogPost'))

// Dashboard pages — split into separate chunks
const Overview   = lazy(() => import('./pages/dashboard/Overview'))
const Events     = lazy(() => import('./pages/dashboard/Events'))
const Queue      = lazy(() => import('./pages/dashboard/Queue'))
const Rules      = lazy(() => import('./pages/dashboard/Rules'))
const ApiKeys    = lazy(() => import('./pages/dashboard/ApiKeys'))
const Webhooks   = lazy(() => import('./pages/dashboard/Webhooks'))
const UsersPage  = lazy(() => import('./pages/dashboard/Users'))
const SettingsPage  = lazy(() => import('./pages/dashboard/Settings'))
const Analytics     = lazy(() => import('./pages/dashboard/Analytics'))

function PageSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        border: '2px solid #1E2D3D',
        borderTopColor: '#16C784',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/join" element={<Join />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/docs" element={<Docs />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Overview />} />
            <Route path="events" element={<Events />} />
            <Route path="queue" element={<Queue />} />
            <Route path="rules" element={<Rules />} />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route path="webhooks" element={<Webhooks />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
