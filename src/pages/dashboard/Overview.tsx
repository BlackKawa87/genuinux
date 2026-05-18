import { useEffect, useState, useCallback } from 'react'
import { Shield, TrendingUp, Activity, ArrowUpRight, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { RiskEvent } from '../../types'

// ── Helpers ───────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 70) return '#16C784'
  if (score >= 45) return '#F59E0B'
  return '#EF4444'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)   return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Component ─────────────────────────────────────────────────

export default function Overview() {
  const { user } = useAuth()

  const [orgId,   setOrgId]   = useState<string | null>(null)
  const [events,  setEvents]  = useState<RiskEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [, setTick] = useState(0) // forces relativeTime re-render

  // ── Fetch org ID from user profile ──────────────────────────
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data?.organization_id) {
          setError('No organization found for this account.')
          setLoading(false)
          return
        }
        setOrgId(data.organization_id as string)
      })
  }, [user])

  // ── Fetch recent events ──────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    if (!orgId) return
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data, error: err } = await supabase
      .from('risk_events')
      .select('*')
      .eq('organization_id', orgId)
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(100)

    if (err) {
      setError(err.message)
    } else {
      setEvents((data ?? []) as RiskEvent[])
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // ── Real-time subscription ───────────────────────────────────
  useEffect(() => {
    if (!orgId) return

    const channel = supabase
      .channel(`risk_events:${orgId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'risk_events',
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          setEvents(prev => [payload.new as RiskEvent, ...prev].slice(0, 100))
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [orgId])

  // ── Tick every 30s so relative times stay fresh ──────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Derived metrics ──────────────────────────────────────────
  const totalRequests = events.length
  const blocked       = events.filter(e => e.decision === 'block').length
  const blockRate     = totalRequests > 0 ? ((blocked / totalRequests) * 100).toFixed(1) : '0.0'
  const avgTrust      = totalRequests > 0
    ? (events.reduce((s, e) => s + e.trust_score, 0) / totalRequests).toFixed(1)
    : '—'

  const METRICS = [
    {
      label: 'Total Requests',
      value: totalRequests > 0 ? totalRequests.toLocaleString() : '—',
      sub:   'Last 24 hours',
      accent: false,
      icon:  Activity,
    },
    {
      label: 'Fraud Blocked',
      value: blocked > 0 ? blocked.toLocaleString() : '—',
      sub:   `${blockRate}% block rate`,
      accent: true,
      icon:  Shield,
    },
    {
      label: 'Avg Trust Score',
      value: avgTrust,
      sub:   totalRequests > 0
        ? (Number(avgTrust) >= 70 ? 'Low risk baseline' : 'Elevated risk')
        : 'No data yet',
      accent: true,
      icon:  TrendingUp,
    },
    {
      label: 'API Uptime',
      value: '99.97%',
      sub:   'Last 30 days',
      accent: false,
      icon:  ArrowUpRight,
    },
  ]

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center" style={{ minHeight: '300px' }}>
        <div className="flex items-center gap-3" style={{ color: '#475569' }}>
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="g-card p-6 text-sm" style={{ color: '#EF4444' }}>
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8" style={{ maxWidth: '1100px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>Overview</h1>
          <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
            Platform activity — last 24 hours
          </p>
        </div>
        <button
          onClick={fetchEvents}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150"
          style={{ border: '1px solid #1E2D3D', color: '#475569' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {METRICS.map((m, i) => (
          <div key={i} className="g-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#475569' }}>
                {m.label}
              </p>
              <m.icon size={14} style={{ color: m.accent ? '#16C784' : '#475569' }} />
            </div>
            <p className="text-3xl font-bold mono leading-none mb-1"
              style={{ color: m.accent ? '#16C784' : '#FFFFFF' }}>
              {m.value}
            </p>
            <p className="text-xs mt-2"
              style={{ color: m.accent ? 'rgba(22,199,132,0.6)' : '#475569' }}>
              {m.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Events table */}
      <div className="g-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #1E2D3D' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>Recent Events</h2>
          <span className="flex items-center gap-1.5 text-xs mono" style={{ color: '#16C784' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current pulse-dot" style={{ display: 'inline-block' }} />
            Live
          </span>
        </div>

        {events.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm" style={{ color: '#475569' }}>No events yet.</p>
            <p className="text-xs mt-1" style={{ color: '#334155' }}>
              Send your first event via <span className="mono">POST /api/analyze</span>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #1E2D3D' }}>
                  {['User ID', 'Event', 'Trust Score', 'Risk', 'Decision', 'Country', 'Time'].map(h => (
                    <th key={h}
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: '#475569' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 20).map(ev => (
                  <tr key={ev.id}
                    style={{ borderBottom: '1px solid #0F1929', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#0B1220')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-6 py-3.5 text-xs mono" style={{ color: '#94A3B8' }}>
                      {ev.external_user_id}
                    </td>
                    <td className="px-6 py-3.5 text-sm capitalize" style={{ color: '#E2E8F0' }}>
                      {ev.event_type}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: '#1E2D3D' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${ev.trust_score}%`, background: scoreColor(ev.trust_score) }} />
                        </div>
                        <span className="text-xs mono font-semibold" style={{ color: scoreColor(ev.trust_score) }}>
                          {ev.trust_score}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`badge-${ev.risk_level} text-xs px-2.5 py-0.5 rounded-full font-medium`}>
                        {ev.risk_level}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`badge-${ev.decision} text-xs px-2.5 py-0.5 rounded-full mono`}>
                        {ev.decision}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs mono" style={{ color: '#94A3B8' }}>
                      {ev.country ?? '—'}
                    </td>
                    <td className="px-6 py-3.5 text-xs mono" style={{ color: '#475569' }}>
                      {relativeTime(ev.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
