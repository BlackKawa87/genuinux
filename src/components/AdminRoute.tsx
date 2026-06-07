import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050B14' }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        border: '2px solid #1E2D3D',
        borderTopColor: '#F59E0B',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading } = useAuth()

  // Debug: log state to console
  console.log('[AdminRoute]', { loading, profileLoading, user: user?.email, is_platform_admin: profile?.is_platform_admin })

  // Wait for both auth session and profile fetch to complete
  if (loading || profileLoading) return <Spinner />

  if (!user) return <Navigate to="/login" replace />

  // is_platform_admin may be undefined if v24 migration hasn't run yet
  if (!profile?.is_platform_admin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050B14', gap: 12, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#F1F5F9' }}>Admin access required</div>
        <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', maxWidth: 360 }}>
          Your account does not have platform admin privileges.<br />
          Run the v24 migration and set <code style={{ background: '#1E2D3D', padding: '1px 6px', borderRadius: 4, color: '#F59E0B' }}>is_platform_admin = true</code> for your profile.
        </div>
        <a href="/dashboard" style={{ marginTop: 8, fontSize: 13, color: '#F59E0B', textDecoration: 'none' }}>← Back to Dashboard</a>
      </div>
    )
  }

  return <>{children}</>
}
