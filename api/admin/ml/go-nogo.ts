/**
 * GET /api/admin/ml/go-nogo
 *
 * Phase 4.0 — ML Supervised Training Go/No-Go Decision
 *
 * Aggregates all ML readiness signals and returns a definitive binary
 * decision: can the org activate its first supervised ML model?
 *
 * Hard blockers (any → NO-GO):
 *   1. readiness_score < 70
 *   2. confirmed_fraud_labels < 50
 *   3. label_balance — a single class > 90% of all labels
 *   4. total_labels < 500
 *
 * Soft warnings (do not block, but reduce confidence):
 *   5. feature_coverage < 50%
 *   6. shadow agreement_rate < 80% (if shadow enabled)
 *   7. label_coverage < 5%
 *
 * Response:
 *   decision           — 'GO' | 'NO-GO'
 *   readiness_score    — 0–100
 *   classification     — 'Not Ready' | 'Early Training' | 'Ready for Shadow Training' | 'Production Ready'
 *   blockers[]         — hard blockers preventing activation
 *   warnings[]         — soft warnings to address before production
 *   passed_checks[]    — criteria that pass
 *   confidence         — 'high' | 'medium' | 'low' (based on data volume)
 *   criteria_detail    — raw numbers for each check
 *
 * Auth: Bearer <supabase_access_token> (user JWT)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey     = process.env.VITE_SUPABASE_ANON_KEY ?? ''

function userClient(token: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const GATES = {
  min_readiness_score:    70,
  min_total_labels:      500,
  min_confirmed_fraud:    50,
  max_class_dominance:  0.90,   // no class > 90% of labels
  min_feature_coverage: 0.50,   // 50% of events have features
  min_agreement_rate:   0.80,   // shadow model agreement
  min_label_coverage:   0.05,   // 5% of events labeled
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Missing authorization' })

  const userSupa = userClient(token)
  const { data: { user }, error: authErr } = await userSupa.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await userSupa
    .from('profiles')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })

  const orgId = profile.organization_id as string
  const supa  = createClient(supabaseUrl, serviceKey)

  // ── Parallel fetches ──────────────────────────────────────────────────────
  const [labelsRes, eventsRes, featuresRes, predsRes] = await Promise.allSettled([
    supa.from('fraud_labels')
      .select('label, risk_event_id')
      .eq('organization_id', orgId)
      .limit(50_000),

    supa.from('risk_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),

    supa.from('fraud_features')
      .select('risk_event_id', { count: 'exact', head: true })
      .eq('organization_id', orgId),

    supa.from('ml_predictions')
      .select('agreement')
      .eq('organization_id', orgId)
      .limit(20_000),
  ])

  // ── Process labels ────────────────────────────────────────────────────────
  const labelsRaw = labelsRes.status === 'fulfilled' && !labelsRes.value.error
    ? (labelsRes.value.data ?? []) as Array<{ label: string; risk_event_id: string }>
    : []

  const labelMap = new Map<string, string>()
  for (const l of labelsRaw) labelMap.set(l.risk_event_id, l.label)
  const uniqueLabels = [...labelMap.values()]
  const totalLabels  = uniqueLabels.length

  const labelCounts = {
    confirmed_fraud:  uniqueLabels.filter(l => l === 'confirmed_fraud').length,
    suspected_fraud:  uniqueLabels.filter(l => l === 'suspected_fraud').length,
    false_positive:   uniqueLabels.filter(l => l === 'false_positive').length,
    legitimate:       uniqueLabels.filter(l => l === 'legitimate').length,
  }

  const maxClassCount = totalLabels > 0 ? Math.max(...Object.values(labelCounts)) : 0
  const maxDominance  = totalLabels > 0 ? maxClassCount / totalLabels : 1

  // ── Other metrics ─────────────────────────────────────────────────────────
  const totalEvents   = eventsRes.status === 'fulfilled' ? (eventsRes.value.count ?? 0) : 0
  const labeledEvents = labelMap.size
  const labelCoverage = totalEvents > 0 ? labeledEvents / totalEvents : 0

  const featuresCount    = featuresRes.status === 'fulfilled' && !('error' in featuresRes.value && featuresRes.value.error)
    ? (featuresRes.value.count ?? 0)
    : 0
  const featureCoverage  = totalEvents > 0 ? Math.min(featuresCount / totalEvents, 1) : 0

  const predsData      = predsRes.status === 'fulfilled' && !('error' in predsRes.value && predsRes.value.error)
    ? (predsRes.value.data ?? []) as Array<{ agreement: boolean | null }>
    : []
  const totalPreds     = predsData.length
  const agreeCount     = predsData.filter(p => p.agreement === true).length
  const agreementRate  = totalPreds > 0 ? agreeCount / totalPreds : null

  // ── ML Readiness Score (5-criteria formula from readiness.ts) ─────────────
  const labelProgress   = Math.min(totalLabels / 10_000, 1)
  const fraudProgress   = Math.min(labelCounts.confirmed_fraud / 500, 1)
  const volumeScore     = Math.round((labelProgress * 0.60 + fraudProgress * 0.40) * 25)
  const qualityScore    = Math.round((Math.min(featureCoverage / 0.80, 1) * 0.70 + (labelCounts.confirmed_fraud > 0 ? 1 : 0) * 0.30) * 25)
  const balanceRaw      = maxDominance > 0.90 ? 0.3 : maxDominance > 0.80 ? 0.6 : 1.0
  const balanceScore    = Math.round((labelCounts.confirmed_fraud === 0 ? balanceRaw * 0.4 : balanceRaw) * 20)
  const covScore        = Math.round(Math.min(labelCoverage / 0.10, 1) * 15)
  const consScore       = Math.round((agreementRate !== null ? Math.min(agreementRate / 0.80, 1) : 0.5) * 15)
  const readinessScore  = Math.min(100, volumeScore + qualityScore + balanceScore + covScore + consScore)

  const classify = (s: number) => {
    if (s >= 90) return 'Production Ready'
    if (s >= 70) return 'Ready for Shadow Training'
    if (s >= 40) return 'Early Training'
    return 'Not Ready'
  }

  // ── Gate checks ───────────────────────────────────────────────────────────
  const blockers:  string[] = []
  const warnings:  string[] = []
  const passed:    string[] = []

  // Hard Gate 1: Readiness Score
  if (readinessScore < GATES.min_readiness_score) {
    blockers.push(`ML Readiness Score too low: ${readinessScore}/100 (need ≥${GATES.min_readiness_score})`)
  } else {
    passed.push(`ML Readiness Score: ${readinessScore}/100 ✓`)
  }

  // Hard Gate 2: Total Labels
  if (totalLabels < GATES.min_total_labels) {
    blockers.push(`Insufficient labels: ${totalLabels} (need ≥${GATES.min_total_labels.toLocaleString()})`)
  } else {
    passed.push(`Total labels: ${totalLabels.toLocaleString()} ✓`)
  }

  // Hard Gate 3: Confirmed Fraud Labels
  if (labelCounts.confirmed_fraud < GATES.min_confirmed_fraud) {
    blockers.push(`Insufficient confirmed_fraud labels: ${labelCounts.confirmed_fraud} (need ≥${GATES.min_confirmed_fraud})`)
  } else {
    passed.push(`Confirmed fraud labels: ${labelCounts.confirmed_fraud} ✓`)
  }

  // Hard Gate 4: Class Balance
  if (totalLabels > 0 && maxDominance > GATES.max_class_dominance) {
    const dominant = Object.entries(labelCounts).find(([, v]) => v === maxClassCount)?.[0] ?? '?'
    blockers.push(`Class imbalance: "${dominant}" = ${Math.round(maxDominance * 100)}% of all labels (max ${Math.round(GATES.max_class_dominance * 100)}%)`)
  } else if (totalLabels > 0) {
    passed.push(`Label balance: no class dominates above ${Math.round(GATES.max_class_dominance * 100)}% ✓`)
  }

  // Soft Warning 5: Feature Coverage
  if (featureCoverage < GATES.min_feature_coverage) {
    warnings.push(`Feature coverage: ${Math.round(featureCoverage * 100)}% (target ≥${Math.round(GATES.min_feature_coverage * 100)}%) — enable FEATURE_STORE_ENABLED=true`)
  } else {
    passed.push(`Feature coverage: ${Math.round(featureCoverage * 100)}% ✓`)
  }

  // Soft Warning 6: Shadow Agreement
  if (agreementRate === null) {
    warnings.push('Shadow ML not enabled — set ML_SHADOW_ENABLED=true to collect agreement data')
  } else if (agreementRate < GATES.min_agreement_rate) {
    warnings.push(`Shadow agreement: ${Math.round(agreementRate * 100)}% (target ≥${Math.round(GATES.min_agreement_rate * 100)}%) — shadow model needs calibration`)
  } else {
    passed.push(`Shadow agreement: ${Math.round(agreementRate * 100)}% ✓`)
  }

  // Soft Warning 7: Label Coverage
  if (labelCoverage < GATES.min_label_coverage) {
    warnings.push(`Label coverage: ${Math.round(labelCoverage * 100)}% of events labeled (target ≥${Math.round(GATES.min_label_coverage * 100)}%)`)
  } else {
    passed.push(`Label coverage: ${Math.round(labelCoverage * 100)}% ✓`)
  }

  const decision = blockers.length === 0 ? 'GO' : 'NO-GO'

  // Confidence: how much data backs this decision
  const confidence = totalLabels >= 5000 ? 'high' : totalLabels >= 500 ? 'medium' : 'low'

  // ── Justification text ────────────────────────────────────────────────────
  const justification = decision === 'GO'
    ? `All ${4} hard gates passed with ${readinessScore}/100 readiness score. ` +
      `${totalLabels.toLocaleString()} labels collected across ${totalEvents.toLocaleString()} events ` +
      `with ${labelCounts.confirmed_fraud} confirmed fraud cases. ` +
      `The system is ready for supervised shadow training.`
    : `${blockers.length} hard gate(s) failed. ` +
      blockers.map(b => b.replace(/✓/, '')).join(' | ')

  return res.status(200).json({
    decision,
    readiness_score:  readinessScore,
    classification:   classify(readinessScore),
    confidence,
    justification,
    blockers,
    warnings,
    passed_checks:    passed,
    criteria_detail: {
      total_labels:         totalLabels,
      confirmed_fraud:      labelCounts.confirmed_fraud,
      suspected_fraud:      labelCounts.suspected_fraud,
      false_positive:       labelCounts.false_positive,
      legitimate:           labelCounts.legitimate,
      total_events:         totalEvents,
      labeled_events:       labeledEvents,
      label_coverage_pct:   Math.round(labelCoverage * 1000) / 10,
      feature_coverage_pct: Math.round(featureCoverage * 1000) / 10,
      shadow_enabled:       totalPreds > 0,
      agreement_rate_pct:   agreementRate !== null ? Math.round(agreementRate * 1000) / 10 : null,
      max_class_dominance_pct: Math.round(maxDominance * 1000) / 10,
    },
    gates: {
      readiness_score:  { required: GATES.min_readiness_score,  actual: readinessScore,  passed: readinessScore >= GATES.min_readiness_score },
      total_labels:     { required: GATES.min_total_labels,     actual: totalLabels,      passed: totalLabels >= GATES.min_total_labels },
      confirmed_fraud:  { required: GATES.min_confirmed_fraud,  actual: labelCounts.confirmed_fraud, passed: labelCounts.confirmed_fraud >= GATES.min_confirmed_fraud },
      class_balance:    { required: `≤${Math.round(GATES.max_class_dominance * 100)}%`, actual: `${Math.round(maxDominance * 100)}%`, passed: maxDominance <= GATES.max_class_dominance || totalLabels === 0 },
    },
    generated_at: new Date().toISOString(),
  })
}
