import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: '#050B14' }}>
        <div
          className="w-5 h-5 rounded-full border-2"
          style={{
            borderColor: '#1E2D3D',
            borderTopColor: '#16C784',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
