import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Shield, Activity, CheckCircle, XCircle,
  Clock, TrendingUp, RefreshCw, Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { RiskEvent } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal { code: string; label: string; severity: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const s = Math.floor(d / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function riskColor(level: string): string {
  if (level === 'low')      return '#16C784'
  if (level === 'medium')   return '#F59E0B'
  if (level === 'high')     return '#F97316'
  return '#EF4444'
}

function trustColor(score: number): string {
  if (score >= 70) return '#16C784'
  if (score >= 45) return '#F59E0B'
  return '#EF4444'
}

function parseSignals(raw: unknown): Signal[] {
  if (!Array.isArray(raw)) return []
  return raw as Signal[]
}

// ─── Chart: Events over time (area) ──────────────────────────────────────────

function AreaChart({ buckets }: { buckets: number[] }) {
  const W = 480, H = 72, PX = 0, PY = 6
  const max = Math.max(...buckets, 1)

  const pts = buckets.map((v, i) => {
    const x = PX + (i / (buckets.length - 1)) * (W - PX * 2)
    const y = H - PY - (v / max) * (H - PY * 2)
    return [x, y] as [number, number]
  })

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `M${PX},${H} ` + pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W - PX},${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="72" preserveAspectRatio="none">
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#16C784" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#16C784" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#ag)" />
      <path d={line}  fill="none" stroke="#16C784" strokeWidth="1.5" />
    </svg>
  )
}

// ─── Chart: Donut (decisions) ────────────────────────────────────────────────

function DonutChart({
  allow, review, block,
}: { allow: number; review: number; block: number }) {
  const total = allow + review + block
  const r = 38
  const circ = 2 * Math.PI * r
  const gap = total > 0 ? 3 : 0

  const segs = total === 0 ? [] : [
    { val: allow,  color: '#16C784' },
    { val: review, color: '#F59E0B' },
    { val: block,  color: '#EF4444' },
  ]

  let offset = 0
  const arcs = segs.map(s => {
    const len = (s.val / total) * (circ - segs.filter(x => x.val > 0).length * gap)
    const a = { ...s, len, offset }
    if (s.val > 0) offset += len + gap
    return a
  })

  return (
    <svg viewBox="0 0 100 100" width="100" height="100">
      {total === 0 ? (
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1E2D3D" strokeWidth="9" />
      ) : (
        arcs.map((arc, i) => arc.val > 0 && (
          <circle
            key={i}
            cx="50" cy="50" r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth="9"
            strokeDasharray={`${arc.len} ${circ}`}
            strokeDashoffset={-arc.offset}
            transform="rotate(-90 50 50)"
            strokeLinecap="butt"
          />
        ))
      )}
      <text x="50" y="47" textAnchor="middle" fill="#FFFFFF"
        fontSize="14" fontWeight="bold" fontFamily="IBM Plex Mono, monospace">
        {total > 0 ? total.toLocaleString() : '—'}
      </text>
      <text x="50" y="58" textAnchor="middle" fill="#475569"
        fontSize="7.5" fontFamily="Syne, sans-serif">
        events
      </text>
    </svg>
  )
}

// ─── Chart: Horizontal bar ───────────────────────────────────────────────────

function HorizBar({ label, count, max, color, sub }: {
  label: string; count: number; max: number; color: string; sub?: string
}) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: '#94A3B8' }}>{label}</span>
        <span className="text-xs mono font-semibold" style={{ color }}>
          {count.toLocaleString()}
          {sub && <span style={{ color: '#475569', fontWeight: 400 }}> {sub}</span>}
        </span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 4, background: '#1E2D3D' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Overview() {
  const { user } = useAuth()
  const [orgId,   setOrgId]   = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string>('')
  const [events,  setEvents]  = useState<RiskEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [, setTick] = useState(0)

  // ── Data loading ──────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!profile?.organization_id) {
        setError('No organization linked to this account.')
        setLoading(false)
        return
      }
      const oid = profile.organization_id as string
      setOrgId(oid)

      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', oid)
        .single()
      if (org) setOrgName(org.name as string)
    })()
  }, [user])

  const fetchEvents = useCallback(async () => {
    if (!orgId) return
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data, error: err } = await supabase
      .from('risk_events')
      .select('*')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200)

    if (err) setError(err.message)
    else setEvents((data ?? []) as RiskEvent[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { void fetchEvents() }, [fetchEvents])

  // Real-time
  useEffect(() => {
    if (!orgId) return
    const ch = supabase
      .channel(`ov:${orgId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'risk_events', filter: `organization_id=eq.${orgId}`,
      }, payload => {
        setEvents(prev => [payload.new as RiskEvent, ...prev].slice(0, 200))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [orgId])

  // Tick every 30s for relative times
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Derived metrics ───────────────────────────────────────────

  const total   = events.length
  const allowed = useMemo(() => events.filter(e => e.decision === 'allow').length,  [events])
  const blocked = useMemo(() => events.filter(e => e.decision === 'block').length,  [events])
  const reviews = useMemo(() => events.filter(e => e.decision === 'review').length, [events])
  const avgTrust = useMemo(() =>
    total > 0 ? Math.round(events.reduce((s, e) => s + e.trust_score, 0) / total) : 0
  , [events, total])
  const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0'

  // Hourly buckets (last 24h, newest = index 23)
  const hourlyBuckets = useMemo(() => {
    const b = new Array(24).fill(0)
    const now = Date.now()
    events.forEach(ev => {
      const h = Math.floor((now - new Date(ev.created_at).getTime()) / 3_600_000)
      if (h >= 0 && h < 24) b[23 - h]++
    })
    return b
  }, [events])

  // Risk level counts
  const riskLevels = useMemo(() => {
    const c = { low: 0, medium: 0, high: 0, critical: 0 }
    events.forEach(e => { c[e.risk_level as keyof typeof c]++ })
    return c
  }, [events])
  const maxRisk = Math.max(...Object.values(riskLevels), 1)

  // Top signals
  const topSignals = useMemo(() => {
    const c: Record<string, { label: string; count: number }> = {}
    events.forEach(ev => {
      parseSignals(ev.signals_json).forEach(s => {
        if (!c[s.code]) c[s.code] = { label: s.label, count: 0 }
        c[s.code].count++
      })
    })
    return Object.entries(c)
      .map(([, v]) => v)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [events])
  const maxSignal = Math.max(...topSignals.map(s => s.count), 1)

  // Top countries
  const topCountries = useMemo(() => {
    const c: Record<string, number> = {}
    events.forEach(e => { if (e.country) c[e.country] = (c[e.country] ?? 0) + 1 })
    return Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cc, count]) => ({ cc, count }))
  }, [events])
  const maxCountry = Math.max(...topCountries.map(c => c.count), 1)

  // ── Render ────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen gap-3" style={{ color: '#475569' }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading dashboard…</span>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <div className="g-card p-5 text-sm" style={{ color: '#EF4444' }}>{error}</div>
    </div>
  )

  const CARDS = [
    {
      label: 'Total Checks',
      value: total > 0 ? total.toLocaleString() : '—',
      sub: 'Last 24 hours',
      icon: Activity,
      color: '#94A3B8',
      accent: false,
    },
    {
      label: 'Approved',
      value: allowed > 0 ? allowed.toLocaleString() : '—',
      sub: total > 0 ? `${((allowed / total) * 100).toFixed(1)}% of total` : 'no data',
      icon: CheckCircle,
      color: '#16C784',
      accent: true,
    },
    {
      label: 'Blocked',
      value: blocked > 0 ? blocked.toLocaleString() : '—',
      sub: `${blockRate}% block rate`,
      icon: XCircle,
      color: '#EF4444',
      accent: false,
    },
    {
      label: 'Review Required',
      value: reviews > 0 ? reviews.toLocaleString() : '—',
      sub: total > 0 ? `${((reviews / total) * 100).toFixed(1)}% of total` : 'no data',
      icon: Clock,
      color: '#F59E0B',
      accent: false,
    },
    {
      label: 'Avg Trust Score',
      value: total > 0 ? avgTrust : '—',
      sub: total > 0 ? (avgTrust >= 70 ? 'Healthy baseline' : 'Elevated risk') : 'no data',
      icon: TrendingUp,
      color: total > 0 ? trustColor(avgTrust) : '#475569',
      accent: false,
    },
    {
      label: 'Fraud Prevented',
      value: blocked > 0 ? `~$${(blocked * 47).toLocaleString()}` : '—',
      sub: `Est. at $47 avg value`,
      icon: Zap,
      color: '#16C784',
      accent: false,
    },
  ]

  return (
    <div className="p-7" style={{ maxWidth: 1200 }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-7">
        <div>
          {orgName && (
            <p className="text-xs font-medium uppercase tracking-widest mb-1.5" style={{ color: '#475569' }}>
              {orgName}
            </p>
          )}
          <h1
            className="text-2xl font-bold leading-none"
            style={{ fontFamily: 'Syne, sans-serif', color: '#FFFFFF' }}
          >
            Overview
          </h1>
          <p className="text-sm mt-1.5" style={{ color: '#475569' }}>
            Anti-fraud activity — last 24 hours
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs mono" style={{ color: '#16C784' }}>
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
            Live
          </span>
          <button
            onClick={() => void fetchEvents()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150"
            style={{ border: '1px solid #1E2D3D', color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {CARDS.map((c, i) => (
          <div key={i} className="g-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider leading-tight"
                style={{ color: '#475569' }}
              >
                {c.label}
              </p>
              <c.icon size={13} style={{ color: c.color, flexShrink: 0 }} />
            </div>
            <p
              className="text-2xl font-bold mono leading-none mb-1.5"
              style={{ color: c.accent ? c.color : '#FFFFFF' }}
            >
              {c.value}
            </p>
            <p className="text-[11px]" style={{ color: '#2D4057' }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Row 1: Area chart + Donut ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

        {/* Area chart */}
        <div className="g-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
                Events over time
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Hourly — last 24 hours</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: '#16C784' }} />
              <span className="text-xs mono" style={{ color: '#475569' }}>
                {total.toLocaleString()} total
              </span>
            </div>
          </div>

          {total === 0 ? (
            <div
              className="flex items-center justify-center rounded-xl"
              style={{ height: 72, background: '#07111F', border: '1px solid #1E2D3D' }}
            >
              <p className="text-xs" style={{ color: '#2D4057' }}>No events yet</p>
            </div>
          ) : (
            <div>
              <AreaChart buckets={hourlyBuckets} />
              <div className="flex justify-between mt-2">
                {['24h', '18h', '12h', '6h', 'now'].map(l => (
                  <span key={l} className="text-[10px] mono" style={{ color: '#2D4057' }}>{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Decisions donut */}
        <div className="g-card p-5">
          <p className="text-sm font-semibold mb-1" style={{ color: '#FFFFFF' }}>Decisions</p>
          <p className="text-xs mb-4" style={{ color: '#475569' }}>Distribution</p>

          <div className="flex items-center gap-5">
            <DonutChart allow={allowed} review={reviews} block={blocked} />
            <div className="space-y-3 flex-1">
              {[
                { label: 'Approve', count: allowed,  color: '#16C784', cls: 'badge-allow' },
                { label: 'Review',  count: reviews,  color: '#F59E0B', cls: 'badge-review' },
                { label: 'Block',   count: blocked,  color: '#EF4444', cls: 'badge-block' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: row.color }}
                    />
                    <span className="text-xs" style={{ color: '#94A3B8' }}>{row.label}</span>
                  </div>
                  <span className="text-xs font-semibold mono" style={{ color: row.color }}>
                    {row.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Risk levels + Signals + Countries ──────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        {/* Risk levels */}
        <div className="g-card p-5">
          <p className="text-sm font-semibold mb-1" style={{ color: '#FFFFFF' }}>
            Risk distribution
          </p>
          <p className="text-xs mb-4" style={{ color: '#475569' }}>By level</p>
          <div className="space-y-3">
            {[
              { key: 'low',      label: 'Low',      color: '#16C784' },
              { key: 'medium',   label: 'Medium',   color: '#F59E0B' },
              { key: 'high',     label: 'High',     color: '#F97316' },
              { key: 'critical', label: 'Critical', color: '#EF4444' },
            ].map(r => (
              <HorizBar
                key={r.key}
                label={r.label}
                count={riskLevels[r.key as keyof typeof riskLevels]}
                max={maxRisk}
                color={r.color}
              />
            ))}
          </div>
        </div>

        {/* Top signals */}
        <div className="g-card p-5">
          <p className="text-sm font-semibold mb-1" style={{ color: '#FFFFFF' }}>
            Top signals
          </p>
          <p className="text-xs mb-4" style={{ color: '#475569' }}>Most detected</p>
          {topSignals.length === 0 ? (
            <p className="text-xs" style={{ color: '#2D4057' }}>No signals detected yet</p>
          ) : (
            <div className="space-y-3">
              {topSignals.map(s => (
                <HorizBar
                  key={s.label}
                  label={s.label}
                  count={s.count}
                  max={maxSignal}
                  color="#F97316"
                />
              ))}
            </div>
          )}
        </div>

        {/* Top countries */}
        <div className="g-card p-5">
          <p className="text-sm font-semibold mb-1" style={{ color: '#FFFFFF' }}>
            Top countries
          </p>
          <p className="text-xs mb-4" style={{ color: '#475569' }}>By event volume</p>
          {topCountries.length === 0 ? (
            <p className="text-xs" style={{ color: '#2D4057' }}>No country data yet</p>
          ) : (
            <div className="space-y-3">
              {topCountries.map(c => (
                <HorizBar
                  key={c.cc}
                  label={c.cc}
                  count={c.count}
                  max={maxCountry}
                  color="#94A3B8"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent events table ───────────────────────────────── */}
      <div className="g-card overflow-hidden">
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #1E2D3D' }}
        >
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
              Recent Events
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
              Latest {Math.min(events.length, 20)} of {events.length} in last 24h
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs mono" style={{ color: '#16C784' }}>
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
            Live
          </span>
        </div>

        {events.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Shield size={24} className="mx-auto mb-3" style={{ color: '#1E2D3D' }} />
            <p className="text-sm font-semibold mb-1" style={{ color: '#475569' }}>
              No events yet
            </p>
            <p className="text-xs" style={{ color: '#2D4057' }}>
              Send your first event via{' '}
              <code className="mono" style={{ color: '#475569' }}>POST /api/risk/check</code>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #1E2D3D' }}>
                  {['User ID', 'Event type', 'Risk level', 'Trust', 'Fraud', 'Decision', 'Time'].map(h => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: '#2D4057', background: '#07111F' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 20).map((ev, i) => (
                  <tr
                    key={ev.id}
                    style={{
                      borderBottom: i < 19 ? '1px solid #0D1B2A' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#0B1220')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* User ID */}
                    <td className="px-5 py-3 text-xs mono max-w-[140px]" style={{ color: '#94A3B8' }}>
                      <span className="truncate block" style={{ maxWidth: 130 }}>
                        {ev.external_user_id}
                      </span>
                    </td>

                    {/* Event type */}
                    <td className="px-5 py-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded-md mono"
                        style={{ background: '#07111F', color: '#94A3B8', border: '1px solid #1E2D3D' }}
                      >
                        {ev.event_type}
                      </span>
                    </td>

                    {/* Risk level */}
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium badge-${ev.risk_level}`}
                      >
                        {ev.risk_level}
                      </span>
                    </td>

                    {/* Trust score */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="rounded-full overflow-hidden flex-shrink-0"
                          style={{ width: 40, height: 3, background: '#1E2D3D' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${ev.trust_score}%`,
                              background: trustColor(ev.trust_score),
                            }}
                          />
                        </div>
                        <span
                          className="text-xs mono font-semibold"
                          style={{ color: trustColor(ev.trust_score) }}
                        >
                          {ev.trust_score}
                        </span>
                      </div>
                    </td>

                    {/* Fraud score */}
                    <td className="px-5 py-3">
                      <span
                        className="text-xs mono font-semibold"
                        style={{ color: ev.fraud_score >= 40 ? '#EF4444' : '#475569' }}
                      >
                        {ev.fraud_score}
                      </span>
                    </td>

                    {/* Decision */}
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full mono badge-${ev.decision}`}>
                        {ev.decision}
                      </span>
                    </td>

                    {/* Time */}
                    <td className="px-5 py-3 text-xs mono" style={{ color: '#2D4057' }}>
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
