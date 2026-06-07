import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
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

  if (!user) return <Navigate to="/login" replace />
  if (!profile?.is_platform_admin) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
