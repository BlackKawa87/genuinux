import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
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
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#F8FAFC' }}>

      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.2)' }}>
            <Shield size={17} style={{ color: '#16C784' }} />
          </div>
          <span className="text-lg font-bold" style={{ color: '#0F172A' }}>Genuinux</span>
        </Link>

        {/* Card */}
        <div className="p-8 rounded-2xl"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 24px rgba(15,23,42,0.06), 0 1px 4px rgba(15,23,42,0.04)',
          }}>
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#0F172A' }}>Welcome back</h1>
          <p className="text-sm mb-7" style={{ color: '#64748B' }}>Sign in to your Genuinux workspace.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748B' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#0F172A',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#16C784')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold" style={{ color: '#64748B' }}>Password</label>
                <a href="#" className="text-xs font-medium" style={{ color: '#16C784' }}>Forgot?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#0F172A',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#16C784')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
              />
            </div>

            {error && (
              <p className="text-xs py-2.5 px-3 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.06)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.15)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-trust w-full py-2.5 rounded-lg text-sm justify-center gap-2 mt-1">
              {loading && <Loader2 size={15} className="animate-spin" />}
              Sign in
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: '#64748B' }}>
          New to Genuinux?{' '}
          <Link to="/register" className="font-semibold" style={{ color: '#16C784' }}>
            Create a workspace
          </Link>
        </p>
      </div>
    </div>
  )
}
