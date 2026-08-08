import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050B14' }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        border: '2px solid var(--c-border)',
        borderTopColor: '#F59E0B',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading } = useAuth()

  // Wait for both auth session and profile fetch to complete
  if (loading || profileLoading) return <Spinner />

  // Not authenticated → login
  if (!user) return <Navigate to="/login" replace />

  // Authenticated but not a platform admin → back to dashboard (hard redirect, no info leak)
  if (!profile?.is_platform_admin) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
