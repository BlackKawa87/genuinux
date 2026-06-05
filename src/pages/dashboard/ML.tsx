import { useEffect, useState, useCallback } from 'react'
import {
  BrainCircuit, RefreshCw, AlertCircle, CheckCircle2,
  Zap, Target, TrendingUp, Shield, BarChart2, Layers, Eye,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DistEntry { count: number; pct: number }

interface Disagreement {
  risk_event_id:     string
  engine_decision:   string | null
  predicted_label:   string
  fraud_probability: number
  confidence:        number
  created_at:        string
}

interface FeatImportance {
  feature_name:     string
  importance_score: number
}

interface MlStats {
  total_predictions:       number
  total_events_period:     number
  prediction_coverage_pct: number
  agreement_count:         number
  disagreement_count:      number
  agreement_rate:          number
  prediction_distribution: {
    confirmed_fraud: DistEntry
    suspected_fraud: DistEntry
    legitimate:      DistEntry
  }
  labeled_count:           number
  accuracy:                number
  precision:               number
  recall:                  number
  false_positive_rate:     number
  false_negative_rate:     number
  disagreement_types: {
    ml_caught_fraud: number
    ml_missed_fraud: number
    review_mismatch: number
  }
  recent_disagreements: Disagreement[]
  feature_importance:   FeatImportance[]
  model_version:        string
  readiness_status:     string
  readiness_score:      number
  period_days:          number
  generated_at:         string
  notice?:              string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  if (status === 'Ready for Hybrid Engine') return '#16C784'
  if (status === 'Shadow Running')          return '#38BDF8'
  if (status === 'Evaluating')              return '#F59E0B'
  if (status === 'Training')                return '#A78BFA'
  return '#94A3B8'
}

function labelColor(label: string): string {
  if (label === 'confirmed_fraud') return '#EF4444'
  if (label === 'suspected_fraud') return '#F97316'
  if (label === 'legitimate')      return '#16C784'
  return '#94A3B8'
}

function engineColor(decision: string | null): string {
  if (decision === 'block')  return '#EF4444'
  if (decision === 'review') return '#F59E0B'
  if (decision === 'allow')  return '#16C784'
  return '#94A3B8'
}

function fmtPct(n: number): string { return `${n.toFixed(1)}%` }
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

function PBar({ label, value, max, color, T }: {
  label: string; value: number; max: number; color: string; T: ReturnType<typeof useT>
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
        <span className="text-xs mono" style={{ color: T.text }}>{fmtPct(value)}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color, opacity: 0.85 }} />
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MLPage() {
  const { session } = useAuth()
  const T = useT()

  const [stats,   setStats]   = useState<MlStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [days,    setDays]    = useState<30 | 7 | 90>(30)

  const loadStats = useCallback(async () => {
    const token = session?.access_token
    if (!token) return
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/intelligence/ml/stats?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) setStats(await r.json() as MlStats)
    } catch { /* fail silently */ }
    setLoading(false)
  }, [session?.access_token, days])

  useEffect(() => { void loadStats() }, [loadStats])

  const sColor  = stats ? statusColor(stats.readiness_status) : '#94A3B8'
  const hasData = stats && stats.total_predictions > 0

  return (
    <div className="p-7 max-w-6xl space-y-5">

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
          {/* Range picker */}
          <div className="flex items-center gap-0.5 p-1 rounded-lg"
            style={{ background: T.card, border: `1px solid ${T.border}` }}>
            {([7, 30, 90] as const).map(d => (
              <button key={d} onClick={() => setDays(d)}
                className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
                style={{
                  background: days === d ? T.border : 'transparent',
                  color:      days === d ? T.text   : T.textDim,
                }}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={() => void loadStats()}
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

      {!loading && stats?.notice && (
        <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="flex items-start gap-3 rounded-xl p-5"
            style={{ background: '#A78BFA08', border: '1px solid #A78BFA20' }}>
            <AlertCircle size={15} style={{ color: '#A78BFA', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: T.text }}>ML Shadow Mode not active</p>
              <p className="text-xs mt-1" style={{ color: T.textDim }}>{stats.notice}</p>
              <p className="text-xs mt-2" style={{ color: T.textDim }}>
                1. Apply migration <code className="mono px-1 rounded" style={{ background: T.deep }}>v22_ml_shadow.sql</code>
                {' '}2. Set <code className="mono px-1 rounded" style={{ background: T.deep }}>ML_SHADOW_ENABLED=true</code> in Vercel
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && !stats?.notice && (
        <>
          {/* ── ML Readiness ─────────────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-5">
              <Zap size={15} style={{ color: '#A78BFA' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>ML Readiness</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mono"
                style={{ background: `${sColor}15`, border: `1px solid ${sColor}40`, color: sColor }}>
                {stats?.readiness_status ?? 'Not Ready'}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
              <MetricCard label="Predictions"     value={fmtK(stats?.total_predictions ?? 0)}     color="#A78BFA" T={T} />
              <MetricCard label="Events (period)" value={fmtK(stats?.total_events_period ?? 0)}   color={T.text}  T={T} />
              <MetricCard label="Coverage"
                value={fmtPct(stats?.prediction_coverage_pct ?? 0)}
                color={stats && stats.prediction_coverage_pct >= 95 ? '#16C784' : '#F59E0B'} T={T} />
              <MetricCard label="Agreement Rate"
                value={fmtPct(stats?.agreement_rate ?? 0)}
                color={stats && stats.agreement_rate >= 80 ? '#16C784' : '#F59E0B'} T={T} />
              <MetricCard label="Model" value={stats?.model_version ?? '—'} color="#A78BFA" T={T}
                sub={`v${stats?.period_days}d window`} />
            </div>

            {/* Readiness progress bar */}
            {hasData && (
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs" style={{ color: T.textDim }}>Readiness Score</span>
                  <span className="text-xs mono font-bold" style={{ color: sColor }}>
                    {stats!.readiness_score}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: T.border }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${stats!.readiness_score}%`, background: sColor }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  {['Not Ready', 'Training', 'Evaluating', 'Shadow Running', 'Ready for Hybrid Engine'].map((s, i) => (
                    <span key={i} className="text-[9px]" style={{ color: T.textDim }}>{s.split(' ')[0]}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Shadow Performance ───────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-5">
              <Target size={15} style={{ color: '#38BDF8' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>Shadow Performance</h2>
              {stats && stats.labeled_count > 0 && (
                <span className="text-[10px]" style={{ color: T.textDim }}>
                  vs {stats.labeled_count} ground-truth labels
                </span>
              )}
            </div>

            {!hasData || stats!.labeled_count === 0 ? (
              <div className="rounded-xl p-4 flex items-start gap-3"
                style={{ background: '#38BDF808', border: '1px solid #38BDF820' }}>
                <AlertCircle size={13} style={{ color: '#38BDF8', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs" style={{ color: T.textDim }}>
                  Performance metrics require ground-truth labels from{' '}
                  <code className="mono px-1 rounded" style={{ background: T.deep }}>POST /api/risk/label</code>.
                  {!hasData && ' Start by activating ML_SHADOW_ENABLED=true.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <MetricCard label="Accuracy"
                  value={fmtPct(stats!.accuracy)}
                  color={stats!.accuracy >= 75 ? '#16C784' : '#F59E0B'} T={T} />
                <MetricCard label="Precision"
                  value={fmtPct(stats!.precision)}
                  color={stats!.precision >= 70 ? '#16C784' : '#F59E0B'} T={T} />
                <MetricCard label="Recall"
                  value={fmtPct(stats!.recall)}
                  color={stats!.recall >= 70 ? '#16C784' : '#F59E0B'} T={T} />
                <MetricCard label="False Positive Rate"
                  value={fmtPct(stats!.false_positive_rate)}
                  color={stats!.false_positive_rate <= 15 ? '#16C784' : '#EF4444'} T={T} />
                <MetricCard label="False Negative Rate"
                  value={fmtPct(stats!.false_negative_rate)}
                  color={stats!.false_negative_rate <= 15 ? '#16C784' : '#EF4444'} T={T} />
                <MetricCard label="Agreement Rate"
                  value={fmtPct(stats!.agreement_rate)}
                  color={stats!.agreement_rate >= 80 ? '#16C784' : '#F59E0B'} T={T}
                  sub={`${stats!.agreement_count} / ${stats!.total_predictions} events`} />
              </div>
            )}
          </div>

          {/* ── Agreement Analysis ───────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-5">
              <BarChart2 size={15} style={{ color: '#16C784' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>Agreement Analysis</h2>
            </div>

            {!hasData ? (
              <p className="text-sm" style={{ color: T.textDim }}>No predictions yet.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Prediction distribution */}
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>
                    ML Prediction Distribution
                  </p>
                  <div className="space-y-2.5">
                    {([
                      { key: 'confirmed_fraud', label: 'Confirmed Fraud', color: '#EF4444' },
                      { key: 'suspected_fraud', label: 'Suspected Fraud', color: '#F97316' },
                      { key: 'legitimate',      label: 'Legitimate',      color: '#16C784' },
                    ] as const).map(({ key, label, color }) => {
                      const d = stats!.prediction_distribution[key]
                      return (
                        <div key={key}>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
                            <span className="text-xs mono" style={{ color: T.text }}>
                              {d.count.toLocaleString()} <span style={{ color: T.textDim }}>({d.pct}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
                            <div className="h-full rounded-full"
                              style={{ width: `${d.pct}%`, background: color, opacity: 0.85 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${T.border}` }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>
                      Disagreement Breakdown
                    </p>
                    <div className="space-y-2">
                      {[
                        { label: 'ML caught fraud (engine missed)', count: stats!.disagreement_types.ml_caught_fraud, color: '#F59E0B' },
                        { label: 'ML missed fraud (engine blocked)', count: stats!.disagreement_types.ml_missed_fraud, color: '#EF4444' },
                        { label: 'Review zone mismatch',            count: stats!.disagreement_types.review_mismatch, color: '#94A3B8' },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="flex justify-between items-center rounded-lg px-3 py-2"
                          style={{ background: T.deep }}>
                          <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
                          <span className="text-xs font-bold mono" style={{ color }}>{count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recent disagreements table */}
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>
                    Recent Disagreements
                  </p>
                  {stats!.recent_disagreements.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl p-4"
                      style={{ background: '#16C78408', border: '1px solid #16C78420' }}>
                      <CheckCircle2 size={13} style={{ color: '#16C784' }} />
                      <span className="text-xs" style={{ color: T.textDim }}>
                        No disagreements in this period — engine and ML are aligned.
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr style={{ background: T.deep }}>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: T.textDim }}>Engine</th>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: T.textDim }}>ML Pred.</th>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: T.textDim }}>Prob.</th>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: T.textDim }}>Conf.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats!.recent_disagreements.slice(0, 12).map((d, i) => (
                            <tr key={i}
                              style={{ borderTop: `1px solid ${T.border}`, background: i % 2 === 0 ? 'transparent' : `${T.deep}80` }}>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{ background: `${engineColor(d.engine_decision)}15`, color: engineColor(d.engine_decision) }}>
                                  {d.engine_decision ?? '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{ background: `${labelColor(d.predicted_label)}15`, color: labelColor(d.predicted_label) }}>
                                  {d.predicted_label.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="px-3 py-2 mono" style={{ color: T.text }}>
                                {(d.fraud_probability * 100).toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 mono" style={{ color: T.textDim }}>
                                {(d.confidence * 100).toFixed(0)}%
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

          {/* ── Prediction Coverage ──────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-5">
              <Eye size={15} style={{ color: '#F59E0B' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>Prediction Coverage</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 space-y-3">
                <PBar
                  label="Prediction Coverage"
                  value={stats?.prediction_coverage_pct ?? 0}
                  max={100}
                  color={stats && stats.prediction_coverage_pct >= 95 ? '#16C784' : '#A78BFA'}
                  T={T}
                />
                <PBar
                  label="Agreement Rate"
                  value={stats?.agreement_rate ?? 0}
                  max={100}
                  color={stats && stats.agreement_rate >= 80 ? '#16C784' : '#F59E0B'}
                  T={T}
                />
                <PBar
                  label="Labeled Coverage"
                  value={stats && stats.total_predictions > 0
                    ? Math.round((stats.labeled_count / stats.total_predictions) * 1000) / 10
                    : 0}
                  max={100}
                  color="#38BDF8"
                  T={T}
                />
              </div>

              <div className="lg:col-span-2 rounded-xl p-4" style={{ background: T.deep, border: `1px solid ${T.border}` }}>
                <p className="text-xs font-semibold mb-3" style={{ color: T.textDim }}>Coverage Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total Events',       value: fmtK(stats?.total_events_period ?? 0),     color: T.text },
                    { label: 'With Predictions',   value: fmtK(stats?.total_predictions ?? 0),       color: '#A78BFA' },
                    { label: 'With Labels',        value: fmtK(stats?.labeled_count ?? 0),            color: '#38BDF8' },
                    { label: 'Disagreements',      value: fmtK(stats?.disagreement_count ?? 0),       color: '#F59E0B' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-lg p-3" style={{ background: T.card }}>
                      <p className="text-[10px] mb-1" style={{ color: T.textDim }}>{label}</p>
                      <p className="text-lg font-bold mono" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] mt-3" style={{ color: T.textDim }}>
                  Period: last {stats?.period_days ?? 30} days ·{' '}
                  Model: {stats?.model_version ?? 'shadow-v1'} ·{' '}
                  Updated: {stats ? new Date(stats.generated_at).toLocaleTimeString() : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Feature Importance ───────────────────────────────────────── */}
          {stats && stats.feature_importance.length > 0 && (
            <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
              <div className="flex items-center gap-2.5 mb-5">
                <TrendingUp size={15} style={{ color: '#A78BFA' }} />
                <h2 className="text-sm font-bold" style={{ color: T.text }}>Feature Importance</h2>
                <span className="text-[10px] mono px-2 py-0.5 rounded-full"
                  style={{ background: T.deep, color: T.textDim }}>
                  {stats.model_version}
                </span>
              </div>

              <div className="space-y-2.5">
                {stats.feature_importance.map(f => (
                  <div key={f.feature_name}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs mono" style={{ color: T.textSec }}>{f.feature_name}</span>
                      <span className="text-xs mono font-semibold" style={{ color: T.text }}>
                        {(f.importance_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${f.importance_score * 100}%`, background: '#A78BFA', opacity: 0.8 }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] mt-3" style={{ color: T.textDim }}>
                Weights reflect the mock shadow-v1 model formula. Real model weights will replace these after Phase 3.8.
              </p>
            </div>
          )}

          {/* ── Dataset Health ───────────────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2.5 mb-4">
              <Layers size={15} style={{ color: '#16C784' }} />
              <h2 className="text-sm font-bold" style={{ color: T.text }}>Dataset Health</h2>
            </div>
            <div className="rounded-xl p-4 flex items-start gap-3"
              style={{ background: '#16C78408', border: '1px solid #16C78420' }}>
              <Shield size={13} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: T.text }}>
                  Training Dataset → Analytics for full health metrics
                </p>
                <p className="text-xs mt-1" style={{ color: T.textDim }}>
                  View label distribution, dataset coverage, readiness score, and balance warnings in the{' '}
                  <a href="/dashboard/analytics" className="underline" style={{ color: '#16C784' }}>Analytics</a>
                  {' '}page → Training Dataset section.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                {
                  label: 'Training Ready',
                  value: stats && stats.prediction_coverage_pct >= 95 && stats.agreement_rate >= 80
                    ? 'Yes' : 'Not yet',
                  color: stats && stats.prediction_coverage_pct >= 95 && stats.agreement_rate >= 80
                    ? '#16C784' : '#94A3B8',
                },
                { label: 'Model Version',  value: stats?.model_version ?? '—',  color: '#A78BFA' },
                { label: 'Next Phase',     value: '3.8 Hybrid Engine',          color: T.textSec },
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
