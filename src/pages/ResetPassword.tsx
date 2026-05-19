import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'

const C = {
  bg: '#F8FAFC', surface: '#FFFFFF', border: '#E2E8F0',
  text: '#0F172A', textSec: '#64748B', trust: '#16C784',
}

type Stage = 'loading' | 'form' | 'success' | 'invalid'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [stage,    setStage]    = useState<Stage>('loading')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    // Supabase auto-exchanges the token from the URL fragment.
    // We listen for PASSWORD_RECOVERY which fires when a user follows a reset link.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStage('form')
      }
    })

    // Also handle the case where the session is already set (page reload).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && stage === 'loading') {
        setStage('form')
      } else if (!session && stage === 'loading') {
        // Give auth state change a moment to fire before showing invalid
        setTimeout(() => setStage(prev => prev === 'loading' ? 'invalid' : prev), 2000)
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }

    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStage('success')
    setTimeout(() => navigate('/login'), 3000)
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

          {stage === 'loading' && (
            <div className="flex items-center justify-center gap-3 py-8" style={{ color: C.textSec }}>
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Verifying reset link…</span>
            </div>
          )}

          {stage === 'invalid' && (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle size={20} style={{ color: '#EF4444' }} />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: C.text }}>Link expired</h2>
              <p className="text-sm" style={{ color: C.textSec }}>
                This reset link is invalid or has expired. Password reset links are valid for 1 hour.
              </p>
              <Link to="/forgot-password"
                className="block mt-6 text-sm font-semibold"
                style={{ color: C.trust }}>
                Request a new link
              </Link>
            </div>
          )}

          {stage === 'success' && (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.2)' }}>
                <CheckCircle2 size={22} style={{ color: C.trust }} />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: C.text }}>Password updated</h2>
              <p className="text-sm" style={{ color: C.textSec }}>
                Your password has been changed. Redirecting you to sign in…
              </p>
            </div>
          )}

          {stage === 'form' && (
            <>
              <h1 className="text-2xl font-bold mb-1" style={{ color: C.text }}>Set new password</h1>
              <p className="text-sm mb-7" style={{ color: C.textSec }}>
                Choose a strong password for your account.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: C.textSec }}>
                    New password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required minLength={8}
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                    onFocus={e => (e.currentTarget.style.borderColor = C.trust)}
                    onBlur={e => (e.currentTarget.style.borderColor = C.border)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: C.textSec }}>
                    Confirm password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
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
                  Update password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
