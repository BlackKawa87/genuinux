import { useEffect, useState, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  BarChart2, Shield, Target, MessageSquare,
  RefreshCw, Activity,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = '7d' | '30d' | '90d'

interface EventLite {
  fraud_score: number
  decision: string
  signals_json: unknown
  applied_rule_name: string | null
  feedback_status: string | null
  created_at: string
}

interface FbLite {
  feedback_type: string
  created_at: string
}

interface DayBucket {
  label: string
  allow: number
  review: number
  block: number
  fraud: number[]
}

interface RawSignal {
  code: string
  label?: string
  severity?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100)
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function periodDelta(curr: number, prev: number): { sign: '+' | '-' | ''; value: number } | null {
  if (prev === 0) return null
  const d = ((curr - prev) / prev) * 100
  if (Math.abs(d) < 1) return null
  return { sign: d > 0 ? '+' : '-', value: Math.abs(Math.round(d)) }
}

function buildBuckets(events: EventLite[], days: number): DayBucket[] {
  const useWeeks = days === 90
  const n         = useWeeks ? 13 : days
  const msPer     = (useWeeks ? 7 : 1) * 24 * 60 * 60 * 1000
  const start     = Date.now() - days * 24 * 60 * 60 * 1000

  const buckets: DayBucket[] = Array.from({ length: n }, (_, i) => {
    const d = new Date(start + i * msPer)
    const label = useWeeks
      ? d.toLocaleString('en', { month: 'short', day: 'numeric' })
      : d.toLocaleString('en', { month: 'short', day: 'numeric' })
    return { label, allow: 0, review: 0, block: 0, fraud: [] }
  })

  for (const e of events) {
    const ts  = new Date(e.created_at).getTime()
    if (ts < start) continue
    const idx = Math.min(Math.floor((ts - start) / msPer), n - 1)
    const b   = buckets[idx]
    if (e.decision === 'allow')  b.allow++
    else if (e.decision === 'review') b.review++
    else if (e.decision === 'block')  b.block++
    b.fraud.push(e.fraud_score)
  }
  return buckets
}

function parseSignals(raw: unknown): RawSignal[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((s): s is RawSignal => !!s && typeof s === 'object' && 'code' in s)
}

// ─── Design constants ─────────────────────────────────────────────────────────

const FEEDBACK_META: Record<string, { label: string; color: string }> = {
  genuine_user:            { label: 'Genuine User',    color: '#16C784' },
  false_positive:          { label: 'False Positive',  color: '#F59E0B' },
  confirmed_fraud:         { label: 'Confirmed Fraud', color: '#EF4444' },
  chargeback_received:     { label: 'Chargeback',      color: '#F97316' },
  account_abuse_confirmed: { label: 'Account Abuse',   color: '#A78BFA' },
  manual_review_correct:   { label: 'Review Correct',  color: '#38BDF8' },
  manual_review_wrong:     { label: 'Review Wrong',    color: '#94A3B8' },
}

const SEV_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high:     '#F97316',
  medium:   '#F59E0B',
  low:      '#94A3B8',
}

// ─── Chart: Stacked bars ──────────────────────────────────────────────────────

function StackedBarsChart({ buckets, textDim }: { buckets: DayBucket[]; textDim: string }) {
  const W = 600, H = 110, PB = 20, PT = 6
  const cH = H - PB - PT
  const n  = buckets.length

  const maxTotal = Math.max(...buckets.map(b => b.allow + b.review + b.block), 1)
  const step  = W / n
  const barW  = Math.max(2, step - 1.5)
  const every = n <= 7 ? 1 : n <= 15 ? 2 : n <= 30 ? 5 : 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} preserveAspectRatio="none">
      {buckets.map((b, i) => {
        const total   = b.allow + b.review + b.block
        const x       = i * step + (step - barW) / 2
        const allowH  = (b.allow  / maxTotal) * cH
        const reviewH = (b.review / maxTotal) * cH
        const blockH  = (b.block  / maxTotal) * cH
        const allowY  = PT + cH - allowH
        const reviewY = allowY  - reviewH
        const blockY  = reviewY - blockH

        return (
          <g key={i}>
            {total > 0 && (
              <>
                {b.allow  > 0 && <rect x={x} y={allowY}  width={barW} height={allowH}  fill="#16C784" opacity="0.8" rx="1" />}
                {b.review > 0 && <rect x={x} y={reviewY} width={barW} height={reviewH} fill="#F59E0B" opacity="0.8" />}
                {b.block  > 0 && <rect x={x} y={blockY}  width={barW} height={blockH}  fill="#EF4444" opacity="0.8" rx="1" />}
              </>
            )}
            {i % every === 0 && (
              <text x={x + barW / 2} y={H - 5} textAnchor="middle" fontSize="7" fill={textDim}>
                {b.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Chart: Trend line ────────────────────────────────────────────────────────

function TrendLine({ points, color = '#F59E0B', textDim }: { points: number[]; color?: string; textDim: string }) {
  if (points.length < 2) return <EmptyChart label="Not enough data" textDim={textDim} />
  const W = 600, H = 70, PY = 6
  const max   = Math.max(...points, 1)
  const min   = Math.min(...points, 0)
  const range = max - min || 1

  const pts = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W
    const y = H - PY - ((v - min) / range) * (H - PY * 2)
    return [x, y] as [number, number]
  })

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `M0,${H} ` + pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W},${H} Z`
  const gId  = `tg${color.replace('#', '')}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="70" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gId})`} />
      <path d={line}  fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function EmptyChart({ label, textDim }: { label: string; textDim: string }) {
  return (
    <div className="flex items-center justify-center h-14" style={{ color: textDim }}>
      <span className="text-xs">{label}</span>
    </div>
  )
}

function HBar({ label, count, max, color, textSec, card }: {
  label: string; count: number; max: number; color: string; textSec: string; card: string
}) {
  const w = max === 0 ? 0 : (count / max) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] truncate flex-shrink-0" style={{ color: textSec, width: '130px' }}>
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: card }}>
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
      <span className="text-[11px] mono flex-shrink-0 w-8 text-right" style={{ color }}>
        {fmt(count)}
      </span>
    </div>
  )
}

function KpiCard({ title, value, sub, icon, color, d, text, textDim }: {
  title: string; value: string; sub: string; icon: ReactNode; color: string
  d?: { sign: '+' | '-' | ''; value: number } | null
  text: string; textDim: string
}) {
  const dc = d?.sign === '+' ? '#16C784' : '#EF4444'
  return (
    <div className="g-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textDim }}>{title}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-bold mono mb-1" style={{ color: text }}>{value}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs" style={{ color: textDim }}>{sub}</p>
        {d && d.value > 0 && (
          <span className="text-[10px] mono" style={{ color: dc }}>
            {d.sign}{d.value}% vs prev
          </span>
        )}
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children, text, textDim }: {
  title: string; subtitle?: string; children: ReactNode; text: string; textDim: string
}) {
  return (
    <div className="g-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: text }}>{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: textDim }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { profile } = useAuth()
  const T = useT()

  const [range,    setRange]    = useState<Range>('30d')
  const [events,   setEvents]   = useState<EventLite[]>([])
  const [feedback, setFeedback] = useState<FbLite[]>([])
  const [loading,  setLoading]  = useState(true)

  const days = RANGE_DAYS[range]

  const loadData = useCallback(async () => {
    if (!profile?.organization_id) return
    setLoading(true)

    // Fetch 2× the period so we can compute previous-period deltas
    const since = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000).toISOString()

    const [evRes, fbRes] = await Promise.all([
      supabase
        .from('risk_events')
        .select('fraud_score, decision, signals_json, applied_rule_name, feedback_status, created_at')
        .eq('organization_id', profile.organization_id)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(5000),
      supabase
        .from('event_feedback')
        .select('feedback_type, created_at')
        .eq('organization_id', profile.organization_id)
        .gte('created_at', since),
    ])

    setEvents((evRes.data ?? []) as EventLite[])
    setFeedback((fbRes.data ?? []) as FbLite[])
    setLoading(false)
  }, [profile?.organization_id, days])

  useEffect(() => { void loadData() }, [loadData])

  // Period boundary
  const mid = useMemo(
    () => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
    [days],
  )

  const curr = useMemo(() => events.filter(e => e.created_at >= mid),   [events, mid])
  const prev = useMemo(() => events.filter(e => e.created_at <  mid),   [events, mid])
  const currFb = useMemo(() => feedback.filter(f => f.created_at >= mid), [feedback, mid])
  const prevFb = useMemo(() => feedback.filter(f => f.created_at <  mid), [feedback, mid])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total     = curr.length
    const ptotal    = prev.length
    const blocked   = curr.filter(e => e.decision === 'block').length
    const pblocked  = prev.filter(e => e.decision === 'block').length
    const fraudAvg  = Math.round(avg(curr.map(e => e.fraud_score)))
    const pfraudAvg = Math.round(avg(prev.map(e => e.fraud_score)))
    const fbCov     = pct(currFb.length, total)
    const pfbCov    = pct(prevFb.length, ptotal)
    return {
      total,    ptotal,
      blockRate: pct(blocked,  total),
      pblockRate: pct(pblocked, ptotal),
      fraudAvg, pfraudAvg,
      fbCov,    pfbCov,
    }
  }, [curr, prev, currFb, prevFb])

  // ── Chart data ───────────────────────────────────────────────────────────────
  const buckets = useMemo(() => buildBuckets(curr, days), [curr, days])
  const fraudLine = useMemo(() => buckets.map(b => Math.round(avg(b.fraud))), [buckets])

  const allow  = useMemo(() => curr.filter(e => e.decision === 'allow').length,  [curr])
  const review = useMemo(() => curr.filter(e => e.decision === 'review').length, [curr])
  const block  = useMemo(() => curr.filter(e => e.decision === 'block').length,  [curr])

  // ── Feedback breakdown ───────────────────────────────────────────────────────
  const feedbackBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const f of currFb) counts[f.feedback_type] = (counts[f.feedback_type] ?? 0) + 1
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count, ...(FEEDBACK_META[type] ?? { label: type, color: '#94A3B8' }) }))
      .sort((a, b) => b.count - a.count)
  }, [currFb])

  // ── Rule performance ─────────────────────────────────────────────────────────
  const ruleHits = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of curr) {
      if (e.applied_rule_name) counts[e.applied_rule_name] = (counts[e.applied_rule_name] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [curr])

  // ── Top signals ──────────────────────────────────────────────────────────────
  const topSignals = useMemo(() => {
    const counts: Record<string, { count: number; label: string; severity: string }> = {}
    for (const e of curr) {
      for (const s of parseSignals(e.signals_json)) {
        if (!counts[s.code]) counts[s.code] = { count: 0, label: s.label ?? s.code, severity: s.severity ?? 'low' }
        counts[s.code].count++
      }
    }
    return Object.entries(counts)
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [curr])

  const maxFb  = Math.max(...feedbackBreakdown.map(f => f.count), 1)
  const maxRule = Math.max(...ruleHits.map(r => r.count), 1)
  const maxSig  = Math.max(...topSignals.map(s => s.count), 1)

  const fraudColor = kpi.fraudAvg >= 50 ? '#EF4444' : kpi.fraudAvg >= 30 ? '#F59E0B' : '#16C784'
  const bucketLabel = days === 90 ? 'week' : 'day'

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: T.textDim }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading analytics…</span>
    </div>
  )

  return (
    <div className="p-7 max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2.5" style={{ color: T.text }}>
            <BarChart2 size={18} style={{ color: '#16C784' }} />
            Analytics
          </h1>
          <p className="text-sm mt-0.5" style={{ color: T.textDim }}>
            Trends, feedback quality, and rule performance
          </p>
        </div>

        {/* Range picker */}
        <div className="flex items-center gap-0.5 p-1 rounded-lg"
          style={{ background: T.card, border: `1px solid ${T.border}` }}>
          {(['7d', '30d', '90d'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
              style={{
                background: range === r ? T.border : 'transparent',
                color:      range === r ? T.text : T.textDim,
              }}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Events"
          value={fmt(kpi.total)}
          sub={`last ${days} days`}
          icon={<Activity size={13} />}
          color="#16C784"
          d={periodDelta(kpi.total, kpi.ptotal)}
          text={T.text} textDim={T.textDim}
        />
        <KpiCard
          title="Avg Fraud Score"
          value={String(kpi.fraudAvg)}
          sub="0–100 scale"
          icon={<Shield size={13} />}
          color={fraudColor}
          d={periodDelta(kpi.fraudAvg, kpi.pfraudAvg)}
          text={T.text} textDim={T.textDim}
        />
        <KpiCard
          title="Block Rate"
          value={`${kpi.blockRate}%`}
          sub={`${block} of ${kpi.total} blocked`}
          icon={<Target size={13} />}
          color="#EF4444"
          d={periodDelta(kpi.blockRate, kpi.pblockRate)}
          text={T.text} textDim={T.textDim}
        />
        <KpiCard
          title="Feedback Coverage"
          value={`${kpi.fbCov}%`}
          sub={`${currFb.length} event${currFb.length !== 1 ? 's' : ''} labeled`}
          icon={<MessageSquare size={13} />}
          color="#818CF8"
          d={periodDelta(kpi.fbCov, kpi.pfbCov)}
          text={T.text} textDim={T.textDim}
        />
      </div>

      {/* Decisions over time */}
      <ChartCard
        title="Decisions Over Time"
        subtitle={`Allow · Review · Block — stacked per ${bucketLabel}`}
        text={T.text} textDim={T.textDim}
      >
        {kpi.total === 0 ? (
          <EmptyChart label="No events in this period" textDim={T.textDim} />
        ) : (
          <>
            <StackedBarsChart buckets={buckets} textDim={T.textDim} />
            <div className="flex items-center gap-5 mt-3">
              {[
                { label: 'Allow',  count: allow,  color: '#16C784' },
                { label: 'Review', count: review, color: '#F59E0B' },
                { label: 'Block',  count: block,  color: '#EF4444' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                  <span className="text-[10px]" style={{ color: T.textDim }}>{label}</span>
                  <span className="text-[10px] mono font-semibold" style={{ color }}>{fmt(count)}</span>
                </div>
              ))}
              <span className="text-[10px] ml-auto" style={{ color: T.textDim }}>
                {fmt(kpi.total)} total
              </span>
            </div>
          </>
        )}
      </ChartCard>

      {/* Fraud trend + Feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Avg Fraud Score Trend"
          subtitle={`Mean score per ${bucketLabel} — higher is worse`}
          text={T.text} textDim={T.textDim}
        >
          {fraudLine.every(v => v === 0) ? (
            <EmptyChart label="No data" textDim={T.textDim} />
          ) : (
            <>
              <TrendLine points={fraudLine} color={fraudColor} textDim={T.textDim} />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px]" style={{ color: T.textDim }}>
                  Min {Math.min(...fraudLine)}
                </span>
                <span className="text-[10px] font-semibold" style={{ color: fraudColor }}>
                  Avg {kpi.fraudAvg}
                </span>
                <span className="text-[10px]" style={{ color: T.textDim }}>
                  Max {Math.max(...fraudLine)}
                </span>
              </div>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Feedback Breakdown"
          subtitle={`${currFb.length} labeled event${currFb.length !== 1 ? 's' : ''} this period`}
          text={T.text} textDim={T.textDim}
        >
          {feedbackBreakdown.length === 0 ? (
            <EmptyChart label="No feedback submitted yet" textDim={T.textDim} />
          ) : (
            <div className="space-y-2.5 pt-1">
              {feedbackBreakdown.map(f => (
                <HBar key={f.type} label={f.label} count={f.count} max={maxFb} color={f.color} textSec={T.textSec} card={T.card} />
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Rules + Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Rule Performance"
          subtitle="Rules that influenced decisions this period"
          text={T.text} textDim={T.textDim}
        >
          {ruleHits.length === 0 ? (
            <EmptyChart label="No rule matches in this period" textDim={T.textDim} />
          ) : (
            <div className="space-y-2.5 pt-1">
              {ruleHits.map(r => (
                <HBar key={r.name} label={r.name} count={r.count} max={maxRule} color="#818CF8" textSec={T.textSec} card={T.card} />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Top Risk Signals"
          subtitle="Most frequent fraud signals detected"
          text={T.text} textDim={T.textDim}
        >
          {topSignals.length === 0 ? (
            <EmptyChart label="No signals detected this period" textDim={T.textDim} />
          ) : (
            <div className="space-y-2.5 pt-1">
              {topSignals.map(s => (
                <HBar
                  key={s.code}
                  label={s.label.replace(/_/g, ' ')}
                  count={s.count}
                  max={maxSig}
                  color={SEV_COLOR[s.severity] ?? T.textSec}
                  textSec={T.textSec}
                  card={T.card}
                />
              ))}
            </div>
          )}
        </ChartCard>
      </div>

    </div>
  )
}
