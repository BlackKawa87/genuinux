/**
 * GET /api/admin/intelligence/ml/stats?days=30
 *
 * ML Shadow Mode analytics — Phase 3.7 Modules 4–6.
 *
 * Returns:
 *   - prediction coverage (predictions / total events in period)
 *   - agreement rate (ML prediction vs engine decision)
 *   - prediction distribution (confirmed_fraud / suspected_fraud / legitimate)
 *   - performance vs ground-truth labels (accuracy, precision, recall, FP, FN)
 *   - disagreement breakdown (ML caught fraud / ML missed fraud / review mismatch)
 *   - recent disagreements sample (last 20)
 *   - feature importance for active model
 *   - readiness status
 *
 * Auth: Authorization: Bearer <supabase_access_token> (user JWT)
 * Gracefully returns zeroed response if v22 migration not yet applied.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ML_MODEL_VERSION } from '../../../_lib/mlShadowRunner.js'

// ─── Clients ─────────────────────────────────────────────────────────────────

function userClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PredRow {
  risk_event_id:     string
  fraud_probability: number
  predicted_label:   string
  confidence:        number
  engine_decision:   string | null
  created_at:        string
}

interface LabelRow {
  risk_event_id: string
  label:         string
}

interface FeatImportanceRow {
  feature_name:    string
  importance_score: number
}

// ─── Agreement ────────────────────────────────────────────────────────────────

function isAgreement(engineDecision: string | null, predictedLabel: string): boolean {
  if (!engineDecision) return false
  if (engineDecision === 'allow'  && predictedLabel === 'legitimate')      return true
  if (engineDecision === 'block'  && predictedLabel === 'confirmed_fraud') return true
  if (engineDecision === 'review' && predictedLabel === 'suspected_fraud') return true
  return false
}

// ─── Performance vs labels ────────────────────────────────────────────────────

function computePerformance(
  predictions: PredRow[],
  labels:      LabelRow[],
): {
  labeled_count: number
  accuracy: number; precision: number; recall: number
  false_positive_rate: number; false_negative_rate: number
} {
  const labelMap = new Map<string, string>()
  for (const l of labels) labelMap.set(l.risk_event_id, l.label)

  let tp = 0, tn = 0, fp = 0, fn = 0

  for (const p of predictions) {
    const groundTruth = labelMap.get(p.risk_event_id)
    if (!groundTruth) continue

    const isActualFraud = groundTruth === 'confirmed_fraud' || groundTruth === 'suspected_fraud'
    const isPredFraud   = p.predicted_label === 'confirmed_fraud' || p.predicted_label === 'suspected_fraud'

    if (isPredFraud  && isActualFraud)  tp++
    else if (!isPredFraud && !isActualFraud) tn++
    else if (isPredFraud  && !isActualFraud) fp++
    else                                     fn++
  }

  const total = tp + tn + fp + fn
  const pct   = (n: number): number => total === 0 ? 0 : Math.round((n / total) * 1000) / 10

  return {
    labeled_count:       total,
    accuracy:            pct(tp + tn),
    precision:           tp + fp === 0 ? 0 : Math.round((tp / (tp + fp)) * 1000) / 10,
    recall:              tp + fn === 0 ? 0 : Math.round((tp / (tp + fn)) * 1000) / 10,
    false_positive_rate: pct(fp),
    false_negative_rate: pct(fn),
  }
}

// ─── Readiness ────────────────────────────────────────────────────────────────

function readinessStatus(
  total: number,
  coveragePct: number,
  agreementRate: number,
): { status: string; score: number } {
  if (total === 0) return { status: 'Not Ready', score: 0 }

  // Score = average of coverage progress (70% weight) + agreement quality (30% weight)
  const covScore  = Math.min(coveragePct / 100, 1) * 70
  const agreeScore = Math.min(agreementRate / 100, 1) * 30
  const score     = Math.round(covScore + agreeScore)

  let status: string
  if (agreementRate >= 80 && coveragePct >= 95) status = 'Ready for Hybrid Engine'
  else if (coveragePct >= 70)                    status = 'Shadow Running'
  else if (coveragePct >= 20)                    status = 'Evaluating'
  else if (total > 0)                            status = 'Training'
  else                                           status = 'Not Ready'

  return { status, score }
}

// ─── Zero response ────────────────────────────────────────────────────────────

function zeroResponse(notice: string) {
  return {
    total_predictions: 0, total_events_period: 0, prediction_coverage_pct: 0,
    agreement_count: 0, disagreement_count: 0, agreement_rate: 0,
    prediction_distribution: {
      confirmed_fraud: { count: 0, pct: 0 },
      suspected_fraud: { count: 0, pct: 0 },
      legitimate:      { count: 0, pct: 0 },
    },
    labeled_count: 0, accuracy: 0, precision: 0, recall: 0,
    false_positive_rate: 0, false_negative_rate: 0,
    disagreement_types: { ml_caught_fraud: 0, ml_missed_fraud: 0, review_mismatch: 0 },
    recent_disagreements: [],
    feature_importance: [],
    model_version: ML_MODEL_VERSION,
    readiness_status: 'Not Ready',
    readiness_score: 0,
    period_days: 30,
    generated_at: new Date().toISOString(),
    notice,
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] as string | undefined
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization' })
  const token = authHeader.slice(7).trim()

  const userSupa = userClient(token)
  const { data: { user }, error: authErr } = await userSupa.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await userSupa.from('profiles').select('organization_id').eq('id', user.id).single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })
  const orgId = profile.organization_id

  const days  = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const supa = adminClient()

  // ── Fetch predictions ─────────────────────────────────────────────────────
  const { data: predData, error: predErr } = await supa
    .from('ml_predictions')
    .select('risk_event_id, fraud_probability, predicted_label, confidence, engine_decision, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20_000)

  if (predErr) {
    if (predErr.code === '42P01') {
      return res.status(200).json(zeroResponse('ml_predictions table not found — apply v22_ml_shadow.sql migration and set ML_SHADOW_ENABLED=true.'))
    }
    return res.status(500).json({ error: 'ML stats query failed', details: predErr.message })
  }

  const predictions = (predData ?? []) as PredRow[]
  const total       = predictions.length

  if (total === 0) {
    const { count: evCount } = await supa
      .from('risk_events').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).gte('created_at', since)
    return res.status(200).json({
      ...zeroResponse(''),
      total_events_period: evCount ?? 0,
      notice: undefined,
    })
  }

  // ── Parallel: total events + labels + feature importance ──────────────────
  const [evRes, labelRes, featRes] = await Promise.all([
    supa.from('risk_events').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).gte('created_at', since),
    supa.from('fraud_labels').select('risk_event_id, label')
        .eq('organization_id', orgId).gte('created_at', since).limit(10_000),
    supa.from('feature_importance').select('feature_name, importance_score')
        .eq('model_version', ML_MODEL_VERSION).order('importance_score', { ascending: false }),
  ])

  const totalEvents = evRes.count ?? 0
  const labels      = (labelRes.data ?? []) as LabelRow[]
  const featImport  = (featRes.data ?? []) as FeatImportanceRow[]

  // ── Coverage ──────────────────────────────────────────────────────────────
  const predCoveragePct = totalEvents === 0 ? 0
    : Math.round((total / totalEvents) * 1000) / 10

  // ── Agreement ─────────────────────────────────────────────────────────────
  let agreeCnt = 0
  let mlCaughtFraud = 0, mlMissedFraud = 0, reviewMismatch = 0
  const disagreements: PredRow[] = []

  for (const p of predictions) {
    if (isAgreement(p.engine_decision, p.predicted_label)) {
      agreeCnt++
    } else {
      if (p.engine_decision === 'allow' && p.predicted_label !== 'legitimate') mlCaughtFraud++
      else if (p.engine_decision === 'block' && p.predicted_label === 'legitimate') mlMissedFraud++
      else reviewMismatch++
      disagreements.push(p)
    }
  }

  const disagreeCnt   = total - agreeCnt
  const agreementRate = total === 0 ? 0 : Math.round((agreeCnt / total) * 1000) / 10

  // ── Prediction distribution ───────────────────────────────────────────────
  let cf = 0, sf = 0, lg = 0
  for (const p of predictions) {
    if (p.predicted_label === 'confirmed_fraud') cf++
    else if (p.predicted_label === 'suspected_fraud') sf++
    else lg++
  }
  const distPct = (n: number) => total === 0 ? 0 : Math.round((n / total) * 1000) / 10

  // ── Performance vs labels ─────────────────────────────────────────────────
  const perf = computePerformance(predictions, labels)

  // ── Readiness ─────────────────────────────────────────────────────────────
  const { status: readinessStatus_, score: readinessScore } = readinessStatus(total, predCoveragePct, agreementRate)

  return res.status(200).json({
    total_predictions:       total,
    total_events_period:     totalEvents,
    prediction_coverage_pct: predCoveragePct,
    agreement_count:         agreeCnt,
    disagreement_count:      disagreeCnt,
    agreement_rate:          agreementRate,
    prediction_distribution: {
      confirmed_fraud: { count: cf, pct: distPct(cf) },
      suspected_fraud: { count: sf, pct: distPct(sf) },
      legitimate:      { count: lg, pct: distPct(lg) },
    },
    ...perf,
    disagreement_types: {
      ml_caught_fraud: mlCaughtFraud,
      ml_missed_fraud: mlMissedFraud,
      review_mismatch: reviewMismatch,
    },
    recent_disagreements: disagreements.slice(0, 20).map(p => ({
      risk_event_id:     p.risk_event_id,
      engine_decision:   p.engine_decision,
      predicted_label:   p.predicted_label,
      fraud_probability: p.fraud_probability,
      confidence:        p.confidence,
      created_at:        p.created_at,
    })),
    feature_importance:   featImport,
    model_version:        ML_MODEL_VERSION,
    readiness_status:     readinessStatus_,
    readiness_score:      readinessScore,
    period_days:          days,
    generated_at:         new Date().toISOString(),
  })
}
