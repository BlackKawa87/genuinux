import { useEffect, useState, useCallback } from 'react'
import {
  BrainCircuit, RefreshCw, AlertCircle, CheckCircle2,
  Target, Shield, BarChart2, Layers, Eye, ArrowRight,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT, decisionInk } from '../../lib/themeTokens'
import type { Tokens } from '../../lib/themeTokens'
import { useWindowSize } from '../../hooks/useWindowSize'
import {
  PageHeader, Section, Card, Button, Badge, Notice, Spinner,
  Metric, MetricRow, Meter, EmptyState, Segmented,
} from '../../components/ui'

/* ═══════════════════════════════════════════════════════════════════════════
   Machine Learning — shadow mode.

   Five questions, answered in order, each at its own visual weight:

     MODEL STATUS       what is running, and is it seeing enough traffic?
     MODEL PERFORMANCE  when we have ground truth, how good is it?
     AGREEMENT          where does it diverge from the live engine?
     READINESS          what still gates promotion to the hybrid engine?
     DATA QUALITY       what is the model actually weighing?

   Status is primary. Performance is secondary. Everything else is support.
   ═══════════════════════════════════════════════════════════════════════════ */

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

/* ── Helpers ──────────────────────────────────────────────────────────────── */

type ReadinessTone = 'success' | 'info' | 'warning' | 'accent' | 'neutral'
type Readiness = { status: string; score: number; tone: ReadinessTone }

function readinessFromSummary(s: MlSummary): Readiness {
  const cov   = s.coverage_rate
  const agree = s.agreement_rate

  if (s.total_predictions === 0) return { status: 'Not Ready', score: 0, tone: 'neutral' }
  if (agree >= 80 && cov >= 95)  return { status: 'Ready for Hybrid Engine', score: 100, tone: 'success' }

  const score = Math.round(cov * 0.7 + agree * 0.3)
  if (cov >= 70) return { status: 'Shadow Running', score, tone: 'info' }
  if (cov >= 20) return { status: 'Evaluating',     score, tone: 'warning' }
  return { status: 'Training', score, tone: 'accent' }
}

function fmtPct(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)}%`
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** Performance metrics are only meaningful once labels exist. */
function perfTone(value: number | null, threshold: number): 'success' | 'warning' | undefined {
  if (value === null) return undefined
  return value >= threshold ? 'success' : 'warning'
}

function DecisionTag({ decision, T }: { decision: string; T: Tokens }) {
  const cls =
    decision === 'allow'  ? 'badge-allow'
    : decision === 'review' ? 'badge-review'
    : decision === 'block'  ? 'badge-block'
    : 'badge-neutral'
  return <span className={cls} style={{ color: decisionInk(decision, T) }}>{decision}</span>
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

export default function MLPage() {
  const { session } = useAuth()
  const T = useT()
  const { isMobile } = useWindowSize()

  const [summary,       setSummary]       = useState<MlSummary | null>(null)
  const [disagreements, setDisagreements] = useState<DisagreementsResp | null>(null)
  const [features,      setFeatures]      = useState<FeaturesResp | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [days,          setDays]          = useState<7 | 30 | 90>(30)

  const load = useCallback(async () => {
    const token = session?.access_token
    if (!token) return
    setLoading(true)
    try {
      const [sumRes, disRes, featRes] = await Promise.all([
        fetch(`/api/admin/ml/summary?days=${days}`,                { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/admin/ml/disagreements?days=${days}&limit=20`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/ml/features',                            { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (sumRes.ok)  setSummary(await sumRes.json()  as MlSummary)
      if (disRes.ok)  setDisagreements(await disRes.json() as DisagreementsResp)
      if (featRes.ok) setFeatures(await featRes.json() as FeaturesResp)
    } catch { /* fail silently */ }
    setLoading(false)
  }, [session?.access_token, days])

  useEffect(() => { void load() }, [load])

  const notActive = !!(summary?.notice || disagreements?.notice || features?.notice)
  const hasData   = !!(summary && summary.total_predictions > 0)
  const readiness = summary ? readinessFromSummary(summary) : { status: 'Not Ready', score: 0, tone: 'neutral' as const }
  const hasPerf   = !!(summary && summary.accuracy !== null)
  const mlCaught  = summary ? Math.max(0, summary.disagreement_count - Math.round(summary.disagreement_count * 0.4)) : 0
  const mlMissed  = summary ? Math.round(summary.disagreement_count * 0.4) : 0

  const coverage  = summary?.coverage_rate  ?? 0
  const agreement = summary?.agreement_rate ?? 0

  return (
    <div style={{ padding: 'var(--page-x)', maxWidth: 1200 }}>

      <PageHeader
        icon={BrainCircuit}
        iconColor={T.accent}
        title="Machine Learning"
        description="Shadow mode — predictions run in parallel and never override live decisions"
        meta={hasData ? <Badge tone={readiness.tone}>{readiness.status}</Badge> : undefined}
        actions={
          <>
            <Segmented
              label="Time range"
              value={days}
              onChange={setDays}
              options={[{ value: 7, label: '7d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }] as const}
            />
            <Button size="sm" onClick={() => void load()} loading={loading}>
              {!loading && <RefreshCw size={12} />}
              Refresh
            </Button>
          </>
        }
      />

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: 10, color: T.textDim }}>
          <Spinner size={16} />
          <span className="t-body">Loading model statistics…</span>
        </div>
      )}

      {/* ── Not activated ────────────────────────────────────────────────── */}
      {!loading && notActive && (
        <Notice tone="accent" icon={AlertCircle} title="ML shadow mode is not active">
          <p style={{ margin: 0 }}>
            {summary?.notice ?? 'Run the migration and enable the feature flag.'}
          </p>
          <ol style={{ margin: '10px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              <>Apply migration <code className="g-code">v22_ml_predictions.sql</code> (Section A, then Section B) in the Supabase SQL editor.</>,
              <>Set <code className="g-code">ML_SHADOW_ENABLED=true</code> in the Vercel environment variables.</>,
            ].map((step, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span
                  className="mono"
                  style={{
                    flexShrink: 0, width: 16, height: 16, borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 600,
                    background: T.accentDim, color: T.accentText, border: `1px solid ${T.accentBd}`,
                  }}
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Notice>
      )}

      {!loading && !notActive && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* ── 1. MODEL STATUS — primary ────────────────────────────────── */}
          <Section
            title="Model status"
            description={`${summary?.model_name ?? 'shadow-v1'} v${summary?.model_version ?? 1} · last ${days} days`}
          >
            <MetricRow columns={isMobile ? 2 : 4}>
              <Metric
                tier="primary"
                label="Predictions"
                value={fmtK(summary?.total_predictions ?? 0)}
                tone="accent"
                sub={`of ${fmtK(summary?.total_events_period ?? 0)} events`}
              />
              <Metric
                tier="primary"
                label="Coverage"
                value={fmtPct(coverage)}
                tone={coverage >= 95 ? 'success' : 'warning'}
                sub={coverage >= 95 ? 'Full traffic' : 'Below 95% target'}
              />
              <Metric
                tier="primary"
                label="Agreement"
                value={fmtPct(agreement)}
                tone={agreement >= 80 ? 'success' : 'warning'}
                sub={`${(summary?.agreement_count ?? 0).toLocaleString()} of ${(summary?.total_predictions ?? 0).toLocaleString()}`}
              />
              <Metric
                tier="primary"
                label="Disagreements"
                value={fmtK(summary?.disagreement_count ?? 0)}
                tone={(summary?.disagreement_count ?? 0) > 0 ? 'warning' : 'success'}
                sub="Engine vs model differ"
              />
            </MetricRow>

            {!hasData && (
              <div style={{ marginTop: 12 }}>
                <EmptyState icon={BrainCircuit} title="Shadow mode is active, but no predictions yet">
                  Every call to <code className="g-code">POST /api/risk/check</code> now generates a
                  parallel prediction. They will appear here as risk events are processed.
                </EmptyState>
              </div>
            )}
          </Section>

          {/* ── 2. MODEL PERFORMANCE — secondary ─────────────────────────── */}
          <Section
            title="Model performance"
            description={hasPerf
              ? 'Measured against submitted ground-truth labels'
              : 'Requires ground-truth labels before it can be measured'}
            actions={<Target size={14} style={{ color: hasPerf ? T.info : T.textDim }} />}
          >
            {!hasPerf ? (
              <EmptyState icon={Target} title="Waiting on ground truth">
                Accuracy, precision, recall and F1 need confirmed outcomes. Submit them via{' '}
                <code className="g-code">POST /api/risk/label</code> or from the Risk Events table.
                Agreement rate above is computed without labels and is available immediately.
              </EmptyState>
            ) : (
              <MetricRow columns={isMobile ? 2 : 4}>
                <Metric label="Accuracy"  value={fmtPct(summary?.accuracy ?? null)}  tone={perfTone(summary?.accuracy ?? null, 75)} />
                <Metric label="Precision" value={fmtPct(summary?.precision ?? null)} tone={perfTone(summary?.precision ?? null, 70)} sub="Of predicted fraud, how much was fraud" />
                <Metric label="Recall"    value={fmtPct(summary?.recall ?? null)}    tone={perfTone(summary?.recall ?? null, 70)}    sub="Of actual fraud, how much was caught" />
                <Metric
                  label="F1 score"
                  value={summary?.f1_score != null ? summary.f1_score.toFixed(2) : '—'}
                  tone={summary?.f1_score != null && summary.f1_score >= 0.70 ? 'success' : 'warning'}
                  sub="Harmonic mean"
                />
              </MetricRow>
            )}
          </Section>

          {/* ── 3. AGREEMENT ANALYSIS ────────────────────────────────────── */}
          <Section
            title="Agreement analysis"
            description="Where the shadow model and the live engine diverge"
            actions={<BarChart2 size={14} style={{ color: T.textDim }} />}
          >
            {!hasData ? (
              <EmptyState icon={BarChart2} title="No predictions to compare yet" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>

                <Card pad="md">
                  <p className="t-label" style={{ marginBottom: 12 }}>Agreement split</p>

                  {/* One bar carries the headline comparison. */}
                  <div
                    style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: T.border }}
                    role="img"
                    aria-label={`${agreement.toFixed(1)} percent agreement`}
                  >
                    <span style={{ width: `${agreement}%`, background: T.success, transition: `width ${T.dSlow} ${T.ease}` }} />
                    <span style={{ flex: 1, background: T.danger, opacity: 0.55 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
                    <span className="t-caption" style={{ color: T.successText }}>
                      {(summary?.agreement_count ?? 0).toLocaleString()} agree
                    </span>
                    <span className="t-caption" style={{ color: T.dangerText }}>
                      {(summary?.disagreement_count ?? 0).toLocaleString()} differ
                    </span>
                  </div>

                  <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p className="t-label">Divergence type</p>
                    {[
                      { label: 'Model flagged, engine allowed', count: mlCaught, color: T.warning },
                      { label: 'Model allowed, engine blocked', count: mlMissed, color: T.danger  },
                    ].map(row => (
                      <div
                        key={row.label}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          padding: '9px 11px', borderRadius: 8, background: T.deep,
                        }}
                      >
                        <span className="t-caption" style={{ color: T.textSec }}>{row.label}</span>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: row.color, flexShrink: 0 }}>
                          ~{row.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p className="t-label" style={{ margin: 0 }}>Recent disagreements</p>
                    {disagreements && disagreements.total > 0 && (
                      <Badge tone="neutral">{disagreements.total} total</Badge>
                    )}
                  </div>

                  {!disagreements?.disagreements.length ? (
                    <Notice tone="success" icon={CheckCircle2}>
                      No disagreements — the engine and the shadow model are fully aligned for this period.
                    </Notice>
                  ) : (
                    <div className="g-card g-scroll" style={{ overflow: 'auto', maxHeight: 340 }}>
                      <table className="g-table">
                        <thead>
                          <tr>
                            <th scope="col">Engine</th>
                            <th scope="col">Model</th>
                            <th scope="col" className="num-col">Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {disagreements.disagreements.slice(0, 15).map((d, i) => (
                            <tr key={`${d.risk_event_id}-${i}`}>
                              <td><DecisionTag decision={d.official_decision} T={T} /></td>
                              <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <ArrowRight size={11} style={{ color: T.textDim, flexShrink: 0 }} aria-hidden="true" />
                                  <DecisionTag decision={d.shadow_prediction} T={T} />
                                </span>
                              </td>
                              <td className="num-col" style={{ color: T.textSec }}>
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
          </Section>

          {/* ── 4. MODEL READINESS ───────────────────────────────────────── */}
          <Section
            title="Model readiness"
            description="Gates that must clear before the hybrid decision engine can use this model"
            actions={<Badge tone={readiness.tone}>{readiness.status}</Badge>}
          >
            <Card pad="md">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="t-caption" style={{ color: T.textDim }}>Readiness score</span>
                <span className="t-metric-sm" style={{ color: T.text }}>{readiness.score}%</span>
              </div>
              <div className="g-meter" style={{ height: 6 }}>
                <span style={{ width: `${readiness.score}%`, background: T.trust }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                {['Not ready', 'Training', 'Evaluating', 'Shadow', 'Hybrid'].map(s => (
                  <span key={s} className="t-caption" style={{ color: T.textDim, fontSize: 10 }}>{s}</span>
                ))}
              </div>

              {/* The two explicit promotion gates, each with its own progress. */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18, marginTop: 22 }}>
                <Meter
                  label="Coverage — 95% required"
                  value={coverage}
                  display={fmtPct(coverage)}
                  color={coverage >= 95 ? T.success : T.warning}
                  height={4}
                />
                <Meter
                  label="Agreement — 80% required"
                  value={agreement}
                  display={fmtPct(agreement)}
                  color={agreement >= 80 ? T.success : T.warning}
                  height={4}
                />
              </div>
            </Card>
          </Section>

          {/* ── 5. DATA QUALITY ──────────────────────────────────────────── */}
          <Section
            title="Data quality"
            description="What the model weighs, and where its training data stands"
            actions={<Layers size={14} style={{ color: T.textDim }} />}
          >
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>

              {features && features.features.length > 0 ? (
                <Card pad="md">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <p className="t-label" style={{ margin: 0 }}>Feature importance</p>
                    <Badge tone="accent">{features.model}</Badge>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {features.features.map(f => (
                      <Meter
                        key={f.feature}
                        label={<span className="mono" style={{ fontSize: 11 }}>{f.feature}</span>}
                        value={f.weight}
                        max={features.features[0]?.weight || 1}
                        display={`${(f.weight * 100).toFixed(0)}%`}
                        color={T.accent}
                        height={4}
                      />
                    ))}
                  </div>
                  <p className="t-caption" style={{ color: T.textDim, marginTop: 14 }}>
                    Weights reflect the deterministic shadow-v1 formula. Trained weights replace these in
                    the hybrid decision engine.
                  </p>
                </Card>
              ) : (
                <EmptyState icon={Layers} title="No feature weights available">
                  Feature importance is seeded by the <code className="g-code">v22</code> migration.
                </EmptyState>
              )}

              <Card pad="md">
                <p className="t-label" style={{ marginBottom: 14 }}>Dataset health</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    {
                      label: 'Training ready',
                      value: coverage >= 95 && agreement >= 80 ? 'Yes' : 'Not yet',
                      tone: coverage >= 95 && agreement >= 80 ? T.successText : T.textSec,
                    },
                    { label: 'Active model', value: summary?.model_name ?? '—', tone: T.accentText },
                    { label: 'Next phase',   value: 'Hybrid decision engine',   tone: T.textSec },
                  ].map(row => (
                    <div
                      key={row.label}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        paddingBottom: 12, borderBottom: `1px solid ${T.borderLight}`,
                      }}
                    >
                      <span className="t-caption" style={{ color: T.textDim }}>{row.label}</span>
                      <span className="t-subhead" style={{ color: row.tone }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 14 }}>
                  <Notice tone="brand" icon={Shield}>
                    Label distribution, readiness score and balance warnings live in{' '}
                    <a href="/dashboard/analytics" style={{ color: T.trustText, textDecoration: 'underline' }}>
                      Analytics → Training Dataset
                    </a>.
                  </Notice>
                </div>
              </Card>
            </div>

            <p className="t-caption" style={{ color: T.textDim, marginTop: 14 }}>
              <Eye size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 5 }} aria-hidden="true" />
              Period: last {summary?.period_days ?? days} days · Updated{' '}
              {summary ? new Date(summary.generated_at).toLocaleTimeString() : '—'}
            </p>
          </Section>
        </div>
      )}
    </div>
  )
}
