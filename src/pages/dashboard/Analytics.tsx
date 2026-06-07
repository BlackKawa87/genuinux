import { useEffect, useState, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  BarChart2, Shield, Target, MessageSquare,
  RefreshCw, Activity, Brain, AlertCircle, Database, Layers, Download,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import { useWindowSize } from '../../hooks/useWindowSize'

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = '7d' | '30d' | '90d'

interface EventLite {
  fraud_score:       number
  decision:          string
  signals_json:      unknown
  applied_rule_name: string | null
  gnx_score:         number | null
  created_at:        string
}

interface FbLite {
  risk_event_id: string
  label:         string
  created_at:    string
}

interface LabelLite {
  risk_event_id: string
  label:         string
  created_at:    string
}

interface FraudTrend {
  date:             string
  confirmed_fraud:  number
  suspected_fraud:  number
  false_positive:   number
  legitimate:       number
}

interface IntelligenceSummary {
  period_days:  number
  total_events: number
  notice?:      string
  feedback_loop: {
    total_labeled:      number
    correct_approve:    number; incorrect_approve: number
    correct_block:      number; incorrect_block:   number
    correct_review:     number; incorrect_review:  number
    decision_accuracy:    number
    false_positive_rate:  number
    false_negative_rate:  number
    precision:            number
    recall:               number
    review_quality:       number
    label_coverage_rate:  number
    insight:              string | null
  }
  gnx_distribution: { low: number; review_zone: number; high: number; total: number }
  fraud_trends:     FraudTrend[]
  label_counts:     { confirmed_fraud: number; suspected_fraud: number; false_positive: number; legitimate: number; total: number }
  top_patterns: {
    countries:          Array<{ value: string; count: number }>
    event_types:        Array<{ value: string; count: number }>
    risk_levels:        Array<{ value: string; count: number }>
    original_decisions: Array<{ value: string; count: number }>
  }
  training_readiness: {
    total_labels:           number
    confirmed_fraud_labels: number
    suspected_fraud_labels: number
    legitimate_labels:      number
    false_positive_labels:  number
    progress_pct:           number
    status:                 'not_ready' | 'collecting' | 'near_ready' | 'ready'
    data_quality_warnings:  string[]
  }
  generated_at: string
}

interface FeatureGroupStat {
  group:         string
  count:         number
  feature_count: number
}

interface FeatureStat {
  feature_name:    string
  feature_group:   string
  feature_version: number
  count:           number
  avg:             number
  min:             number
  max:             number
}

interface FeatureStoreStats {
  total_features:        number
  feature_count:         number
  events_with_features:  number
  total_events:          number
  coverage_pct:          number
  period_days:           number
  group_stats:           FeatureGroupStat[]
  feature_stats:         FeatureStat[]
  data_quality_warnings: string[]
  generated_at:          string
  notice?:               string
}

interface LabelDistEntry { count: number; pct: number }

interface DatasetReadiness {
  score:             number
  status:            string
  events_progress:   number
  labels_progress:   number
  coverage_progress: number
}

interface DatasetStats {
  total_records:            number
  total_labels:             number
  total_events:             number
  feature_coverage_pct:     number
  coverage_pct:             number
  label_distribution: {
    confirmed_fraud: LabelDistEntry
    suspected_fraud: LabelDistEntry
    false_positive:  LabelDistEntry
    legitimate:      LabelDistEntry
  }
  dataset_balance_warnings: string[]
  readiness:                DatasetReadiness
  dataset_version:          number
  generated_at:             string
  notice?:                  string
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
  confirmed_fraud: { label: 'Confirmed Fraud', color: '#EF4444' },
  suspected_fraud: { label: 'Suspected Fraud', color: '#F97316' },
  false_positive:  { label: 'False Positive',  color: '#F59E0B' },
  legitimate:      { label: 'Legitimate',       color: '#16C784' },
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

function EmptyChart({ label, textDim = '#475569' }: { label: string; textDim?: string }) {
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

// ─── Chart: Label trend stacked bars ─────────────────────────────────────────

function LabelStackedChart({ trends, textDim }: { trends: FraudTrend[]; textDim: string }) {
  if (trends.length === 0) return <EmptyChart label="No labels submitted in this period" textDim={textDim} />

  const W = 600, H = 90, PB = 20, PT = 6
  const cH = H - PB - PT
  const n  = trends.length
  const maxTotal = Math.max(...trends.map(t => t.confirmed_fraud + t.suspected_fraud + t.false_positive + t.legitimate), 1)
  const step = W / n
  const barW = Math.max(2, step - 2)
  const every = Math.max(1, Math.round(n / 7))

  type Seg = { x: number; y: number; h: number; color: string; key: string }
  const allSegs: Seg[] = []
  const axisLabels: { x: number; label: string }[] = []

  trends.forEach((t, i) => {
    const x = i * step + (step - barW) / 2
    const layers: [number, string][] = [
      [t.legitimate,      '#16C784'],
      [t.false_positive,  '#F59E0B'],
      [t.suspected_fraud, '#F97316'],
      [t.confirmed_fraud, '#EF4444'],
    ]
    let y = PT + cH
    layers.forEach(([count, color], j) => {
      const h = (count / maxTotal) * cH
      if (h > 0) { y -= h; allSegs.push({ x, y, h, color, key: `${i}-${j}` }) }
    })
    if (i % every === 0) axisLabels.push({ x: x + barW / 2, label: t.date.slice(5) })
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} preserveAspectRatio="none">
      {allSegs.map(s => (
        <rect key={s.key} x={s.x} y={s.y} width={barW} height={s.h} fill={s.color} opacity="0.85" rx="1" />
      ))}
      {axisLabels.map((l, i) => (
        <text key={i} x={l.x} y={H - 5} textAnchor="middle" fontSize="7" fill={textDim}>{l.label}</text>
      ))}
    </svg>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { profile, session } = useAuth()
  const T = useT()
  const { isMobile } = useWindowSize()

  const [range,        setRange]        = useState<Range>('30d')
  const [events,       setEvents]       = useState<EventLite[]>([])
  const [feedback,     setFeedback]     = useState<FbLite[]>([])
  const [labels,       setLabels]       = useState<LabelLite[]>([])
  const [intelSum,     setIntelSum]     = useState<IntelligenceSummary | null>(null)
  const [featureStore, setFeatureStore] = useState<FeatureStoreStats | null>(null)
  const [datasetStats, setDatasetStats] = useState<DatasetStats | null>(null)
  const [loading,      setLoading]      = useState(true)

  const days = RANGE_DAYS[range]

  const loadData = useCallback(async () => {
    if (!profile?.organization_id) return
    setLoading(true)

    // Fetch 2× the period so we can compute previous-period deltas
    const since = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000).toISOString()
    const token = session?.access_token ?? ''

    const [evRes, fbRes, lblRes, intelData, featureData, dsData] = await Promise.all([
      supabase
        .from('risk_events')
        .select('fraud_score, decision, signals_json, applied_rule_name, gnx_score, created_at')
        .eq('organization_id', profile.organization_id)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(5000),
      supabase
        .from('fraud_labels')
        .select('risk_event_id, label, created_at')
        .eq('organization_id', profile.organization_id)
        .gte('created_at', since),
      supabase
        .from('fraud_labels')
        .select('risk_event_id, label, created_at')
        .eq('organization_id', profile.organization_id)
        .gte('created_at', since)
        .limit(2000),
      token
        ? fetch(`/api/admin/intelligence/summary?days=${days}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.ok ? r.json() as Promise<IntelligenceSummary> : null).catch(() => null)
        : Promise.resolve(null),
      token
        ? fetch(`/api/admin/intelligence/features?days=${days}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.ok ? r.json() as Promise<FeatureStoreStats> : null).catch(() => null)
        : Promise.resolve(null),
      token
        ? fetch('/api/admin/intelligence/dataset/stats', {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.ok ? r.json() as Promise<DatasetStats> : null).catch(() => null)
        : Promise.resolve(null),
    ])

    setEvents((evRes.data ?? []) as EventLite[])
    setFeedback((fbRes.data ?? []) as FbLite[])
    setLabels((lblRes.data ?? []) as LabelLite[])
    setIntelSum(intelData as IntelligenceSummary | null)
    setFeatureStore(featureData as FeatureStoreStats | null)
    setDatasetStats(dsData as DatasetStats | null)
    setLoading(false)
  }, [profile?.organization_id, days, session?.access_token])

  useEffect(() => { void loadData() }, [loadData])

  // Period boundary
  const mid = useMemo(
    () => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
    [days],
  )

  const curr = useMemo(() => events.filter(e => e.created_at >= mid),   [events, mid])
  const prev = useMemo(() => events.filter(e => e.created_at <  mid),   [events, mid])
  const currFb = useMemo(() => {
    const m = new Map<string, FbLite>()
    for (const f of feedback) {
      if (f.created_at < mid) continue
      const ex = m.get(f.risk_event_id)
      if (!ex || f.created_at > ex.created_at) m.set(f.risk_event_id, f)
    }
    return [...m.values()]
  }, [feedback, mid])
  const prevFb = useMemo(() => {
    const m = new Map<string, FbLite>()
    for (const f of feedback) {
      if (f.created_at >= mid) continue
      const ex = m.get(f.risk_event_id)
      if (!ex || f.created_at > ex.created_at) m.set(f.risk_event_id, f)
    }
    return [...m.values()]
  }, [feedback, mid])

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
    for (const f of currFb) counts[f.label] = (counts[f.label] ?? 0) + 1
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

  // ── Intelligence KPIs ───────────────────────────────────────────────────────
  const currLabels = useMemo(() => {
    const m = new Map<string, LabelLite>()
    for (const l of labels) {
      if (l.created_at < mid) continue
      const ex = m.get(l.risk_event_id)
      if (!ex || l.created_at > ex.created_at) m.set(l.risk_event_id, l)
    }
    return [...m.values()]
  }, [labels, mid])

  const intelKpi = useMemo(() => {
    const withGnx = curr.filter(e => e.gnx_score !== null)
    const avgGnx  = withGnx.length === 0
      ? null
      : Math.round(withGnx.reduce((a, e) => a + (e.gnx_score ?? 0), 0) / withGnx.length)
    const total          = currLabels.length
    const confirmedFraud = currLabels.filter(l => l.label === 'confirmed_fraud').length
    const suspectedFraud = currLabels.filter(l => l.label === 'suspected_fraud').length
    const falsePositive  = currLabels.filter(l => l.label === 'false_positive').length
    const legitimate     = currLabels.filter(l => l.label === 'legitimate').length
    const fpRate         = total === 0 ? 0 : Math.round((falsePositive / total) * 100)
    return { avgGnx, total, confirmedFraud, suspectedFraud, falsePositive, legitimate, fpRate }
  }, [curr, currLabels])

  const labelBreakdown = useMemo(() => [
    { label: 'Confirmed Fraud', color: '#EF4444', count: intelKpi.confirmedFraud },
    { label: 'Suspected Fraud', color: '#F97316', count: intelKpi.suspectedFraud },
    { label: 'False Positive',  color: '#F59E0B', count: intelKpi.falsePositive  },
    { label: 'Legitimate',      color: '#16C784', count: intelKpi.legitimate      },
  ].filter(d => d.count > 0), [intelKpi])

  const maxLabel = Math.max(...labelBreakdown.map(l => l.count), 1)

  const gnxColor = intelKpi.avgGnx === null
    ? T.textDim
    : intelKpi.avgGnx >= 701 ? '#EF4444'
    : intelKpi.avgGnx >= 301 ? '#F59E0B'
    : '#16C784'

  const fraudColor = kpi.fraudAvg >= 50 ? '#EF4444' : kpi.fraudAvg >= 30 ? '#F59E0B' : '#16C784'
  const bucketLabel = days === 90 ? 'week' : 'day'

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: T.textDim }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading analytics…</span>
    </div>
  )

  return (
    <div className="max-w-6xl space-y-5" style={{ padding: isMobile ? '16px' : '28px' }}>

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

      {/* ── Feedback Loop ──────────────────────────────────────────────────────── */}
      <div className="g-card p-5">
        <div className="flex items-center gap-2.5 mb-5">
          <Activity size={16} style={{ color: '#38BDF8' }} />
          <div>
            <h3 className="text-sm font-semibold" style={{ color: T.text }}>Feedback Loop</h3>
            <p className="text-xs mt-0.5" style={{ color: T.textDim }}>
              Decision quality measured against submitted fraud labels
            </p>
          </div>
        </div>

        {!intelSum || intelSum.feedback_loop.total_labeled === 0 ? (
          <div className="rounded-xl p-5 flex items-start gap-3"
            style={{ background: '#38BDF808', border: '1px solid #38BDF820' }}>
            <AlertCircle size={15} style={{ color: '#38BDF8', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: T.text }}>Feedback Loop activates after labeled events are submitted</p>
              <p className="text-xs mt-1" style={{ color: T.textDim }}>
                Use{' '}
                <code className="mono px-1 py-0.5 rounded text-[11px]" style={{ background: T.card, color: '#38BDF8' }}>
                  POST /api/risk/label
                </code>{' '}
                to submit ground-truth labels, or mark events from the Risk Events table. Labels enable decision
                quality metrics: accuracy, false positives, false negatives, and review quality.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* KPI row */}
            {(() => {
              const fl = intelSum.feedback_loop
              const accColor  = fl.decision_accuracy   >= 80 ? '#16C784' : fl.decision_accuracy   >= 50 ? '#F59E0B' : '#EF4444'
              const fpColor   = fl.false_positive_rate <= 10 ? '#16C784' : fl.false_positive_rate <= 25 ? '#F59E0B' : '#EF4444'
              const fnColor   = fl.false_negative_rate <= 10 ? '#16C784' : fl.false_negative_rate <= 25 ? '#F59E0B' : '#EF4444'
              const covColor  = fl.label_coverage_rate >= 20 ? '#16C784' : fl.label_coverage_rate >= 5  ? '#F59E0B' : T.textSec
              const revColor  = fl.review_quality      >= 70 ? '#16C784' : fl.review_quality      >= 40 ? '#F59E0B' : '#EF4444'
              return (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
                  {[
                    { title: 'Decision Accuracy', value: `${fl.decision_accuracy}%`, sub: `${fl.total_labeled} labeled events`, color: accColor, icon: <Target size={13} /> },
                    { title: 'False Positive Rate', value: `${fl.false_positive_rate}%`, sub: 'Blocked but legitimate', color: fpColor, icon: <Shield size={13} /> },
                    { title: 'False Negative Rate', value: `${fl.false_negative_rate}%`, sub: 'Approved but fraud', color: fnColor, icon: <AlertCircle size={13} /> },
                    { title: 'Label Coverage', value: `${fl.label_coverage_rate}%`, sub: 'Events with labels', color: covColor, icon: <MessageSquare size={13} /> },
                    { title: 'Review Quality', value: fl.correct_review + fl.incorrect_review === 0 ? '—' : `${fl.review_quality}%`, sub: 'Reviews that were fraud', color: revColor, icon: <Activity size={13} /> },
                  ].map(card => (
                    <div key={card.title} className="rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider leading-tight" style={{ color: T.textDim }}>{card.title}</p>
                        <span style={{ color: card.color }}>{card.icon}</span>
                      </div>
                      <p className="text-xl font-bold mono" style={{ color: card.color }}>{card.value}</p>
                      <p className="text-[10px] mt-1" style={{ color: T.textDim }}>{card.sub}</p>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Decision Quality Breakdown */}
            {(() => {
              const fl = intelSum.feedback_loop
              const maxVal = Math.max(fl.correct_approve, fl.incorrect_approve, fl.correct_block, fl.incorrect_block, fl.correct_review, fl.incorrect_review, 1)
              const rows = [
                { label: 'Correct Approves',    count: fl.correct_approve,    color: '#16C784', note: 'Allowed + legitimate' },
                { label: 'Incorrect Approves',   count: fl.incorrect_approve,  color: '#EF4444', note: 'Allowed + fraud (missed)' },
                { label: 'Correct Blocks',       count: fl.correct_block,      color: '#16C784', note: 'Blocked + confirmed fraud' },
                { label: 'Incorrect Blocks',     count: fl.incorrect_block,    color: '#F59E0B', note: 'Blocked + legitimate (FP)' },
                { label: 'Correct Reviews',      count: fl.correct_review,     color: '#16C784', note: 'Reviewed + confirmed fraud' },
                { label: 'Incorrect Reviews',    count: fl.incorrect_review,   color: '#94A3B8', note: 'Reviewed + legitimate' },
              ]
              return (
                <div className="mb-5">
                  <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>Decision Quality Breakdown</p>
                  <div className="space-y-2">
                    {rows.map(r => (
                      <div key={r.label} className="flex items-center gap-3">
                        <span className="text-[11px] flex-shrink-0" style={{ color: T.textSec, width: '160px' }}>{r.label}</span>
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
                          <div className="h-full rounded-full" style={{ width: `${(r.count / maxVal) * 100}%`, background: r.color }} />
                        </div>
                        <span className="text-[11px] mono flex-shrink-0 w-8 text-right" style={{ color: r.color }}>{r.count}</span>
                        <span className="text-[10px] flex-shrink-0 hidden lg:block" style={{ color: T.textDim, width: '180px' }}>{r.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Auto insight */}
            {intelSum.feedback_loop.insight && (
              <div className="p-3 rounded-lg flex items-start gap-2.5"
                style={{ background: '#38BDF808', border: '1px solid #38BDF820' }}>
                <AlertCircle size={13} style={{ color: '#38BDF8', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs" style={{ color: T.textSec }}>{intelSum.feedback_loop.insight}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Fraud Analytics ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* GNX Score Distribution */}
        <ChartCard
          title="GNX Score Distribution"
          subtitle="Events bucketed by Genuinux Fraud Score™ (0–1000)"
          text={T.text} textDim={T.textDim}
        >
          {!intelSum || intelSum.gnx_distribution.total === 0 ? (
            <EmptyChart label="No events with GNX scores yet" textDim={T.textDim} />
          ) : (
            <div className="space-y-3 pt-1">
              {[
                { label: 'Low Risk',     range: '0 – 300',   count: intelSum.gnx_distribution.low,         color: '#16C784' },
                { label: 'Review Zone',  range: '301 – 700', count: intelSum.gnx_distribution.review_zone, color: '#F59E0B' },
                { label: 'High Risk',    range: '701 – 1000',count: intelSum.gnx_distribution.high,        color: '#EF4444' },
              ].map(band => {
                const total = intelSum.gnx_distribution.total
                const w = total === 0 ? 0 : (band.count / total) * 100
                return (
                  <div key={band.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: T.text }}>{band.label}</span>
                        <span className="text-[10px] mono" style={{ color: T.textDim }}>{band.range}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] mono font-semibold" style={{ color: band.color }}>{fmt(band.count)}</span>
                        <span className="text-[10px]" style={{ color: T.textDim }}>{pct(band.count, total)}%</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: T.border }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: band.color }} />
                    </div>
                  </div>
                )
              })}
              <p className="text-[10px] pt-1" style={{ color: T.textDim }}>
                {fmt(intelSum.gnx_distribution.total)} events with GNX scores in period
              </p>
            </div>
          )}
        </ChartCard>

        {/* Fraud Label Trends */}
        <ChartCard
          title="Fraud Label Trends"
          subtitle="Label submissions over time — stacked by type"
          text={T.text} textDim={T.textDim}
        >
          {!intelSum || intelSum.fraud_trends.length === 0 ? (
            <EmptyChart label="No labels submitted in this period" textDim={T.textDim} />
          ) : (
            <>
              <LabelStackedChart trends={intelSum.fraud_trends} textDim={T.textDim} />
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                {[
                  { label: 'Confirmed Fraud', color: '#EF4444' },
                  { label: 'Suspected Fraud', color: '#F97316' },
                  { label: 'False Positive',  color: '#F59E0B' },
                  { label: 'Legitimate',      color: '#16C784' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: l.color }} />
                    <span className="text-[10px]" style={{ color: T.textDim }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>
      </div>

      {/* Top Fraud Patterns */}
      {intelSum && intelSum.label_counts.confirmed_fraud > 0 && (
        <ChartCard
          title="Top Fraud Patterns"
          subtitle="Characteristics of events labeled as confirmed fraud"
          text={T.text} textDim={T.textDim}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-1">
            {[
              { title: 'Top Countries',    data: intelSum.top_patterns.countries          },
              { title: 'Event Types',      data: intelSum.top_patterns.event_types        },
              { title: 'Risk Levels',      data: intelSum.top_patterns.risk_levels        },
              { title: 'Original Decision',data: intelSum.top_patterns.original_decisions },
            ].map(group => {
              const maxC = Math.max(...group.data.map(d => d.count), 1)
              return (
                <div key={group.title}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: T.textDim }}>{group.title}</p>
                  {group.data.length === 0 ? (
                    <p className="text-[11px]" style={{ color: T.textDim }}>No data</p>
                  ) : (
                    <div className="space-y-2">
                      {group.data.map(d => (
                        <div key={d.value} className="flex items-center gap-2">
                          <span className="text-[11px] truncate flex-1" style={{ color: T.textSec }}>{d.value}</span>
                          <div className="w-16 h-1 rounded-full overflow-hidden flex-shrink-0" style={{ background: T.border }}>
                            <div className="h-full rounded-full" style={{ width: `${(d.count / maxC) * 100}%`, background: '#EF4444' }} />
                          </div>
                          <span className="text-[11px] mono flex-shrink-0" style={{ color: '#EF4444' }}>{d.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ChartCard>
      )}

      {/* ── Training Readiness ─────────────────────────────────────────────────── */}
      {intelSum && (
        <div className="g-card p-5">
          {(() => {
            const tr = intelSum.training_readiness
            const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
              not_ready:  { label: 'Not Ready',          color: '#94A3B8', bg: '#94A3B820' },
              collecting: { label: 'Collecting Data',    color: '#F59E0B', bg: '#F59E0B18' },
              near_ready: { label: 'Near Ready',         color: '#38BDF8', bg: '#38BDF818' },
              ready:      { label: 'Ready for ML Shadow Mode', color: '#16C784', bg: '#16C78418' },
            }
            const sm = statusMeta[tr.status] ?? statusMeta['not_ready']
            return (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <Brain size={16} style={{ color: sm.color }} />
                    <div>
                      <h3 className="text-sm font-semibold" style={{ color: T.text }}>Training Readiness</h3>
                      <p className="text-xs mt-0.5" style={{ color: T.textDim }}>
                        Progress toward ML shadow mode activation
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{ background: sm.bg, color: sm.color }}>
                    {sm.label}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mb-5">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span style={{ color: T.textSec }}>{tr.total_labels.toLocaleString()} labels collected</span>
                    <span style={{ color: T.textDim }}>Goal: 10,000</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: T.border }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${tr.progress_pct}%`, background: sm.color }} />
                  </div>
                  <p className="text-[10px] mt-1.5" style={{ color: T.textDim }}>{tr.progress_pct}% complete</p>
                </div>

                {/* Label count grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Confirmed Fraud', count: tr.confirmed_fraud_labels, color: '#EF4444' },
                    { label: 'Suspected Fraud', count: tr.suspected_fraud_labels, color: '#F97316' },
                    { label: 'False Positive',  count: tr.false_positive_labels,  color: '#F59E0B' },
                    { label: 'Legitimate',      count: tr.legitimate_labels,       color: '#16C784' },
                  ].map(l => (
                    <div key={l.label} className="rounded-xl p-3" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: T.textDim }}>{l.label}</p>
                      <p className="text-lg font-bold mono" style={{ color: l.count > 0 ? l.color : T.textDim }}>{l.count.toLocaleString()}</p>
                    </div>
                  ))}
                </div>

                {/* Data Quality Warnings */}
                {tr.data_quality_warnings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textDim }}>Data Quality Warnings</p>
                    {tr.data_quality_warnings.map(w => (
                      <div key={w} className="flex items-start gap-2 p-3 rounded-lg"
                        style={{ background: '#F59E0B08', border: '1px solid #F59E0B20' }}>
                        <AlertCircle size={12} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                        <p className="text-xs" style={{ color: T.textSec }}>{w}</p>
                      </div>
                    ))}
                  </div>
                )}

                {tr.data_quality_warnings.length === 0 && tr.total_labels >= 100 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg"
                    style={{ background: '#16C78408', border: '1px solid #16C78420' }}>
                    <Activity size={12} style={{ color: '#16C784', flexShrink: 0 }} />
                    <p className="text-xs" style={{ color: T.textSec }}>Dataset quality looks good — label distribution is balanced.</p>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* ── Intelligence Layer (overview) ────────────────────────────────────── */}
      <div className="g-card p-5">
        <div className="flex items-center gap-2.5 mb-5">
          <Brain size={16} style={{ color: '#818CF8' }} />
          <div>
            <h3 className="text-sm font-semibold" style={{ color: T.text }}>Intelligence Layer</h3>
            <p className="text-xs mt-0.5" style={{ color: T.textDim }}>
              GNX Score distribution and API fraud labels submitted this period
            </p>
          </div>
        </div>

        {/* GNX + label KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {/* Avg GNX Score */}
          <div className="rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textDim }}>
              Avg GNX Score
            </p>
            <p className="text-2xl font-bold mono" style={{ color: intelKpi.avgGnx === null ? T.textDim : gnxColor }}>
              {intelKpi.avgGnx === null ? '—' : intelKpi.avgGnx}
            </p>
            <p className="text-[10px] mt-1" style={{ color: T.textDim }}>0 – 1000 scale</p>
          </div>

          {/* Labels submitted */}
          <div className="rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textDim }}>
              Labels Submitted
            </p>
            <p className="text-2xl font-bold mono" style={{ color: T.text }}>{intelKpi.total}</p>
            <p className="text-[10px] mt-1" style={{ color: T.textDim }}>via POST /api/risk/label</p>
          </div>

          {/* Confirmed Fraud */}
          <div className="rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textDim }}>
              Confirmed Fraud
            </p>
            <p className="text-2xl font-bold mono" style={{ color: intelKpi.confirmedFraud > 0 ? '#EF4444' : T.text }}>
              {intelKpi.confirmedFraud}
            </p>
            <p className="text-[10px] mt-1" style={{ color: T.textDim }}>
              + {intelKpi.suspectedFraud} suspected
            </p>
          </div>

          {/* False Positive Rate */}
          <div className="rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textDim }}>
              False Positive Rate
            </p>
            <p className="text-2xl font-bold mono" style={{ color: intelKpi.fpRate > 20 ? '#F59E0B' : '#16C784' }}>
              {intelKpi.fpRate}%
            </p>
            <p className="text-[10px] mt-1" style={{ color: T.textDim }}>of submitted labels</p>
          </div>
        </div>

        {/* Label distribution */}
        {intelKpi.total === 0 ? (
          <div className="rounded-xl p-5 flex items-start gap-3"
            style={{ background: `#818CF808`, border: `1px solid #818CF820` }}>
            <AlertCircle size={15} style={{ color: '#818CF8', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: T.text }}>No labels submitted yet</p>
              <p className="text-xs mt-1" style={{ color: T.textDim }}>
                Send ground-truth labels from your backend via{' '}
                <code className="mono px-1 py-0.5 rounded text-[11px]"
                  style={{ background: T.card, color: '#818CF8' }}>
                  POST /api/risk/label
                </code>{' '}
                to activate the Intelligence Layer. Labels power the Genuinux Fraud Score™ and train
                future ML models.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>Label Distribution</p>
            <div className="space-y-2.5">
              {labelBreakdown.map(l => (
                <HBar
                  key={l.label}
                  label={l.label}
                  count={l.count}
                  max={maxLabel}
                  color={l.color}
                  textSec={T.textSec}
                  card={T.deep}
                />
              ))}
            </div>
            <p className="text-[10px] mt-3" style={{ color: T.textDim }}>
              {intelKpi.total} label{intelKpi.total !== 1 ? 's' : ''} collected ·{' '}
              ML training activates at 10,000 labels
            </p>
          </div>
        )}
      </div>

      {/* ── Feature Store ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <Database size={15} style={{ color: '#818CF8' }} />
            <h2 className="text-sm font-bold" style={{ color: T.text }}>Feature Store</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mono"
              style={{ background: '#818CF808', border: '1px solid #818CF830', color: '#818CF8' }}>
              Phase 3.3
            </span>
          </div>
          {featureStore && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]" style={{ color: T.textDim }}>Coverage</span>
              <span className="text-xs font-bold mono"
                style={{ color: featureStore.coverage_pct >= 95 ? '#16C784' : featureStore.coverage_pct > 0 ? '#F59E0B' : '#EF4444' }}>
                {featureStore.coverage_pct.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {!featureStore || featureStore.total_features === 0 ? (
          <div className="rounded-xl p-5 flex items-start gap-3"
            style={{ background: '#818CF808', border: '1px solid #818CF820' }}>
            <AlertCircle size={15} style={{ color: '#818CF8', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: T.text }}>Feature Store not yet active</p>
              <p className="text-xs mt-1" style={{ color: T.textDim }}>
                Apply v19 + v20 migrations, then set{' '}
                <code className="mono px-1 py-0.5 rounded text-[11px]"
                  style={{ background: T.deep, color: '#818CF8' }}>
                  FEATURE_STORE_ENABLED=true
                </code>{' '}
                in Vercel to start collecting feature vectors for ML training.
              </p>
              {featureStore?.notice && (
                <p className="text-[11px] mt-2 mono" style={{ color: T.textDim }}>{featureStore.notice}</p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Features',       value: featureStore.total_features.toLocaleString(), color: '#818CF8' },
                { label: 'Feature Types',        value: String(featureStore.feature_count),           color: '#818CF8' },
                { label: 'Events with Features', value: featureStore.events_with_features.toLocaleString(), color: '#16C784' },
                { label: 'Coverage Rate',        value: `${featureStore.coverage_pct.toFixed(1)}%`,
                  color: featureStore.coverage_pct >= 95 ? '#16C784' : '#F59E0B' },
              ].map(k => (
                <div key={k.label} className="rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textDim }}>
                    {k.label}
                  </p>
                  <p className="text-xl font-bold mono" style={{ color: k.color }}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Group cards */}
            <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>Features by Group</p>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
              {featureStore.group_stats.map(g => {
                const COLOR_MAP: Record<string, string> = {
                  velocity:   '#38BDF8',
                  reputation: '#A78BFA',
                  behavior:   '#FB923C',
                  risk:       '#EF4444',
                  context:    '#16C784',
                }
                const c = COLOR_MAP[g.group] ?? '#94A3B8'
                return (
                  <div key={g.group} className="rounded-xl p-4 text-center"
                    style={{ background: `${c}08`, border: `1px solid ${c}30` }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: c }}>
                      {g.group}
                    </p>
                    <p className="text-2xl font-bold mono mb-0.5" style={{ color: T.text }}>
                      {g.count.toLocaleString()}
                    </p>
                    <p className="text-[10px]" style={{ color: T.textDim }}>
                      {g.feature_count} feature type{g.feature_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Top features table */}
            {featureStore.feature_stats.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>Top Features by Volume</p>
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: T.deep }}>
                        {['Feature', 'Group', 'Version', 'Rows', 'Avg', 'Min', 'Max'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold"
                            style={{ color: T.textDim }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {featureStore.feature_stats.slice(0, 10).map((s, i) => {
                        const GROUP_COLOR: Record<string, string> = {
                          velocity: '#38BDF8', reputation: '#A78BFA',
                          behavior: '#FB923C', risk: '#EF4444', context: '#16C784',
                        }
                        const gc = GROUP_COLOR[s.feature_group] ?? '#94A3B8'
                        return (
                          <tr key={`${s.feature_name}-v${s.feature_version}`}
                            style={{ background: i % 2 === 0 ? 'transparent' : `${T.deep}80`, borderTop: `1px solid ${T.border}` }}>
                            <td className="px-3 py-2 mono font-semibold" style={{ color: T.text }}>{s.feature_name}</td>
                            <td className="px-3 py-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                style={{ background: `${gc}15`, color: gc }}>
                                {s.feature_group}
                              </span>
                            </td>
                            <td className="px-3 py-2 mono" style={{ color: T.textDim }}>v{s.feature_version}</td>
                            <td className="px-3 py-2 mono" style={{ color: T.text }}>{s.count.toLocaleString()}</td>
                            <td className="px-3 py-2 mono" style={{ color: T.textSec }}>{s.avg.toFixed(3)}</td>
                            <td className="px-3 py-2 mono" style={{ color: T.textDim }}>{s.min.toFixed(2)}</td>
                            <td className="px-3 py-2 mono" style={{ color: T.textDim }}>{s.max.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Data Quality Warnings */}
            {featureStore.data_quality_warnings.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: T.textDim }}>Data Quality Warnings</p>
                <div className="space-y-2">
                  {featureStore.data_quality_warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2"
                      style={{ background: '#F59E0B08', border: '1px solid #F59E0B20' }}>
                      <AlertCircle size={12} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                      <p className="text-[11px]" style={{ color: T.textSec }}>{w}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Training Dataset ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <Layers size={15} style={{ color: '#16C784' }} />
            <h2 className="text-sm font-bold" style={{ color: T.text }}>Training Dataset</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mono"
              style={{ background: '#16C78408', border: '1px solid #16C78430', color: '#16C784' }}>
              Phase 3.6
            </span>
          </div>
          {datasetStats && datasetStats.total_records > 0 && (
            <div className="flex items-center gap-2">
              {(['csv', 'json'] as const).map(fmt => (
                <button
                  key={fmt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: T.deep, border: `1px solid ${T.border}`, color: T.textSec }}
                  onClick={() => {
                    const token = session?.access_token
                    if (!token) return
                    fetch(`/api/admin/intelligence/dataset/export?format=${fmt}`, {
                      headers: { Authorization: `Bearer ${token}` },
                    })
                      .then(r => r.blob())
                      .then(blob => {
                        const url = URL.createObjectURL(blob)
                        const a   = document.createElement('a')
                        a.href     = url
                        a.download = `training_dataset_${new Date().toISOString().slice(0, 10)}.${fmt}`
                        a.click()
                        URL.revokeObjectURL(url)
                      })
                      .catch(() => {})
                  }}
                >
                  <Download size={11} />
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {!datasetStats || datasetStats.total_records === 0 ? (
          <div className="rounded-xl p-5 flex items-start gap-3"
            style={{ background: '#16C78408', border: '1px solid #16C78420' }}>
            <AlertCircle size={15} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: T.text }}>
                {datasetStats?.notice ? 'Migration required' : 'No dataset records yet'}
              </p>
              <p className="text-xs mt-1" style={{ color: T.textDim }}>
                {datasetStats?.notice
                  ? `${datasetStats.notice} Then set DATASET_BUILDER_ENABLED=true in Vercel.`
                  : 'Submit ground-truth labels via POST /api/risk/label. The Dataset Builder generates training records automatically after each label.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {[
                {
                  label: 'Dataset Records',
                  value: datasetStats.total_records.toLocaleString(),
                  color: '#16C784',
                },
                {
                  label: 'Total Labels',
                  value: datasetStats.total_labels.toLocaleString(),
                  color: '#16C784',
                },
                {
                  label: 'Feature Coverage',
                  value: `${datasetStats.feature_coverage_pct.toFixed(1)}%`,
                  color: datasetStats.feature_coverage_pct >= 95 ? '#16C784' : '#F59E0B',
                },
                {
                  label: 'Dataset Coverage',
                  value: `${datasetStats.coverage_pct.toFixed(1)}%`,
                  color: datasetStats.coverage_pct >= 95 ? '#16C784' : '#F59E0B',
                },
              ].map(k => (
                <div key={k.label} className="rounded-xl p-4"
                  style={{ background: T.deep, border: `1px solid ${T.border}` }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: T.textDim }}>{k.label}</p>
                  <p className="text-xl font-bold mono" style={{ color: k.color }}>{k.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              {/* Label Distribution */}
              <div>
                <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>Label Distribution</p>
                <div className="space-y-2.5">
                  {([
                    { key: 'confirmed_fraud', label: 'Confirmed Fraud', color: '#EF4444' },
                    { key: 'suspected_fraud', label: 'Suspected Fraud', color: '#F97316' },
                    { key: 'false_positive',  label: 'False Positive',  color: '#F59E0B' },
                    { key: 'legitimate',      label: 'Legitimate',      color: '#16C784' },
                  ] as Array<{ key: keyof DatasetStats['label_distribution']; label: string; color: string }>)
                    .map(({ key, label, color }) => {
                      const entry = datasetStats.label_distribution[key]
                      return (
                        <div key={key}>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
                            <span className="text-xs mono" style={{ color: T.text }}>
                              {entry.count.toLocaleString()}{' '}
                              <span style={{ color: T.textDim }}>({entry.pct}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden"
                            style={{ background: T.border }}>
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(entry.pct, 100)}%`, background: color, opacity: 0.85 }} />
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Training Readiness Score */}
              <div>
                <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>Training Readiness</p>
                <div className="rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
                      <svg viewBox="0 0 64 64" width="64" height="64">
                        <circle cx="32" cy="32" r="26" fill="none" stroke={T.border} strokeWidth="6" />
                        <circle
                          cx="32" cy="32" r="26" fill="none"
                          stroke={
                            datasetStats.readiness.score >= 76 ? '#16C784'
                            : datasetStats.readiness.score >= 51 ? '#F59E0B'
                            : '#818CF8'
                          }
                          strokeWidth="6"
                          strokeDasharray={`${(datasetStats.readiness.score / 100) * 163.36} 163.36`}
                          strokeLinecap="round"
                          transform="rotate(-90 32 32)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold mono" style={{ color: T.text }}>
                          {Math.round(datasetStats.readiness.score)}%
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: T.text }}>
                        {datasetStats.readiness.status}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: T.textDim }}>
                        v{datasetStats.dataset_version} · {datasetStats.total_records.toLocaleString()} records
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Events (100k)',  value: datasetStats.readiness.events_progress },
                      { label: 'Labels (10k)',   value: datasetStats.readiness.labels_progress },
                      { label: 'Coverage (95%)', value: datasetStats.readiness.coverage_progress },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[10px]" style={{ color: T.textDim }}>{label}</span>
                          <span className="text-[10px] mono" style={{ color: T.textSec }}>
                            {value.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: T.border }}>
                          <div className="h-full rounded-full"
                            style={{
                              width: `${Math.min(value, 100)}%`,
                              background: value >= 100 ? '#16C784' : '#818CF8',
                            }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Dataset Balance Warnings */}
            {datasetStats.dataset_balance_warnings.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: T.textDim }}>
                  Dataset Balance Warnings
                </p>
                <div className="space-y-2">
                  {datasetStats.dataset_balance_warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2"
                      style={{ background: '#F59E0B08', border: '1px solid #F59E0B20' }}>
                      <AlertCircle size={12} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                      <p className="text-[11px]" style={{ color: T.textSec }}>{w}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}
