import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, ArrowLeft } from 'lucide-react'
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

  const inputBase = {
    background: '#F1F4FA',
    border: '1px solid #D8DCEC',
    color: '#07090F',
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    letterSpacing: '-0.01em',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F1F4FA',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      // subtle dot grid
      backgroundImage: 'radial-gradient(circle, rgba(22,199,132,0.07) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Back */}
        <Link to="/"
          className="flex items-center gap-1.5 text-sm mb-8 transition-colors duration-150"
          style={{ color: '#9BA4BC', fontFamily: "'DM Sans', sans-serif" }}
          onMouseEnter={e => (e.currentTarget.style.color = '#07090F')}
          onMouseLeave={e => (e.currentTarget.style.color = '#9BA4BC')}>
          <ArrowLeft size={14} />
          Back to home
        </Link>

        {/* Logo */}
        <Link to="/" className="flex justify-center mb-8">
          <img src="/logo-horizontal.png" alt="Genuinux" style={{ height: 88, display: 'block' }} />
        </Link>

        {/* Card */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #D8DCEC',
          borderRadius: 18,
          padding: 36,
          boxShadow: '0 4px 32px rgba(7,9,15,0.07), 0 1px 6px rgba(7,9,15,0.04)',
        }}>
          <h1 className="font-black mb-1.5"
            style={{
              fontSize: '1.6rem',
              letterSpacing: '-0.04em',
              color: '#07090F',
              fontFamily: "'Syne', sans-serif",
            }}>
            Welcome back
          </h1>
          <p className="text-sm mb-8" style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif" }}>
            Sign in to your Genuinux workspace.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5"
                style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={inputBase}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#16C784'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,199,132,0.1)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = '#D8DCEC'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold"
                  style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
                  Password
                </label>
                <Link to="/forgot-password"
                  className="text-xs font-medium transition-opacity duration-150"
                  style={{ color: '#16C784' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  Forgot?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={inputBase}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#16C784'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,199,132,0.1)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = '#D8DCEC'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {error && (
              <p className="text-xs py-2.5 px-3.5 rounded-xl"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  color: '#DC2626',
                  border: '1px solid rgba(239,68,68,0.15)',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-trust w-full py-3 rounded-xl text-sm justify-center gap-2 mt-1">
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign in
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif" }}>
          New to Genuinux?{' '}
          <Link to="/register" className="font-semibold transition-opacity duration-150"
            style={{ color: '#16C784' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            Create a workspace
          </Link>
        </p>
      </div>
    </div>
  )
}
