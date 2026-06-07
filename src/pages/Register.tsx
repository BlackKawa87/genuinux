import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle, Lock, ArrowLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { INVITE_ONLY_MODE } from '../lib/featureFlags'

const USE_CASES = [
  { value: 'marketplace',      label: 'Marketplace' },
  { value: 'fintech',          label: 'Fintech / Payments' },
  { value: 'saas',             label: 'SaaS Platform' },
  { value: 'crypto',           label: 'Crypto / Web3' },
  { value: 'ticketing',        label: 'Ticketing / Events' },
  { value: 'community',        label: 'Community / Social' },
  { value: 'affiliate',        label: 'Affiliate / Referrals' },
  { value: 'digital_products', label: 'Digital Products' },
  { value: 'ai_saas',          label: 'AI SaaS' },
  { value: 'other',            label: 'Other' },
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

  const inputBase = {
    background: '#F1F4FA',
    border: '1px solid #D8DCEC',
    color: '#07090F',
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    letterSpacing: '-0.01em',
    appearance: 'none' as const,
  }

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '#16C784'
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,199,132,0.1)'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '#D8DCEC'
    e.currentTarget.style.boxShadow = 'none'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (INVITE_ONLY_MODE) {
      const code = inviteCode.trim().toUpperCase()
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
        setError('Unable to validate invite code. Check your connection and try again.')
        setLoading(false)
        return
      }
    }

    const { error: signUpErr } = await signUp(email, password)
    if (signUpErr) {
      setError(signUpErr.message)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (prof?.organization_id) {
        const updates: Record<string, string> = {}
        if (company.trim())  updates.name                     = company.trim()
        if (website.trim())  updates.website                  = website.trim()
        if (useCase)         updates.use_case                 = useCase
        if (estimatedEvents) updates.estimated_monthly_events = estimatedEvents
        if (!INVITE_ONLY_MODE) {
          updates.plan        = 'starter'
          updates.plan_source = 'self_signup'
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('organizations').update(updates).eq('id', prof.organization_id)
        }
      }

      if (INVITE_ONLY_MODE) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          const code = inviteCode.trim().toUpperCase()
          fetch('/api/beta/use-invite', {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ code, email: email.trim() }),
          }).catch(() => {})
        }
      }
    }

    setSuccess(true)
    setTimeout(() => navigate('/dashboard'), 1800)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F1F4FA' }}>
        <div className="text-center anim-0">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(22,199,132,0.09)', border: '1px solid rgba(22,199,132,0.22)' }}>
            <CheckCircle size={28} style={{ color: '#16C784' }} />
          </div>
          <h2 className="font-black mb-2"
            style={{ fontSize: '1.4rem', letterSpacing: '-0.04em', color: '#07090F', fontFamily: "'Syne', sans-serif" }}>
            Workspace created
          </h2>
          <p style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif" }}>Redirecting to your dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F1F4FA',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

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
        <Link to="/" className="flex justify-center mb-7">
          <img src="/logo-horizontal.png" alt="Genuinux" style={{ height: 88, display: 'block' }} />
        </Link>

        {/* Invite-only beta notice */}
        {INVITE_ONLY_MODE && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl mb-5 text-xs"
            style={{
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.18)',
              color: '#92400E',
              fontFamily: "'DM Sans', sans-serif",
            }}>
            <Lock size={11} style={{ color: '#F59E0B', flexShrink: 0 }} />
            <span>
              Genuinux is in <strong>controlled beta</strong>. Access is invite-only.
              No invite?{' '}
              <a href="mailto:beta@genuinux.io" style={{ color: '#D97706', textDecoration: 'underline' }}>
                Request one →
              </a>
            </span>
          </div>
        )}

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
            Create your workspace
          </h1>
          <p className="text-sm mb-8" style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif" }}>
            Start protecting your platform with AI trust infrastructure.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Invite code — shown only in invite-only mode */}
            {INVITE_ONLY_MODE && (
              <div>
                <label className="block text-xs font-semibold mb-1.5"
                  style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
                  Invite code <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  placeholder="BETA-XXXX-XXXX"
                  required
                  className="w-full px-4 py-2.5 rounded-xl text-sm mono tracking-wider uppercase"
                  style={inputBase}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>
            )}

            {/* Company + website */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5"
                  style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
                  Company name
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full px-4 py-2.5 rounded-xl text-sm"
                  style={inputBase}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5"
                  style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
                  Website <span style={{ color: '#9BA4BC' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="acme.com"
                  className="w-full px-4 py-2.5 rounded-xl text-sm"
                  style={inputBase}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>
            </div>

            {/* Use case + estimated events */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5"
                  style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
                  Use case <span style={{ color: '#9BA4BC' }}>(optional)</span>
                </label>
                <select
                  value={useCase}
                  onChange={e => setUseCase(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm"
                  style={inputBase}
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
                <label className="block text-xs font-semibold mb-1.5"
                  style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
                  Est. events/mo <span style={{ color: '#9BA4BC' }}>(optional)</span>
                </label>
                <select
                  value={estimatedEvents}
                  onChange={e => setEstimatedEvents(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm"
                  style={inputBase}
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

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold mb-1.5"
                style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
                Work email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={inputBase}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold mb-1.5"
                style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={inputBase}
                onFocus={onFocus}
                onBlur={onBlur}
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
              Create workspace
            </button>
          </form>

          <p className="text-xs mt-5 text-center" style={{ color: '#9BA4BC', fontFamily: "'DM Sans', sans-serif" }}>
            By creating a workspace you agree to our{' '}
            <a href="mailto:legal@genuinux.io" style={{ color: '#5B6480' }}>Terms</a>
            {' '}and{' '}
            <a href="mailto:legal@genuinux.io" style={{ color: '#5B6480' }}>Privacy Policy</a>
          </p>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: '#5B6480', fontFamily: "'DM Sans', sans-serif" }}>
          Already have a workspace?{' '}
          <Link to="/login" className="font-semibold transition-opacity duration-150"
            style={{ color: '#16C784' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
