import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle, Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const USE_CASES = [
  { value: 'marketplace',       label: 'Marketplace' },
  { value: 'fintech',           label: 'Fintech / Payments' },
  { value: 'saas',              label: 'SaaS Platform' },
  { value: 'crypto',            label: 'Crypto / Web3' },
  { value: 'ticketing',         label: 'Ticketing / Events' },
  { value: 'community',         label: 'Community / Social' },
  { value: 'affiliate',         label: 'Affiliate / Referrals' },
  { value: 'digital_products',  label: 'Digital Products' },
  { value: 'ai_saas',           label: 'AI SaaS' },
  { value: 'other',             label: 'Other' },
]

const EVENT_ESTIMATES = [
  { value: 'lt_1k',     label: 'Less than 1,000 / month' },
  { value: '1k_10k',    label: '1,000 – 10,000 / month' },
  { value: '10k_100k',  label: '10,000 – 100,000 / month' },
  { value: '100k_500k', label: '100,000 – 500,000 / month' },
  { value: 'gt_500k',   label: 'More than 500,000 / month' },
]

export default function Register() {
  const [inviteCode,      setInviteCode]      = useState('')
  const [company,         setCompany]         = useState('')
  const [website,         setWebsite]         = useState('')
  const [useCase,         setUseCase]         = useState('')
  const [estimatedEvents, setEstimatedEvents] = useState('')
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [success,         setSuccess]         = useState(false)
  const { signUp }  = useAuth()
  const navigate    = useNavigate()

  const inputStyle = {
    background: '#F8FAFC',
    border:     '1px solid #E2E8F0',
    color:      '#0F172A',
  }

  const selectStyle = {
    ...inputStyle,
    appearance: 'none' as const,
  }

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '#16C784'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '#E2E8F0'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const code = inviteCode.trim().toUpperCase()

    // ── Step 1: Validate invite code (+ email ownership pre-flight) ────────────
    try {
      const params = new URLSearchParams({ code, email: email.trim().toLowerCase() })
      const res = await fetch(`/api/beta/validate-invite?${params.toString()}`)
      const json = await res.json() as { valid: boolean; message?: string }
      if (!json.valid) {
        setError(json.message ?? 'Invalid invite code.')
        setLoading(false)
        return
      }
    } catch {
      setError('Unable to validate invite code. Please check your connection and try again.')
      setLoading(false)
      return
    }

    // ── Step 2: Create Supabase user ─────────────────────────────────────────────
    const { error: signUpErr } = await signUp(email, password)
    if (signUpErr) {
      setError(signUpErr.message)
      setLoading(false)
      return
    }

    // ── Step 3: Update org with onboarding data ──────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (prof?.organization_id) {
        const updates: Record<string, string> = {}
        if (company.trim())         updates.name                     = company.trim()
        if (website.trim())         updates.website                  = website.trim()
        if (useCase)                updates.use_case                 = useCase
        if (estimatedEvents)        updates.estimated_monthly_events = estimatedEvents
        if (Object.keys(updates).length > 0) {
          await supabase.from('organizations').update(updates).eq('id', prof.organization_id)
        }
      }

      // ── Step 4: Mark invite code as used (passes email for ownership gate) ────
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        fetch('/api/beta/use-invite', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code, email: email.trim() }),
        }).catch(() => {})  // fire-and-forget — non-critical
      }
    }

    setSuccess(true)
    setTimeout(() => navigate('/dashboard'), 1800)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8FAFC' }}>
        <div className="text-center anim-0">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.2)' }}
          >
            <CheckCircle size={28} style={{ color: '#16C784' }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#0F172A' }}>Workspace created</h2>
          <p style={{ color: '#64748B' }}>Redirecting to your dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-[440px]">

        {/* Back */}
        <Link to="/" className="flex items-center gap-1.5 text-sm mb-6" style={{ color: '#64748B' }}>
          ← Back to home
        </Link>

        {/* Logo */}
        <Link to="/" className="flex justify-center mb-8">
          <img src="/logo-horizontal.png" alt="Genuinux" style={{ height: '112px', display: 'block' }} />
        </Link>

        {/* Beta notice */}
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl mb-5 text-xs"
          style={{
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.2)',
            color: '#92400E',
          }}
        >
          <Lock size={12} style={{ color: '#F59E0B', flexShrink: 0 }} />
          <span>
            Genuinux is in <strong>controlled beta</strong>. Access is invite-only.
            No invite? <a href="mailto:beta@genuinux.io" style={{ color: '#D97706', textDecoration: 'underline' }}>
              Request one →
            </a>
          </span>
        </div>

        {/* Card */}
        <div
          className="p-8 rounded-2xl"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 24px rgba(15,23,42,0.06), 0 1px 4px rgba(15,23,42,0.04)',
          }}
        >
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#0F172A' }}>Create your workspace</h1>
          <p className="text-sm mb-7" style={{ color: '#64748B' }}>
            Start protecting your platform with AI trust infrastructure.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Invite code */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748B' }}>
                Invite code <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="BETA-XXXX-XXXX"
                required
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150 mono tracking-wider uppercase"
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {/* Company + website */}
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
                  onFocus={onFocus}
                  onBlur={onBlur}
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
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>
            </div>

            {/* Use case + estimated events */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748B' }}>
                  Use case <span style={{ color: '#94A3B8' }}>(optional)</span>
                </label>
                <select
                  value={useCase}
                  onChange={e => setUseCase(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                  style={selectStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                >
                  <option value="">Select…</option>
                  {USE_CASES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748B' }}>
                  Est. events/mo <span style={{ color: '#94A3B8' }}>(optional)</span>
                </label>
                <select
                  value={estimatedEvents}
                  onChange={e => setEstimatedEvents(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all duration-150"
                  style={selectStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                >
                  <option value="">Select…</option>
                  {EVENT_ESTIMATES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Email + password */}
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
                onFocus={onFocus}
                onBlur={onBlur}
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
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {error && (
              <p
                className="text-xs py-2.5 px-3 rounded-lg"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  color: '#DC2626',
                  border: '1px solid rgba(239,68,68,0.15)',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-trust w-full py-2.5 rounded-lg text-sm justify-center gap-2 mt-1"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              Create workspace
            </button>
          </form>

          <p className="text-xs mt-5 text-center" style={{ color: '#94A3B8' }}>
            By creating a workspace you agree to our{' '}
            <a href="mailto:legal@genuinux.io" style={{ color: '#64748B' }}>Terms</a>
            {' '}and{' '}
            <a href="mailto:legal@genuinux.io" style={{ color: '#64748B' }}>Privacy Policy</a>
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
