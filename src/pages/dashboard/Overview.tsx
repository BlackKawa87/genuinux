import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Activity, XCircle, Clock, TrendingUp,
  RefreshCw, Eye, AlertTriangle, Globe, Monitor,
  Wifi, Shield, CheckCircle, Radio,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useT, trustInk, fraudInk } from '../../lib/themeTokens'
import type { Tokens } from '../../lib/themeTokens'
import { useWindowSize } from '../../hooks/useWindowSize'
import {
  PageHeader, Section, Card, Button, Badge, Notice, Spinner,
  Metric, MetricRow, Meter, EmptyState,
} from '../../components/ui'
import type { RiskEvent } from '../../types'

/* ═══════════════════════════════════════════════════════════════════════════
   Overview — the operator's first three seconds.

   Reading order is deliberate and top-to-bottom:
     1. Environment      is the engine enforcing decisions, or only watching?
     2. Anomalies        is anything happening right now that needs a human?
     3. Headline volume  four numbers that describe the last 24 hours
     4. Shape            how that volume distributes across time and risk
     5. Stream           the raw feed, for when a number prompts a question

   Everything below the headline row is secondary by construction: quieter
   labels, smaller numerals, and no competing colour.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Signal { code: string; label: string; severity: string }

type SpikeSeverity = 'medium' | 'high' | 'critical'

interface SpikeAlert {
  type: 'ip_surge' | 'high_risk_spike' | 'multi_account_device' | 'country_risk'
  severity: SpikeSeverity
  title: string
  value: string
  sub: string
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

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

function parseSignals(raw: unknown): Signal[] {
  if (!Array.isArray(raw)) return []
  return raw as Signal[]
}

function severityTone(sev: SpikeSeverity, T: Tokens) {
  if (sev === 'critical') return { fill: T.riskCrit, ink: T.riskCritT }
  if (sev === 'high')     return { fill: T.riskHigh, ink: T.riskHighT }
  return { fill: T.riskMed, ink: T.riskMedT }
}

/* ── Charts ───────────────────────────────────────────────────────────────── */

function AreaChart({ buckets, T }: { buckets: number[]; T: Tokens }) {
  const W = 480, H = 88, PY = 6
  const max = Math.max(...buckets, 1)
  const pts = buckets.map((v, i) => [
    (i / (buckets.length - 1)) * W,
    H - PY - (v / max) * (H - PY * 2),
  ] as [number, number])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `M0,${H} ` + pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W},${H} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`} width="100%" height="88" preserveAspectRatio="none"
      role="img" aria-label="Events per hour over the last 24 hours"
    >
      <defs>
        <linearGradient id="ovArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={T.trust} stopOpacity="0.16" />
          <stop offset="100%" stopColor={T.trust} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Quarter gridlines give the curve something to be read against. */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke={T.border} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={area} fill="url(#ovArea)" />
      <path d={line} fill="none" stroke={T.trust} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

function DonutChart({ allow, review, block, T }: {
  allow: number; review: number; block: number; T: Tokens
}) {
  const total = allow + review + block
  const r = 34, circ = 2 * Math.PI * r
  const gap = total > 0 ? 3 : 0
  const segs = total === 0 ? [] : [
    { val: allow,  color: T.success },
    { val: review, color: T.warning },
    { val: block,  color: T.danger  },
  ]
  let off = 0
  const arcs = segs.map(s => {
    const len = (s.val / total) * (circ - segs.filter(x => x.val > 0).length * gap)
    const a = { ...s, len, off }
    if (s.val > 0) off += len + gap
    return a
  })

  return (
    <svg viewBox="0 0 92 92" width="92" height="92" role="img" aria-label={`${total} events by decision`}>
      {total === 0
        ? <circle cx="46" cy="46" r={r} fill="none" stroke={T.border} strokeWidth="7" />
        : arcs.map((arc, i) => arc.val > 0 && (
          <circle key={i} cx="46" cy="46" r={r} fill="none" stroke={arc.color} strokeWidth="7"
            strokeDasharray={`${arc.len} ${circ}`} strokeDashoffset={-arc.off}
            transform="rotate(-90 46 46)" strokeLinecap="butt" />
        ))}
      <text x="46" y="44" textAnchor="middle" fill={T.text} fontSize="14" fontWeight="600"
        fontFamily="IBM Plex Mono, monospace" letterSpacing="-0.5">
        {total > 0 ? total.toLocaleString() : '—'}
      </text>
      <text x="46" y="56" textAnchor="middle" fill={T.textDim} fontSize="7.5"
        fontFamily="DM Sans, sans-serif" letterSpacing="0.6">
        EVENTS
      </text>
    </svg>
  )
}

function FraudHistogram({ buckets, T }: { buckets: number[]; T: Tokens }) {
  const MAX_H = 72
  const max = Math.max(...buckets, 1)
  // Bucket index maps to the risk band that score range falls into.
  const colors = [
    T.riskLow, T.riskLow, T.riskLow, T.riskLow,
    T.riskMed, T.riskMed,
    T.riskHigh, T.riskHigh,
    T.riskCrit, T.riskCrit,
  ]
  const labels = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90+']

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: MAX_H }}>
        {buckets.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: MAX_H }}>
            <div
              title={`${labels[i]}–${i === 9 ? '100' : String((i + 1) * 10)}: ${v} events`}
              style={{
                width: '100%',
                height: v > 0 ? Math.max((v / max) * MAX_H, 3) : 1,
                background: v > 0 ? colors[i] : T.border,
                opacity: v > 0 ? 0.9 : 0.4,
                borderRadius: 2,
                transition: `height ${T.dSlow} ${T.ease}`,
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 6 }}>
        {labels.map(l => (
          <span key={l} className="mono" style={{ flex: 1, fontSize: 9, textAlign: 'center', color: T.textDim }}>{l}</span>
        ))}
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

export default function Overview() {
  const { user } = useAuth()
  const T = useT()
  const { isMobile } = useWindowSize()
  const [orgId,      setOrgId]      = useState<string | null>(null)
  const [shadowMode, setShadowMode] = useState(false)
  const [events,     setEvents]     = useState<RiskEvent[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [newIds,     setNewIds]     = useState<Set<string>>(new Set())
  const [, setTick] = useState(0)
  const feedRef = useRef<HTMLDivElement>(null)

  /* ── Data loading ─────────────────────────────────────────────────────── */

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

  /* ── Derived metrics ──────────────────────────────────────────────────── */

  const total   = events.length
  const allowed = useMemo(() => events.filter(e => e.decision === 'allow').length,  [events])
  const blocked = useMemo(() => events.filter(e => e.decision === 'block').length,  [events])
  const reviews = useMemo(() => events.filter(e => e.decision === 'review').length, [events])
  const avgTrust = useMemo(() =>
    total > 0 ? Math.round(events.reduce((s, e) => s + e.trust_score, 0) / total) : 0
  , [events, total])
  const blockRate    = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0'
  const approvalRate = total > 0 ? ((allowed / total) * 100).toFixed(1) : '0.0'

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

  /* ── Spike alert detection ────────────────────────────────────────────── */

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

  const SPIKE_ICONS = {
    ip_surge:             Wifi,
    high_risk_spike:      TrendingUp,
    multi_account_device: Monitor,
    country_risk:         Globe,
  }

  /* ── Loading / error ──────────────────────────────────────────────────── */

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 10, color: T.textDim }}>
      <Spinner size={16} />
      <span className="t-body">Loading risk intelligence…</span>
    </div>
  )

  if (error) return (
    <div style={{ padding: 'var(--page-x)' }}>
      <Notice tone="danger" title="Could not load the dashboard" icon={AlertTriangle}>{error}</Notice>
    </div>
  )

  const hasEvents = total > 0
  const gridCols = isMobile ? '1fr' : 'minmax(0, 1fr) 340px'

  return (
    <div style={{ padding: 'var(--page-x)', maxWidth: 1440 }}>

      <PageHeader
        title="Risk Intelligence"
        description="Live decisioning across the last 24 hours"
        meta={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4, fontSize: 11, fontWeight: 600, color: T.successText }}>
            <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 999, background: T.success }} />
            Live
          </span>
        }
        actions={
          <Button size="sm" onClick={() => void fetchEvents()}>
            <RefreshCw size={12} />
            Refresh
          </Button>
        }
      />

      {/* ── 1. Environment ─────────────────────────────────────────────── */}
      {shadowMode && (
        <div style={{ marginBottom: 20 }}>
          <Notice
            tone="info"
            icon={Eye}
            title="Shadow mode is active"
            actions={(shadowWouldBlock > 0 || shadowWouldReview > 0) ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {shadowWouldBlock > 0 && (
                  <span className="mono" style={{ fontSize: 11, color: T.dangerText }}>
                    {shadowWouldBlock}<span style={{ color: T.textDim }}> would block</span>
                  </span>
                )}
                {shadowWouldReview > 0 && (
                  <span className="mono" style={{ fontSize: 11, color: T.warningText }}>
                    {shadowWouldReview}<span style={{ color: T.textDim }}> would review</span>
                  </span>
                )}
              </div>
            ) : undefined}
          >
            No users are being blocked. Decisions below reflect what <em>would have happened</em> in live mode.
          </Notice>
        </div>
      )}

      {/* ── 2. Anomalies — first, because they may need a human now ─────── */}
      <Section
        title="Risk spike alerts"
        description="Pattern anomalies detected in the last 24 hours"
        actions={spikeAlerts.length === 0
          ? <Badge tone="success" dot>System normal</Badge>
          : <Badge tone="warning">{spikeAlerts.length} active</Badge>}
        style={{ marginBottom: 28 }}
      >
        {spikeAlerts.length === 0 ? (
          <EmptyState icon={Shield} title="No anomalies detected">
            Signup surges per IP, high-risk spikes, shared devices and country risk concentration are
            checked continuously. Anything unusual appears here.
          </EmptyState>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {spikeAlerts.map((alert, i) => {
              const c = severityTone(alert.severity, T)
              const Icon = SPIKE_ICONS[alert.type]
              return (
                <div
                  key={i}
                  className="g-card"
                  style={{ padding: '13px 15px', borderLeft: `2px solid ${c.fill}`, display: 'flex', gap: 11 }}
                >
                  <Icon size={15} style={{ color: c.fill, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <p className="t-subhead" style={{ color: T.text, margin: 0 }}>{alert.title}</p>
                      <span className="t-label" style={{ color: c.ink, flexShrink: 0 }}>{alert.severity}</span>
                    </div>
                    <p className="t-metric-sm" style={{ color: c.ink, margin: '4px 0 0' }}>{alert.value}</p>
                    <p
                      className="mono"
                      style={{ fontSize: 10, color: T.textDim, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {alert.sub}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ── 3. Headline volume — the only primary-tier numbers on the page ── */}
      <div style={{ marginBottom: 28 }}>
        <MetricRow columns={isMobile ? 2 : 4}>
          <Metric
            tier="primary"
            icon={Activity}
            label="Total checks"
            value={hasEvents ? total.toLocaleString() : '—'}
            sub="Last 24 hours"
          />
          <Metric
            tier="primary"
            icon={CheckCircle}
            label="Approval rate"
            value={hasEvents ? `${approvalRate}%` : '—'}
            tone={hasEvents ? 'success' : undefined}
            sub={hasEvents ? `${allowed.toLocaleString()} approved` : 'No events yet'}
          />
          <Metric
            tier="primary"
            icon={XCircle}
            label="Blocked"
            value={hasEvents ? blocked.toLocaleString() : '—'}
            tone={blocked > 0 ? 'danger' : undefined}
            sub={`${blockRate}% block rate`}
          />
          <Metric
            tier="primary"
            icon={TrendingUp}
            label="Avg trust score"
            value={
              <span style={{ color: hasEvents ? trustInk(avgTrust, T) : undefined }}>
                {hasEvents ? String(avgTrust) : '—'}
              </span>
            }
            sub={!hasEvents ? '—' : avgTrust >= 70 ? 'Healthy baseline' : 'Elevated risk'}
          />
        </MetricRow>

        {/* Supporting counts. Same information as above, deliberately quieter. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 16 : 28, padding: '12px 16px 0' }}>
          {[
            { label: 'In review queue',  value: reviews,  ink: T.warningText, icon: Clock },
            { label: 'High-risk events', value: highRisk, ink: T.riskHighT,   icon: AlertTriangle },
            { label: 'Users approved',   value: allowed,  ink: T.successText, icon: CheckCircle },
            { label: 'Blocked attempts', value: blocked,  ink: T.dangerText,  icon: XCircle },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <item.icon size={12} style={{ color: T.textDim, flexShrink: 0 }} />
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: item.value > 0 ? item.ink : T.textDim }}>
                {item.value.toLocaleString()}
              </span>
              <span className="t-caption" style={{ color: T.textDim }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4 + 5. Shape and stream ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 20, alignItems: 'start' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>

          <Section
            title="Events over time"
            description="Hourly volume across the last 24 hours"
            actions={<span className="mono" style={{ fontSize: 11, color: T.textDim }}>{total.toLocaleString()} events</span>}
          >
            {!hasEvents ? (
              <EmptyState icon={Activity} title="No events in the last 24 hours">
                This chart plots hourly check volume once your integration starts sending traffic.
              </EmptyState>
            ) : (
              <Card pad="md">
                <AreaChart buckets={hourlyBuckets} T={T} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  {['24h ago', '18h', '12h', '6h', 'now'].map(l => (
                    <span key={l} className="mono" style={{ fontSize: 10, color: T.textDim }}>{l}</span>
                  ))}
                </div>
              </Card>
            )}
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
            <Section title="Decision breakdown" description="Distribution by outcome">
              <Card pad="md">
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <DonutChart allow={allowed} review={reviews} block={blocked} T={T} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                    {[
                      { label: 'Approve', count: allowed, color: T.success },
                      { label: 'Review',  count: reviews, color: T.warning },
                      { label: 'Block',   count: blocked, color: T.danger  },
                    ].map(row => (
                      <Meter
                        key={row.label}
                        label={row.label}
                        value={row.count}
                        max={total}
                        pct={total > 0 ? (row.count / total) * 100 : 0}
                        display={row.count.toLocaleString()}
                        color={row.color}
                        height={3}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            </Section>

            <Section title="Risk distribution" description="Events by risk level">
              <Card pad="md">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {([
                    { key: 'low',      label: 'Low',      color: T.riskLow  },
                    { key: 'medium',   label: 'Medium',   color: T.riskMed  },
                    { key: 'high',     label: 'High',     color: T.riskHigh },
                    { key: 'critical', label: 'Critical', color: T.riskCrit },
                  ] as const).map(r => (
                    <Meter key={r.key} label={r.label} value={riskLevels[r.key]} max={maxRisk} color={r.color} />
                  ))}
                </div>
              </Card>
            </Section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
            <Section title="Fraud score distribution" description="Events by score bucket">
              {!hasEvents ? (
                <EmptyState icon={AlertTriangle} title="No scores yet">
                  Each analysed event lands in one of ten score buckets, from 0 to 100.
                </EmptyState>
              ) : (
                <Card pad="md">
                  <FraudHistogram buckets={fraudBuckets} T={T} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                    {[
                      { label: 'Low',      color: T.riskLow  },
                      { label: 'Medium',   color: T.riskMed  },
                      { label: 'High',     color: T.riskHigh },
                      { label: 'Critical', color: T.riskCrit },
                    ].map(l => (
                      <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: l.color }} />
                        <span className="t-caption" style={{ color: T.textDim }}>{l.label}</span>
                      </span>
                    ))}
                  </div>
                </Card>
              )}
            </Section>

            <Section title="Top countries" description="By event volume">
              {topCountries.length === 0 ? (
                <EmptyState icon={Globe} title="No country data yet">
                  Pass a <code className="g-code">country</code> field on each check to see geographic
                  distribution here.
                </EmptyState>
              ) : (
                <Card pad="md">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {topCountries.map(c => (
                      <Meter key={c.cc} label={c.cc} value={c.count} max={maxCountry} color={T.textSec} />
                    ))}
                  </div>
                </Card>
              )}
            </Section>
          </div>
        </div>

        {/* ── Right rail: the raw stream ───────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>

          <Section
            title="Live risk feed"
            description={hasEvents ? `${total.toLocaleString()} events` : 'Waiting for events'}
            actions={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: T.successText }}>
                <span className="pulse-dot" style={{ width: 5, height: 5, borderRadius: 999, background: T.success }} />
                LIVE
              </span>
            }
          >
            {!hasEvents ? (
              <EmptyState icon={Radio} title="No events yet">
                Send your first check to <code className="g-code">POST /api/risk/check</code> and it will
                stream in here the moment it is scored.
              </EmptyState>
            ) : (
              <div className="g-card g-scroll" ref={feedRef} style={{ maxHeight: 560, overflowY: 'auto' }}>
                {events.slice(0, 50).map((ev, i) => {
                  const isNew = newIds.has(ev.id)
                  const dot = ev.decision === 'block' ? T.danger : ev.decision === 'review' ? T.warning : T.success
                  return (
                    <div
                      key={ev.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '11px 14px',
                        borderBottom: i < Math.min(events.length, 50) - 1 ? `1px solid ${T.borderLight}` : 'none',
                        background: isNew ? T.trustDim : 'transparent',
                        transition: `background-color ${T.dSlow} ${T.ease}`,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 6, height: 6, borderRadius: 999, background: dot,
                          flexShrink: 0, marginTop: 5,
                          boxShadow: isNew ? `0 0 0 3px ${dot}33` : 'none',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
                          <span className={`badge-${ev.risk_level}`}>{ev.risk_level}</span>
                          <span className={`badge-${ev.decision}`}>{ev.decision}</span>
                          <span className="badge-neutral">{ev.event_type}</span>
                        </div>
                        <p
                          className="mono"
                          style={{ fontSize: 10, color: T.textDim, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {ev.external_user_id}
                        </p>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: trustInk(ev.trust_score, T) }}>
                            T{ev.trust_score}
                          </span>
                          <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: fraudInk(ev.fraud_score, T) }}>
                            F{ev.fraud_score}
                          </span>
                        </div>
                        <p className="mono" style={{ fontSize: 9, color: T.textDim, margin: '2px 0 0' }}>
                          {relativeTime(ev.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          <Section title="Top signals" description="Most frequently detected patterns">
            {topSignals.length === 0 ? (
              <EmptyState icon={Wifi} title="No signals detected yet">
                The engine evaluates email, IP, device, velocity and behavioural signals on every check.
              </EmptyState>
            ) : (
              <Card pad="md">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {topSignals.map((s, i) => {
                    const color =
                      s.severity === 'critical' ? T.riskCrit
                      : s.severity === 'high'   ? T.riskHigh
                      : s.severity === 'medium' ? T.riskMed
                      : T.riskLow
                    return (
                      <Meter key={i} label={s.label} value={s.count} max={maxSignal} display={`×${s.count}`} color={color} height={3} />
                    )
                  })}
                </div>
              </Card>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
