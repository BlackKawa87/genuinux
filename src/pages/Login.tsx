import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const { signIn }              = useAuth()
  const navigate                = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#050B14' }}
    >
      {/* Grid bg */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(30, 45, 61, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30, 45, 61, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 40% at 50% 0%, rgba(22, 199, 132, 0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(22, 199, 132, 0.08)',
              border: '1px solid rgba(22, 199, 132, 0.2)',
            }}
          >
            <Shield size={20} style={{ color: '#16C784' }} />
          </div>
          <span className="text-xl font-bold" style={{ color: '#FFFFFF' }}>Genuinux</span>
        </div>

        {/* Card */}
        <div className="g-card p-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#FFFFFF' }}>Welcome back</h1>
          <p className="text-sm mb-7" style={{ color: '#94A3B8' }}>Sign in to your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#94A3B8' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="g-input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium" style={{ color: '#94A3B8' }}>Password</label>
                <a href="#" className="text-xs" style={{ color: '#16C784' }}>Forgot?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="g-input"
              />
            </div>

            {error && (
              <p
                className="text-xs py-2.5 px-3 rounded-lg"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  color: '#EF4444',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-trust w-full py-2.5 rounded-lg text-sm justify-center gap-2"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              Sign in
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: '#475569' }}>
          New to Genuinux?{' '}
          <Link to="/register" className="font-medium" style={{ color: '#16C784' }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
