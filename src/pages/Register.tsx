import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Register() {
  const [company,  setCompany]  = useState('')
  const [website,  setWebsite]  = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)
  const { signUp }              = useAuth()
  const navigate                = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await signUp(email, password)
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Update org name with company name if provided
    if (company.trim()) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', user.id)
          .single()

        if (profile?.organization_id) {
          const updates: Record<string, string> = { name: company.trim() }
          if (website.trim()) updates.website = website.trim()
          await supabase.from('organizations').update(updates).eq('id', profile.organization_id)
        }
      }
    }

    setSuccess(true)
    setTimeout(() => navigate('/dashboard'), 1800)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8FAFC' }}>
        <div className="text-center anim-0">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.2)' }}>
            <CheckCircle size={28} style={{ color: '#16C784' }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#0F172A' }}>Workspace created</h2>
          <p style={{ color: '#64748B' }}>Redirecting to your dashboard…</p>
        </div>
      </div>
    )
  }

  const inputStyle = {
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    color: '#0F172A',
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: '#F8FAFC' }}>

      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <Link to="/" className="flex justify-center mb-8">
          <img src="/logo-full.png" alt="Genuinux" style={{ height: '100px', display: 'block' }} />
        </Link>

        {/* Card */}
        <div className="p-8 rounded-2xl"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 24px rgba(15,23,42,0.06), 0 1px 4px rgba(15,23,42,0.04)',
          }}>
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#0F172A' }}>Create your workspace</h1>
          <p className="text-sm mb-7" style={{ color: '#64748B' }}>
            Start protecting your platform with AI trust infrastructure.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748B' }}>
                  Company name
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = '#16C784')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748B' }}>
                  Website <span style={{ color: '#94A3B8' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="acme.com"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = '#16C784')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748B' }}>
                Work email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#16C784')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748B' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                style={inputStyle}
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
              Create workspace
            </button>
          </form>

          <p className="text-xs mt-5 text-center" style={{ color: '#94A3B8' }}>
            By creating a workspace you agree to our{' '}
            <a href="#" style={{ color: '#64748B' }}>Terms</a>
            {' '}and{' '}
            <a href="#" style={{ color: '#64748B' }}>Privacy Policy</a>
          </p>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: '#64748B' }}>
          Already have a workspace?{' '}
          <Link to="/login" className="font-semibold" style={{ color: '#16C784' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
