import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

const C = {
  bg: '#F8FAFC', surface: '#FFFFFF', border: '#E2E8F0',
  text: '#0F172A', textSec: '#64748B', trust: '#16C784',
}

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: C.bg }}>
      <div className="w-full max-w-[400px]">

        <Link to="/" className="flex justify-center mb-8">
          <img src="/logo-full.png" alt="Genuinux" style={{ height: '140px', display: 'block' }} />
        </Link>

        <div className="p-8 rounded-2xl"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            boxShadow: '0 4px 24px rgba(15,23,42,0.06), 0 1px 4px rgba(15,23,42,0.04)',
          }}>

          {sent ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.2)' }}>
                <CheckCircle2 size={22} style={{ color: C.trust }} />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: C.text }}>Check your inbox</h2>
              <p className="text-sm leading-relaxed" style={{ color: C.textSec }}>
                We sent a password reset link to{' '}
                <strong style={{ color: C.text }}>{email}</strong>.
                The link expires in 1 hour.
              </p>
              <p className="text-xs mt-4" style={{ color: C.textSec }}>
                Didn't receive it? Check your spam folder or{' '}
                <button
                  onClick={() => setSent(false)}
                  className="font-semibold"
                  style={{ color: C.trust }}
                >
                  try again
                </button>.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-1" style={{ color: C.text }}>Reset your password</h1>
              <p className="text-sm mb-7" style={{ color: C.textSec }}>
                Enter your email and we'll send you a secure reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: C.textSec }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                    onFocus={e => (e.currentTarget.style.borderColor = C.trust)}
                    onBlur={e => (e.currentTarget.style.borderColor = C.border)}
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
                  className="btn-trust w-full py-2.5 rounded-lg text-sm justify-center gap-2 mt-1"
                >
                  {loading && <Loader2 size={15} className="animate-spin" />}
                  Send reset link
                </button>
              </form>
            </>
          )}
        </div>

        <Link to="/login"
          className="flex items-center justify-center gap-2 text-sm mt-5 transition-colors"
          style={{ color: C.textSec }}
          onMouseEnter={e => (e.currentTarget.style.color = C.text)}
          onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}
        >
          <ArrowLeft size={14} />
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
