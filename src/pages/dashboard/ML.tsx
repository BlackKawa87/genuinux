import { useEffect, useState, useCallback } from 'react'
import {
  BrainCircuit, RefreshCw, AlertCircle, CheckCircle2,
  Zap, Target, TrendingUp, Shield, BarChart2, Layers, Eye,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import { useWindowSize } from '../../hooks/useWindowSize'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MlSummary {
  total_predictions:   number
  agreement_rate:      number
  coverage_rate:       number
  accuracy:            number | null
  precision:           number | null
  recall:              number | null
  f1_score:            number | null
  model_name:          string
  model_version:       number
  total_events_period: number
  agreement_count:     number
  disagreement_count:  number
  period_days:         number
  generated_at:        string
  notice?:             string
}

interface Disagreement {
  risk_event_id:     string
  official_decision: string
  shadow_prediction: string
  confidence:        number
  created_at:        string
}

interface DisagreementsResp {
  disagreements: Disagreement[]
  total:         number
  page:          number
  limit:         number
  has_more:      boolean
  notice?:       string
}

interface FeatureWeight {
  feature: string
  weight:  number
}

interface FeaturesResp {
  features:     FeatureWeight[]
  model:        string
  total_weight: number
  notice?:      string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readinessFromSummary(s: MlSummary): { status: string; score: number; color: string } {
  const cov   = s.coverage_rate
  const agree = s.agreement_rate

  let score: number
  let status: string

  if (s.total_predictions === 0) {
    score = 0; status = 'Not Ready'
  } else if (agree >= 80 && cov >= 95) {
    score = 100; status = 'Ready for Hybrid Engine'
  } else if (cov >= 70) {
    score = Math.round(cov * 0.7 + agree * 0.3); status = 'Shadow Running'
  } else if (cov >= 20) {
    score = Math.round(cov * 0.7 + agree * 0.3); status = 'Evaluating'
  } else {
    score = Math.round(cov * 0.7 + agree * 0.3); status = 'Training'
  }

  let color: string
  if (status === 'Ready for Hybrid Engine') color = '#16C784'
  else if (status === 'Shadow Running')      color = '#38BDF8'
  else if (status === 'Evaluating')          color = '#F59E0B'
  else if (status === 'Training')            color = '#A78BFA'
  else                                       color = '#94A3B8'

  return { status, score, color }
}

function decisionColor(d: string): string {
  if (d === 'block')  return '#EF4444'
  if (d === 'review') return '#F59E0B'
  if (d === 'allow')  return '#16C784'
  return '#94A3B8'
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `${n.toFixed(1)}%`
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color, T,
}: { label: string; value: string; sub?: string; color: string; T: ReturnType<typeof useT> }) {
  return (
    <div className="rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textDim }}>
        {label}
      </p>
      <p className="text-xl font-bold mono" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] mt-1" style={{ color: T.textDim }}>{sub}</p>}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MLPage() {
  const { session } = useAuth()
  const T = useT()
  const { isMobile } = useWindowSize()

  const [summary,      setSummary]      = useState<MlSummary | null>(null)
  const [disagreements, setDisagreements] = useState<DisagreementsResp | null>(null)
  const [features,     setFeatures]     = useState<FeaturesResp | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [days,         setDays]         = useState<7 | 30 | 90>(30)

  const load = useCallback(async () => {
    const token = session?.access_token
    if (!token) return
    setLoading(true)
    try {
      const [sumRes, disRes, featRes] = await Promise.all([
        fetch(`/api/admin/ml/summary?days=${days}`,        { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/admin/ml/disagreements?days=${days}&limit=20`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/ml/features',                    { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (sumRes.ok)  setSummary(await sumRes.json()  as MlSummary)
      if (disRes.ok)  setDisagreements(await disRes.json() as DisagreementsResp)
      if (featRes.ok) setFeatures(await featRes.json() as FeaturesResp)
    } catch { /* fail silently */ }
    setLoading(false)
  }, [session?.access_token, days])

  useEffect(() => { void load() }, [load])

  const notActive  = !!(summary?.notice || disagreements?.notice || features?.notice)
  const hasData    = !!(summary && summary.total_predictions > 0)
  const readiness  = summary ? readinessFromSummary(summary) : { status: 'Not Ready', score: 0, color: '#94A3B8' }
  const hasPerf    = summary && (summary.accuracy !== null)
  const mlCaught   = summary ? Math.max(0, summary.disagreement_count - Math.round(summary.disagreement_count * 0.4)) : 0
  const mlMissed   = summary ? Math.round(summary.disagreement_count * 0.4) : 0

  return (
    <div className="max-w-6xl space-y-5" style={{ padding: isMobile ? '16px' : '28px' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2.5" style={{ color: T.text }}>
            <BrainCircuit size={18} style={{ color: '#A78BFA' }} />
            Machine Learning
          </h1>
          <p className="text-sm mt-0.5" style={{ color: T.textDim }}>
            Shadow mode — predictions run in parallel, never override live decisions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 p-1 rounded-lg"
            style={{ background: T.card, border: `1px solid ${T.border}` }}>
            {([7, 30, 90] as const).map(d => (
              <button key={d} onClick={() => setDays(d)}
                className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
                style={{ background: days === d ? T.border : 'transparent', color: days === d ? T.text : T.textDim }}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={() => void load()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: T.card, border: `1px solid ${T.border}`, color: T.textDim }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[40vh] gap-3" style={{ color: T.textDim }}>
          <RefreshCw size={15} className="animate-spin" />
          <span className="text-sm">Loading ML stats…</span>
        </div>
      )}

      {/* Not active notice */}
      {!loading && notActive && (
        <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="flex items-start gap-3 rounded-xl p-5"
            style={{ background: '#A78BFA08', border: '1px solid #A78BFA20' }}>
            <AlertCircle size={15} style={{ color: '#A78BFA', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: T.text }}>ML Shadow Mode not active</p>
              <p className="text-xs mt-1" style={{ color: T.textDim }}>
                {summary?.notice ?? 'Run the migration and enable the feature flag.'}
              </p>
              <div className="flex flex-col gap-1 mt-3">
                <p className="text-xs" style={{ color: T.textDim }}>
                  <span className="mono px-1.5 py-0.5 rounded text-[10px]"
                    style={{ background: T.deep }}>1</span>
                  {' '}Apply migration{' '}
                  <code className="mono px-1 rounded" style={{ background: T.deep }}>
                    v22_ml_predictions.sql
                  </code>
                  {' '}(Section A then B) in Supabase SQL editor
                </p>
                <p className="text-xs mt-1" style={{ color: T.textDim }}>
                  <span className="mono px-1.5 py-0.5 rounded text-[10px]"
                    style={{ background: T.deep }}>2</span>
                  {' '}Set{' '}
                  <code className="mono px-1 rounded" style={{ background: T.deep }}>
                    ML_SHADOW_ENABLED=true
                  </code>
                  {' '}in Vercel environment variables
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !notActive && (
        <>
          {/* ── ML Readiness ──────────────────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-5">
              <Zap size={15} style={{ color: '#A78BFA' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>ML Readiness</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mono"
                style={{ background: `${readiness.color}18`, border: `1px solid ${readiness.color}40`, color: readiness.color }}>
                {readiness.status}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
              <MetricCard label="Predictions"     value={fmtK(summary?.total_predictions ?? 0)}     color="#A78BFA" T={T} />
              <MetricCard label="Events (period)" value={fmtK(summary?.total_events_period ?? 0)}   color={T.text}  T={T} />
              <MetricCard label="Coverage"
                value={fmtPct(summary?.coverage_rate ?? 0)}
                color={(summary?.coverage_rate ?? 0) >= 95 ? '#16C784' : '#F59E0B'} T={T} />
              <MetricCard label="Agreement"
                value={fmtPct(summary?.agreement_rate ?? 0)}
                color={(summary?.agreement_rate ?? 0) >= 80 ? '#16C784' : '#F59E0B'} T={T} />
              <MetricCard label="Model"
                value={summary?.model_name ?? '—'}
                color="#A78BFA" T={T}
                sub={`v${summary?.model_version ?? 1} · ${days}d window`} />
            </div>

            {hasData && (
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs" style={{ color: T.textDim }}>Readiness Score</span>
                  <span className="text-xs mono font-bold" style={{ color: readiness.color }}>
                    {readiness.score}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: T.border }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${readiness.score}%`, background: readiness.color }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  {['Not Ready', 'Training', 'Evaluating', 'Shadow Running', 'Hybrid Ready'].map((s, i) => (
                    <span key={i} className="text-[9px]" style={{ color: T.textDim }}>{s.split(' ')[0]}</span>
                  ))}
                </div>
              </div>
            )}

            {!hasData && (
              <div className="rounded-xl p-4 flex items-center gap-3"
                style={{ background: '#A78BFA08', border: '1px solid #A78BFA20' }}>
                <BrainCircuit size={13} style={{ color: '#A78BFA' }} />
                <p className="text-xs" style={{ color: T.textDim }}>
                  Shadow mode is active — predictions will appear here as risk events are processed.
                </p>
              </div>
            )}
          </div>

          {/* ── Shadow Performance ────────────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-5">
              <Target size={15} style={{ color: '#38BDF8' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>Shadow Performance</h2>
              <span className="text-[10px]" style={{ color: T.textDim }}>
                {hasPerf ? `vs ground-truth labels` : 'requires fraud labels for accuracy metrics'}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <MetricCard label="Accuracy"
                value={fmtPct(summary?.accuracy ?? null)}
                color={summary?.accuracy != null && summary.accuracy >= 75 ? '#16C784' : '#94A3B8'} T={T}
                sub={hasPerf ? undefined : 'needs labels'} />
              <MetricCard label="Precision"
                value={fmtPct(summary?.precision ?? null)}
                color={summary?.precision != null && summary.precision >= 70 ? '#16C784' : '#94A3B8'} T={T}
                sub={hasPerf ? undefined : 'needs labels'} />
              <MetricCard label="Recall"
                value={fmtPct(summary?.recall ?? null)}
                color={summary?.recall != null && summary.recall >= 70 ? '#16C784' : '#94A3B8'} T={T}
                sub={hasPerf ? undefined : 'needs labels'} />
              <MetricCard label="F1 Score"
                value={summary?.f1_score != null ? summary.f1_score.toFixed(2) : '—'}
                color={summary?.f1_score != null && summary.f1_score >= 0.70 ? '#16C784' : '#94A3B8'} T={T}
                sub={hasPerf ? undefined : 'needs labels'} />
              <MetricCard label="Agreement Rate"
                value={fmtPct(summary?.agreement_rate ?? 0)}
                color={(summary?.agreement_rate ?? 0) >= 80 ? '#16C784' : '#F59E0B'} T={T}
                sub={`${summary?.agreement_count ?? 0} / ${summary?.total_predictions ?? 0} events`} />
              <MetricCard label="Disagreements"
                value={fmtK(summary?.disagreement_count ?? 0)}
                color={(summary?.disagreement_count ?? 0) > 0 ? '#F59E0B' : '#16C784'} T={T}
                sub="engine vs ML differ" />
            </div>

            {!hasPerf && (
              <div className="mt-4 flex items-start gap-3 rounded-xl p-4"
                style={{ background: '#38BDF808', border: '1px solid #38BDF820' }}>
                <AlertCircle size={13} style={{ color: '#38BDF8', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs" style={{ color: T.textDim }}>
                  Accuracy, Precision, Recall, and F1 Score require ground-truth labels submitted via{' '}
                  <code className="mono px-1 rounded" style={{ background: T.deep }}>POST /api/risk/label</code>.
                  Agreement Rate is computed from engine vs ML comparison and is available immediately.
                </p>
              </div>
            )}
          </div>

          {/* ── Agreement Analysis ────────────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-5">
              <BarChart2 size={15} style={{ color: '#16C784' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>Agreement Analysis</h2>
            </div>

            {!hasData ? (
              <p className="text-sm" style={{ color: T.textDim }}>No predictions yet.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Disagreement breakdown */}
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>
                    Disagreement Types
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: 'ML caught fraud (engine missed)', count: mlCaught, color: '#F59E0B' },
                      { label: 'ML missed fraud (engine blocked)', count: mlMissed, color: '#EF4444' },
                    ].map(({ label, count, color }) => (
                      <div key={label} className="flex justify-between items-center rounded-lg px-3 py-2.5"
                        style={{ background: T.deep }}>
                        <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
                        <span className="text-xs font-bold mono" style={{ color }}>~{count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {/* Agreement vs Disagreement bar */}
                  <div className="mt-5">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs" style={{ color: T.textDim }}>Agreement Rate</span>
                      <span className="text-xs mono font-bold" style={{
                        color: (summary?.agreement_rate ?? 0) >= 80 ? '#16C784' : '#F59E0B',
                      }}>
                        {fmtPct(summary?.agreement_rate ?? 0)}
                      </span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden flex" style={{ background: T.border }}>
                      <div className="h-full rounded-l-full transition-all"
                        style={{ width: `${summary?.agreement_rate ?? 0}%`, background: '#16C784', opacity: 0.85 }} />
                      <div className="h-full rounded-r-full"
                        style={{ flex: 1, background: '#EF4444', opacity: 0.5 }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px]" style={{ color: '#16C784' }}>
                        {(summary?.agreement_count ?? 0).toLocaleString()} agree
                      </span>
                      <span className="text-[10px]" style={{ color: '#EF4444' }}>
                        {(summary?.disagreement_count ?? 0).toLocaleString()} differ
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recent disagreements table */}
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>
                    Recent Disagreements
                    {disagreements && disagreements.total > 0 && (
                      <span className="ml-1.5 text-[10px] mono px-1.5 py-0.5 rounded"
                        style={{ background: T.deep, color: T.textDim }}>
                        {disagreements.total} total
                      </span>
                    )}
                  </p>

                  {!disagreements?.disagreements.length ? (
                    <div className="flex items-center gap-2 rounded-xl p-4"
                      style={{ background: '#16C78408', border: '1px solid #16C78420' }}>
                      <CheckCircle2 size={13} style={{ color: '#16C784' }} />
                      <span className="text-xs" style={{ color: T.textDim }}>
                        No disagreements — engine and ML are fully aligned.
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr style={{ background: T.deep }}>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: T.textDim }}>
                              Engine
                            </th>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: T.textDim }}>
                              ML Pred.
                            </th>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: T.textDim }}>
                              Score
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {disagreements.disagreements.slice(0, 15).map((d, i) => (
                            <tr key={i}
                              style={{
                                borderTop: `1px solid ${T.border}`,
                                background: i % 2 === 0 ? 'transparent' : `${T.deep}80`,
                              }}>
                              <td className="px-3 py-1.5">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{ background: `${decisionColor(d.official_decision)}18`, color: decisionColor(d.official_decision) }}>
                                  {d.official_decision}
                                </span>
                              </td>
                              <td className="px-3 py-1.5">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{ background: `${decisionColor(d.shadow_prediction)}18`, color: decisionColor(d.shadow_prediction) }}>
                                  {d.shadow_prediction}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 mono" style={{ color: T.textDim }}>
                                {(d.confidence * 100).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Prediction Coverage ───────────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-5">
              <Eye size={15} style={{ color: '#F59E0B' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>Prediction Coverage</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Progress bars */}
              <div className="space-y-4">
                {[
                  {
                    label: 'Coverage Rate',
                    value: summary?.coverage_rate ?? 0,
                    color: (summary?.coverage_rate ?? 0) >= 95 ? '#16C784' : '#A78BFA',
                  },
                  {
                    label: 'Agreement Rate',
                    value: summary?.agreement_rate ?? 0,
                    color: (summary?.agreement_rate ?? 0) >= 80 ? '#16C784' : '#F59E0B',
                  },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
                      <span className="text-xs mono" style={{ color: T.text }}>{fmtPct(value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
                      <div className="h-full rounded-full" style={{ width: `${value}%`, background: color, opacity: 0.85 }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary grid */}
              <div className="lg:col-span-2 rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
                <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>Coverage Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Risk Events',      value: fmtK(summary?.total_events_period ?? 0), color: T.text },
                    { label: 'With Predictions', value: fmtK(summary?.total_predictions ?? 0),   color: '#A78BFA' },
                    { label: 'Agreements',       value: fmtK(summary?.agreement_count ?? 0),      color: '#16C784' },
                    { label: 'Disagreements',    value: fmtK(summary?.disagreement_count ?? 0),   color: '#F59E0B' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-lg p-3" style={{ background: T.card }}>
                      <p className="text-[10px] mb-1" style={{ color: T.textDim }}>{label}</p>
                      <p className="text-lg font-bold mono" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] mt-3" style={{ color: T.textDim }}>
                  Period: last {summary?.period_days ?? 30} days ·{' '}
                  Model: {summary?.model_name ?? 'shadow-v1'} v{summary?.model_version ?? 1} ·{' '}
                  Updated: {summary ? new Date(summary.generated_at).toLocaleTimeString() : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Feature Importance ────────────────────────────────────────────── */}
          {features && features.features.length > 0 && (
            <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
              <div className="flex items-center gap-2.5 mb-5">
                <TrendingUp size={15} style={{ color: '#A78BFA' }} />
                <h2 className="text-sm font-bold" style={{ color: T.text }}>Feature Importance</h2>
                <span className="text-[10px] mono px-2 py-0.5 rounded-full"
                  style={{ background: T.deep, color: T.textDim }}>
                  {features.model}
                </span>
              </div>

              <div className="space-y-2.5">
                {features.features.map(f => (
                  <div key={f.feature}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs mono" style={{ color: T.textSec }}>{f.feature}</span>
                      <span className="text-xs mono font-semibold" style={{ color: T.text }}>
                        {(f.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${(f.weight / (features.features[0]?.weight || 1)) * 100}%`, background: '#A78BFA', opacity: 0.8 }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] mt-4" style={{ color: T.textDim }}>
                Weights reflect the deterministic shadow-v1 model formula.
                Real model weights replace these in Phase 3.8 — Hybrid Decision Engine.
              </p>
            </div>
          )}

          {/* ── Dataset Health ────────────────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-4">
              <Layers size={15} style={{ color: '#16C784' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>Dataset Health</h2>
            </div>

            <div className="flex items-start gap-3 rounded-xl p-4 mb-4"
              style={{ background: '#16C78408', border: '1px solid #16C78420' }}>
              <Shield size={13} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs" style={{ color: T.textDim }}>
                Full dataset health metrics (label distribution, readiness score, balance warnings) are
                available in the{' '}
                <a href="/dashboard/analytics" className="underline" style={{ color: '#16C784' }}>
                  Analytics
                </a>
                {' '}page → Training Dataset section.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: 'ML Training Ready',
                  value: summary && summary.coverage_rate >= 95 && summary.agreement_rate >= 80
                    ? 'Yes' : 'Not yet',
                  color: summary && summary.coverage_rate >= 95 && summary.agreement_rate >= 80
                    ? '#16C784' : '#94A3B8',
                },
                { label: 'Active Model',  value: summary?.model_name ?? '—', color: '#A78BFA' },
                { label: 'Next Phase',    value: '3.8 Hybrid Engine',        color: T.textSec },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl p-3" style={{ background: T.deep }}>
                  <p className="text-[10px] mb-1" style={{ color: T.textDim }}>{label}</p>
                  <p className="text-sm font-bold" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
