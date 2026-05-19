import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Activity, CheckCircle, XCircle, Clock, TrendingUp,
  RefreshCw, Eye, AlertTriangle, Globe, Monitor,
  Wifi, ArrowUpRight, Shield, Users,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { RiskEvent } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal { code: string; label: string; severity: string }

type SpikeSeverity = 'medium' | 'high' | 'critical'

interface SpikeAlert {
  type: 'ip_surge' | 'high_risk_spike' | 'multi_account_device' | 'country_risk'
  severity: SpikeSeverity
  title: string
  value: string
  sub: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPIKE_COLORS: Record<SpikeSeverity, { text: string; bg: string; border: string }> = {
  medium:   { text: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)'  },
  high:     { text: '#F97316', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.2)'  },
  critical: { text: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)'   },
}

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

function trustColor(score: number): string {
  if (score >= 70) return '#16C784'
  if (score >= 45) return '#F59E0B'
  return '#EF4444'
}

function fraudColor(score: number): string {
  if (score >= 70) return '#EF4444'
  if (score >= 40) return '#F59E0B'
  return '#16C784'
}

function parseSignals(raw: unknown): Signal[] {
  if (!Array.isArray(raw)) return []
  return raw as Signal[]
}

// ─── Chart: Area ──────────────────────────────────────────────────────────────

function AreaChart({ buckets }: { buckets: number[] }) {
  const W = 480, H = 72, PY = 5
  const max = Math.max(...buckets, 1)
  const pts = buckets.map((v, i) => [
    (i / (buckets.length - 1)) * W,
    H - PY - (v / max) * (H - PY * 2),
  ] as [number, number])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `M0,${H} ` + pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W},${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="72" preserveAspectRatio="none">
      <defs>
        <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#16C784" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#16C784" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#ag2)" />
      <path d={line}  fill="none" stroke="#16C784" strokeWidth="1.5" />
    </svg>
  )
}

// ─── Chart: Donut ─────────────────────────────────────────────────────────────

function DonutChart({ allow, review, block }: { allow: number; review: number; block: number }) {
  const total = allow + review + block
  const r = 32, circ = 2 * Math.PI * r
  const gap = total > 0 ? 3 : 0
  const segs = total === 0 ? [] : [
    { val: allow,  color: '#16C784' },
    { val: review, color: '#F59E0B' },
    { val: block,  color: '#EF4444' },
  ]
  let off = 0
  const arcs = segs.map(s => {
    const len = (s.val / total) * (circ - segs.filter(x => x.val > 0).length * gap)
    const a = { ...s, len, off }
    if (s.val > 0) off += len + gap
    return a
  })
  return (
    <svg viewBox="0 0 88 88" width="88" height="88">
      {total === 0
        ? <circle cx="44" cy="44" r={r} fill="none" stroke="#1E2D3D" strokeWidth="7" />
        : arcs.map((arc, i) => arc.val > 0 && (
          <circle key={i} cx="44" cy="44" r={r} fill="none" stroke={arc.color} strokeWidth="7"
            strokeDasharray={`${arc.len} ${circ}`} strokeDashoffset={-arc.off}
            transform="rotate(-90 44 44)" strokeLinecap="butt" />
        ))}
      <text x="44" y="41" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="bold" fontFamily="IBM Plex Mono, monospace">
        {total > 0 ? total.toLocaleString() : '—'}
      </text>
      <text x="44" y="52" textAnchor="middle" fill="#475569" fontSize="7" fontFamily="Syne, sans-serif">
        events
      </text>
    </svg>
  )
}

// ─── Chart: Fraud histogram ───────────────────────────────────────────────────

const HIST_COLORS = [
  '#16C784','#16C784','#16C784','#16C784',
  '#F59E0B','#F59E0B',
  '#F97316','#F97316',
  '#EF4444','#EF4444',
]

function FraudHistogram({ buckets }: { buckets: number[] }) {
  const MAX_H = 64
  const max = Math.max(...buckets, 1)
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height: MAX_H }}>
        {buckets.map((v, i) => (
          <div key={i} className="flex-1 flex items-end" style={{ height: MAX_H }}>
            <div className="w-full rounded-[2px]" style={{
              height: v > 0 ? Math.max((v / max) * MAX_H, 3) : 1,
              background: v > 0 ? HIST_COLORS[i] : '#1E2D3D',
              opacity: v > 0 ? 0.85 : 0.3,
              transition: 'height 0.5s ease',
            }} />
          </div>
        ))}
      </div>
      <div className="flex mt-1.5">
        {['0','10','20','30','40','50','60','70','80','90+'].map((l, i) => (
          <span key={i} className="flex-1 text-[9px] mono text-center" style={{ color: '#2D4057' }}>{l}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Chart: HorizBar ─────────────────────────────────────────────────────────

function HorizBar({ label, count, max, color, pct: pctOverride }: {
  label: string; count: number; max: number; color: string; pct?: number
}) {
  const pct = pctOverride ?? (max > 0 ? (count / max) * 100 : 0)
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs truncate pr-2" style={{ color: '#94A3B8' }}>{label}</span>
        <span className="text-xs mono font-semibold flex-shrink-0" style={{ color }}>{count.toLocaleString()}</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 3, background: '#1E2D3D' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Overview() {
  const { user } = useAuth()
  const [orgId,      setOrgId]      = useState<string | null>(null)
  const [shadowMode, setShadowMode] = useState(false)
  const [events,     setEvents]     = useState<RiskEvent[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [newIds,     setNewIds]     = useState<Set<string>>(new Set())
  const [, setTick] = useState(0)
  const feedRef = useRef<HTMLDivElement>(null)

  // ── Data loading ──────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('user_id', user.id).single()
      if (!profile?.organization_id) {
        setError('No organization linked to this account.')
        setLoading(false)
        return
      }
      const oid = profile.organization_id as string
      setOrgId(oid)
      const { data: org } = await supabase
        .from('organizations').select('shadow_mode').eq('id', oid).single()
      if (org) setShadowMode(Boolean((org as { shadow_mode?: boolean }).shadow_mode))
    })()
  }, [user])

  const fetchEvents = useCallback(async () => {
    if (!orgId) return
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data, error: err } = await supabase
      .from('risk_events').select('*').eq('organization_id', orgId)
      .gte('created_at', since).order('created_at', { ascending: false }).limit(200)
    if (err) setError(err.message)
    else setEvents((data ?? []) as RiskEvent[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { void fetchEvents() }, [fetchEvents])

  // Real-time subscription — flash new events in feed
  useEffect(() => {
    if (!orgId) return
    const ch = supabase
      .channel(`ov:${orgId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'risk_events', filter: `organization_id=eq.${orgId}`,
      }, payload => {
        const ev = payload.new as RiskEvent
        setEvents(prev => [ev, ...prev].slice(0, 200))
        setNewIds(prev => new Set([...prev, ev.id]))
        setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(ev.id); return n }), 4000)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [orgId])

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

  const shadowWouldBlock  = useMemo(() => events.filter(e => e.shadow_mode && e.suggested_decision === 'block').length,  [events])
  const shadowWouldReview = useMemo(() => events.filter(e => e.shadow_mode && e.suggested_decision === 'review').length, [events])

  const riskLevels = useMemo(() => {
    const c = { low: 0, medium: 0, high: 0, critical: 0 }
    events.forEach(e => { c[e.risk_level as keyof typeof c]++ })
    return c
  }, [events])
  const maxRisk = Math.max(...Object.values(riskLevels), 1)
  const highRisk = riskLevels.high + riskLevels.critical

  const hourlyBuckets = useMemo(() => {
    const b = new Array(24).fill(0)
    const now = Date.now()
    events.forEach(ev => {
      const h = Math.floor((now - new Date(ev.created_at).getTime()) / 3_600_000)
      if (h >= 0 && h < 24) b[23 - h]++
    })
    return b
  }, [events])

  const fraudBuckets = useMemo(() => {
    const b = new Array(10).fill(0)
    events.forEach(e => { b[Math.min(Math.floor(e.fraud_score / 10), 9)]++ })
    return b
  }, [events])

  const topSignals = useMemo(() => {
    const c: Record<string, { label: string; count: number; severity: string }> = {}
    events.forEach(ev => {
      parseSignals(ev.signals_json).forEach(s => {
        if (!c[s.code]) c[s.code] = { label: s.label, count: 0, severity: s.severity }
        c[s.code].count++
      })
    })
    return Object.values(c).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [events])
  const maxSignal = Math.max(...topSignals.map(s => s.count), 1)

  const topCountries = useMemo(() => {
    const c: Record<string, number> = {}
    events.forEach(e => { if (e.country) c[e.country] = (c[e.country] ?? 0) + 1 })
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cc, count]) => ({ cc, count }))
  }, [events])
  const maxCountry = Math.max(...topCountries.map(c => c.count), 1)

  // ── Spike alert detection ─────────────────────────────────────

  const spikeAlerts = useMemo<SpikeAlert[]>(() => {
    const now  = Date.now()
    const h1ms = 60 * 60_000
    const h4ms = 4 * h1ms
    const alerts: SpikeAlert[] = []

    // 1. IP Signup Surge (last 1h)
    const ipSig: Record<string, number> = {}
    events.forEach(e => {
      if (e.event_type === 'signup' && e.ip_address && now - new Date(e.created_at).getTime() < h1ms) {
        ipSig[e.ip_address] = (ipSig[e.ip_address] ?? 0) + 1
      }
    })
    const [topIP, topIPCount] = Object.entries(ipSig).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
    if (topIPCount >= 3) {
      alerts.push({
        type: 'ip_surge',
        severity: topIPCount >= 10 ? 'critical' : topIPCount >= 5 ? 'high' : 'medium',
        title: 'Signup surge from IP',
        value: `${topIPCount} signups`,
        sub: topIP,
      })
    }

    // 2. High-risk spike (last 4h vs previous 4h)
    const last4h = events.filter(e => now - new Date(e.created_at).getTime() < h4ms)
    const prev4h = events.filter(e => {
      const age = now - new Date(e.created_at).getTime()
      return age >= h4ms && age < h4ms * 2
    })
    const lastHigh = last4h.filter(e => e.risk_level === 'high' || e.risk_level === 'critical').length
    const prevHigh = prev4h.filter(e => e.risk_level === 'high' || e.risk_level === 'critical').length
    if (prevHigh > 0 && lastHigh > prevHigh * 1.5) {
      const pct = Math.round(((lastHigh - prevHigh) / prevHigh) * 100)
      alerts.push({
        type: 'high_risk_spike',
        severity: pct >= 100 ? 'critical' : 'high',
        title: 'High-risk events spike',
        value: `+${pct}% vs prev 4h`,
        sub: `${lastHigh} high/critical events`,
      })
    }

    // 3. Multi-account device
    const devUsers: Record<string, Set<string>> = {}
    events.forEach(e => {
      if (e.device_id && e.external_user_id) {
        if (!devUsers[e.device_id]) devUsers[e.device_id] = new Set()
        devUsers[e.device_id].add(e.external_user_id)
      }
    })
    const [topDev, topDevSet] = Object.entries(devUsers)
      .filter(([, s]) => s.size >= 2)
      .sort((a, b) => b[1].size - a[1].size)[0] ?? ['', new Set()]
    if (topDev && topDevSet.size >= 2) {
      alerts.push({
        type: 'multi_account_device',
        severity: topDevSet.size >= 5 ? 'critical' : topDevSet.size >= 3 ? 'high' : 'medium',
        title: 'Device shared across accounts',
        value: `${topDevSet.size} accounts`,
        sub: topDev.length > 16 ? `${topDev.slice(0, 16)}…` : topDev,
      })
    }

    // 4. Country risk concentration
    const ccStats: Record<string, { total: number; high: number }> = {}
    events.forEach(e => {
      if (!e.country) return
      if (!ccStats[e.country]) ccStats[e.country] = { total: 0, high: 0 }
      ccStats[e.country].total++
      if (e.risk_level === 'high' || e.risk_level === 'critical') ccStats[e.country].high++
    })
    const topCC = Object.entries(ccStats)
      .filter(([, v]) => v.total >= 5)
      .map(([cc, v]) => ({ cc, pct: v.high / v.total, ...v }))
      .sort((a, b) => b.pct - a.pct)[0]
    if (topCC && topCC.pct >= 0.5) {
      const p = Math.round(topCC.pct * 100)
      alerts.push({
        type: 'country_risk',
        severity: p >= 75 ? 'critical' : p >= 60 ? 'high' : 'medium',
        title: 'Country risk concentration',
        value: `${p}% high-risk`,
        sub: `${topCC.cc} · ${topCC.total} events`,
      })
    }

    return alerts
  }, [events])

  // ── Loading / error states ────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: '#475569' }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading dashboard…</span>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <div className="g-card p-5 text-sm" style={{ color: '#EF4444' }}>{error}</div>
    </div>
  )

  const STAT_CARDS = [
    { label: 'Total Checks',    value: total > 0 ? total.toLocaleString() : '—',         sub: 'Last 24 hours',                              icon: Activity,     color: '#94A3B8', hi: false },
    { label: 'Approved',        value: allowed > 0 ? allowed.toLocaleString() : '—',      sub: total > 0 ? `${((allowed/total)*100).toFixed(1)}% of total` : '—', icon: CheckCircle,  color: '#16C784', hi: true  },
    { label: 'Blocked',         value: blocked > 0 ? blocked.toLocaleString() : '—',      sub: `${blockRate}% block rate`,                    icon: XCircle,      color: '#EF4444', hi: false },
    { label: 'Review Queue',    value: reviews > 0 ? reviews.toLocaleString() : '—',      sub: total > 0 ? `${((reviews/total)*100).toFixed(1)}% of total` : '—', icon: Clock,        color: '#F59E0B', hi: false },
    { label: 'Avg Trust Score', value: total > 0 ? String(avgTrust) : '—',                sub: avgTrust >= 70 ? 'Healthy baseline' : total > 0 ? 'Elevated risk' : '—', icon: TrendingUp, color: total > 0 ? trustColor(avgTrust) : '#475569', hi: false },
    { label: 'High-Risk Events',value: highRisk > 0 ? highRisk.toLocaleString() : '—',   sub: 'High + critical level',                        icon: AlertTriangle, color: highRisk > 0 ? '#F97316' : '#475569', hi: false },
  ]

  const SPIKE_ICONS = {
    ip_surge:              Wifi,
    high_risk_spike:       TrendingUp,
    multi_account_device:  Monitor,
    country_risk:          Globe,
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="p-7" style={{ maxWidth: 1400 }}>

      {/* ── Shadow Mode Banner ────────────────────────────────── */}
      {shadowMode && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3.5 rounded-lg"
          style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)' }}>
          <Eye size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#38BDF8' }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#38BDF8' }}>Shadow Mode is active</p>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
              No users are being blocked. Decisions reflect what <em>would have happened</em> in Live Mode.
            </p>
          </div>
          {(shadowWouldBlock > 0 || shadowWouldReview > 0) && (
            <div className="flex items-center gap-4 flex-shrink-0 text-xs mono">
              {shadowWouldBlock  > 0 && <span><span style={{ color: '#EF4444' }}>{shadowWouldBlock}</span><span style={{ color: '#475569' }}> would block</span></span>}
              {shadowWouldReview > 0 && <span><span style={{ color: '#F59E0B' }}>{shadowWouldReview}</span><span style={{ color: '#475569' }}> would review</span></span>}
            </div>
          )}
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-bold" style={{ color: '#E2E8F0' }}>Risk Intelligence</h1>
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Live monitoring — last 24 hours</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs mono" style={{ color: '#16C784' }}>
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
            Live
          </span>
          <button onClick={() => void fetchEvents()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150"
            style={{ border: '1px solid #1E2D3D', color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stat Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        {STAT_CARDS.map((c, i) => (
          <div key={i} className="g-card p-4"
            style={c.hi ? { background: 'rgba(22,199,132,0.04)', borderColor: 'rgba(22,199,132,0.15)' } : undefined}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#2D4057' }}>
                {c.label}
              </p>
              <c.icon size={13} style={{ color: c.color, flexShrink: 0 }} />
            </div>
            <p className="text-2xl font-bold mono leading-none mb-1.5"
              style={{ color: c.hi ? c.color : '#FFFFFF' }}>
              {c.value}
            </p>
            <p className="text-[11px]" style={{ color: '#2D4057' }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main 3-col layout ─────────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 340px' }}>

        {/* ── Col 1-2: Charts + Alerts ──────────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* Risk Spike Alerts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
                Risk Spike Alerts
              </p>
              {spikeAlerts.length === 0 && (
                <span className="text-[10px] mono px-2 py-0.5 rounded"
                  style={{ background: 'rgba(22,199,132,0.08)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)' }}>
                  System normal
                </span>
              )}
            </div>
            {spikeAlerts.length === 0 ? (
              <div className="g-card px-5 py-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.15)' }}>
                  <Shield size={14} style={{ color: '#16C784' }} />
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#16C784' }}>No anomalies detected</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#475569' }}>
                    All patterns within normal parameters for the last 24 hours.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {spikeAlerts.map((alert, i) => {
                  const col = SPIKE_COLORS[alert.severity]
                  const Icon = SPIKE_ICONS[alert.type]
                  return (
                    <div key={i} className="g-card px-4 py-3.5 flex items-start gap-3"
                      style={{ borderLeft: `3px solid ${col.text}`, background: col.bg }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                        <Icon size={13} style={{ color: col.text }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <p className="text-xs font-semibold" style={{ color: '#E2E8F0' }}>{alert.title}</p>
                          <span className="text-[9px] mono px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ color: col.text, border: `1px solid ${col.border}` }}>
                            {alert.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm font-bold mono" style={{ color: col.text }}>{alert.value}</p>
                        <p className="text-[10px] mono mt-0.5 truncate" style={{ color: '#475569' }}>{alert.sub}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Activity chart */}
          <div className="g-card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>Events Over Time</p>
                <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Hourly — last 24 hours</p>
              </div>
              <span className="text-xs mono" style={{ color: '#475569' }}>
                {total.toLocaleString()} events
              </span>
            </div>
            {total === 0 ? (
              <div className="flex items-center justify-center rounded-xl"
                style={{ height: 72, background: '#07111F', border: '1px solid #1E2D3D' }}>
                <p className="text-xs" style={{ color: '#2D4057' }}>No events yet</p>
              </div>
            ) : (
              <>
                <AreaChart buckets={hourlyBuckets} />
                <div className="flex justify-between mt-1.5">
                  {['24h ago', '18h', '12h', '6h', 'now'].map(l => (
                    <span key={l} className="text-[10px] mono" style={{ color: '#2D4057' }}>{l}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Decision Breakdown + Risk Distribution */}
          <div className="grid grid-cols-2 gap-4">

            {/* Decision Breakdown */}
            <div className="g-card p-5">
              <p className="text-sm font-semibold mb-0.5" style={{ color: '#FFFFFF' }}>Decision Breakdown</p>
              <p className="text-xs mb-4" style={{ color: '#475569' }}>Distribution by outcome</p>
              <div className="flex items-center gap-4">
                <DonutChart allow={allowed} review={reviews} block={blocked} />
                <div className="space-y-3 flex-1">
                  {[
                    { label: 'Approve', count: allowed, color: '#16C784' },
                    { label: 'Review',  count: reviews, color: '#F59E0B' },
                    { label: 'Block',   count: blocked, color: '#EF4444' },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: row.color }} />
                          <span className="text-xs" style={{ color: '#94A3B8' }}>{row.label}</span>
                        </div>
                        <span className="text-xs font-semibold mono" style={{ color: row.color }}>
                          {row.count.toLocaleString()}
                        </span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 2, background: '#1E2D3D' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: total > 0 ? `${(row.count / total) * 100}%` : '0%', background: row.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Risk Level Distribution */}
            <div className="g-card p-5">
              <p className="text-sm font-semibold mb-0.5" style={{ color: '#FFFFFF' }}>Risk Distribution</p>
              <p className="text-xs mb-5" style={{ color: '#475569' }}>Events by risk level</p>
              <div className="space-y-3.5">
                {[
                  { key: 'low',      label: 'Low',      color: '#16C784' },
                  { key: 'medium',   label: 'Medium',   color: '#F59E0B' },
                  { key: 'high',     label: 'High',     color: '#F97316' },
                  { key: 'critical', label: 'Critical', color: '#EF4444' },
                ].map(r => (
                  <HorizBar key={r.key} label={r.label}
                    count={riskLevels[r.key as keyof typeof riskLevels]}
                    max={maxRisk} color={r.color} />
                ))}
              </div>
            </div>
          </div>

          {/* Fraud Score Histogram + Top Countries */}
          <div className="grid grid-cols-2 gap-4">
            <div className="g-card p-5">
              <p className="text-sm font-semibold mb-0.5" style={{ color: '#FFFFFF' }}>Fraud Score Distribution</p>
              <p className="text-xs mb-4" style={{ color: '#475569' }}>Events by score bucket</p>
              {total === 0 ? (
                <div className="flex items-center justify-center rounded-xl"
                  style={{ height: 64, background: '#07111F', border: '1px solid #1E2D3D' }}>
                  <p className="text-xs" style={{ color: '#2D4057' }}>No data yet</p>
                </div>
              ) : <FraudHistogram buckets={fraudBuckets} />}
              <div className="flex items-center flex-wrap gap-3 mt-3">
                {[
                  { label: 'Low',      color: '#16C784' },
                  { label: 'Medium',   color: '#F59E0B' },
                  { label: 'High',     color: '#F97316' },
                  { label: 'Critical', color: '#EF4444' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-[2px]" style={{ background: l.color }} />
                    <span className="text-[10px]" style={{ color: '#475569' }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="g-card p-5">
              <p className="text-sm font-semibold mb-0.5" style={{ color: '#FFFFFF' }}>Top Countries</p>
              <p className="text-xs mb-5" style={{ color: '#475569' }}>By event volume</p>
              {topCountries.length === 0 ? (
                <p className="text-xs" style={{ color: '#2D4057' }}>No country data yet</p>
              ) : (
                <div className="space-y-3.5">
                  {topCountries.map(c => (
                    <HorizBar key={c.cc} label={c.cc} count={c.count} max={maxCountry} color="#94A3B8" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Col 3: Live Feed + Top Signals + Impact ────────── */}
        <div className="space-y-4">

          {/* Live Risk Feed */}
          <div className="g-card overflow-hidden flex flex-col" style={{ maxHeight: 520 }}>
            <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
              style={{ borderBottom: '1px solid #1E2D3D' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>Live Risk Feed</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#475569' }}>
                  {total > 0 ? `${total.toLocaleString()} events` : 'Waiting for events'}
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] mono" style={{ color: '#16C784' }}>
                <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
                Live
              </span>
            </div>

            {events.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 px-5 text-center">
                <Shield size={20} className="mb-3" style={{ color: '#1E2D3D' }} />
                <p className="text-xs font-semibold mb-1" style={{ color: '#475569' }}>No events yet</p>
                <p className="text-[11px]" style={{ color: '#2D4057' }}>
                  Send your first check via{' '}
                  <code className="mono" style={{ color: '#475569' }}>POST /api/risk/check</code>
                </p>
              </div>
            ) : (
              <div ref={feedRef} className="flex-1 overflow-y-auto">
                {events.slice(0, 50).map((ev, i) => {
                  const isNew = newIds.has(ev.id)
                  return (
                    <div
                      key={ev.id}
                      className="px-5 py-3 flex items-start gap-3 transition-all duration-700"
                      style={{
                        borderBottom: i < Math.min(events.length, 50) - 1 ? '1px solid #0D1B2A' : 'none',
                        background: isNew ? 'rgba(22,199,132,0.06)' : 'transparent',
                      }}
                    >
                      {/* Decision dot */}
                      <div className="flex-shrink-0 mt-1.5">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{
                            background: ev.decision === 'block' ? '#EF4444' : ev.decision === 'review' ? '#F59E0B' : '#16C784',
                            boxShadow: isNew ? `0 0 6px ${ev.decision === 'block' ? '#EF4444' : ev.decision === 'review' ? '#F59E0B' : '#16C784'}` : 'none',
                          }}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium badge-${ev.risk_level}`}>
                            {ev.risk_level}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full mono badge-${ev.decision}`}>
                            {ev.decision}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded mono"
                            style={{ background: '#07111F', color: '#475569', border: '1px solid #1E2D3D' }}>
                            {ev.event_type}
                          </span>
                        </div>
                        <p className="text-[10px] mono truncate" style={{ color: '#475569' }}>
                          {ev.external_user_id}
                        </p>
                      </div>

                      {/* Right: scores + time */}
                      <div className="flex-shrink-0 text-right">
                        <div className="flex items-center gap-2 justify-end mb-0.5">
                          <span className="text-[10px] mono" style={{ color: trustColor(ev.trust_score) }}>
                            T{ev.trust_score}
                          </span>
                          <span className="text-[10px] mono" style={{ color: fraudColor(ev.fraud_score) }}>
                            F{ev.fraud_score}
                          </span>
                        </div>
                        <p className="text-[9px] mono" style={{ color: '#2D4057' }}>
                          {relativeTime(ev.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top Signals */}
          <div className="g-card p-5">
            <p className="text-sm font-semibold mb-0.5" style={{ color: '#FFFFFF' }}>Top Signals</p>
            <p className="text-xs mb-4" style={{ color: '#475569' }}>Most detected patterns</p>
            {topSignals.length === 0 ? (
              <p className="text-xs" style={{ color: '#2D4057' }}>No signals detected yet</p>
            ) : (
              <div className="space-y-3">
                {topSignals.map((s, i) => {
                  const sevColor = s.severity === 'critical' ? '#EF4444' : s.severity === 'high' ? '#F97316' : s.severity === 'medium' ? '#F59E0B' : '#16C784'
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-1 h-3 rounded-[1px] flex-shrink-0" style={{ background: sevColor }} />
                          <span className="text-[11px] truncate" style={{ color: '#94A3B8' }}>{s.label}</span>
                        </div>
                        <span className="text-[10px] mono font-semibold flex-shrink-0 ml-2" style={{ color: sevColor }}>
                          ×{s.count}
                        </span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 2, background: '#1E2D3D' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(s.count / maxSignal) * 100}%`, background: sevColor }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Estimated Impact */}
          <div className="g-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>Estimated Impact</p>
            </div>
            <p className="text-[11px] mb-4" style={{ color: '#475569' }}>
              Based on your data — last 24 hours
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: 'Blocked Attempts',
                  value: blocked,
                  color: '#EF4444',
                  bg: 'rgba(239,68,68,0.06)',
                  border: 'rgba(239,68,68,0.15)',
                  icon: XCircle,
                  sub: 'Fraudulent events stopped',
                },
                {
                  label: 'Reviews Created',
                  value: reviews,
                  color: '#F59E0B',
                  bg: 'rgba(245,158,11,0.06)',
                  border: 'rgba(245,158,11,0.15)',
                  icon: Clock,
                  sub: 'Events flagged for review',
                },
                {
                  label: 'Users Approved',
                  value: allowed,
                  color: '#16C784',
                  bg: 'rgba(22,199,132,0.06)',
                  border: 'rgba(22,199,132,0.15)',
                  icon: Users,
                  sub: 'Legitimate users passed',
                },
                {
                  label: 'High-Risk Caught',
                  value: highRisk,
                  color: '#F97316',
                  bg: 'rgba(249,115,22,0.06)',
                  border: 'rgba(249,115,22,0.15)',
                  icon: ArrowUpRight,
                  sub: 'High + critical events',
                },
              ].map(tile => (
                <div key={tile.label} className="rounded-lg p-3"
                  style={{ background: tile.bg, border: `1px solid ${tile.border}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <tile.icon size={11} style={{ color: tile.color }} />
                  </div>
                  <p className="text-xl font-bold mono leading-none mb-1" style={{ color: tile.color }}>
                    {tile.value.toLocaleString()}
                  </p>
                  <p className="text-[10px] font-semibold" style={{ color: tile.color }}>{tile.label}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>{tile.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
