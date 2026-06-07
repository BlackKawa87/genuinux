/**
 * GET /api/admin/ml/readiness?days=30
 *
 * Phase 4.0 — ML Readiness Score (0–100)
 *
 * Computes a weighted readiness score across 5 independent criteria:
 *   Volume       (25%) — label count toward training target
 *   Quality      (25%) — feature coverage + confirmed fraud presence
 *   Balance      (20%) — label class distribution health
 *   Coverage     (15%) — labeled events / total events
 *   Consistency  (15%) — shadow model agreement rate
 *
 * Classification:
 *    0–39  Not Ready
 *   40–69  Early Training
 *   70–89  Ready for Shadow Training
 *   90–100 Production Ready
 *
 * Auth: Bearer <supabase_access_token> (user JWT)
 * Degrades gracefully if v19/v21/v22 migrations not applied.
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

// ─── Readiness Targets ────────────────────────────────────────────────────────

const TARGETS = {
  labels:            10_000,   // total fraud labels for training
  confirmed_fraud:   500,      // minimum confirmed fraud labels
  feature_coverage:  0.80,     // 80% of events must have feature vectors
  label_coverage:    0.10,     // 10% of events labeled is acceptable minimum
  agreement_rate:    0.80,     // 80% shadow agreement before shadow→supervised
  balance_max_skew:  0.80,     // no single class should exceed 80% of labels
}

// ─── Criteria Weights ─────────────────────────────────────────────────────────

const WEIGHTS = {
  volume:      0.25,
  quality:     0.25,
  balance:     0.20,
  coverage:    0.15,
  consistency: 0.15,
}
// sum = 1.00

// ─── Classification ───────────────────────────────────────────────────────────

function classify(score: number): string {
  if (score >= 90) return 'Production Ready'
  if (score >= 70) return 'Ready for Shadow Training'
  if (score >= 40) return 'Early Training'
  return 'Not Ready'
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
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })

  const orgId = profile.organization_id as string
  const days  = Math.min(90, Math.max(7, parseInt(String(req.query.days ?? '30'), 10) || 30))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const supa = createClient(supabaseUrl, serviceKey)

  // ── Parallel fetches ──────────────────────────────────────────────────────
  const [
    labelsRes,
    eventsRes,
    featuresRes,
    predsRes,
  ] = await Promise.allSettled([
    // All-time labels (volume/balance/coverage)
    supa.from('fraud_labels')
      .select('label, risk_event_id')
      .eq('organization_id', orgId)
      .limit(50_000),

    // Total events all-time (for coverage denominator)
    supa.from('risk_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),

    // Feature coverage within period
    supa.from('fraud_features')
      .select('risk_event_id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since),

    // Shadow predictions within period (for consistency)
    supa.from('ml_predictions')
      .select('agreement')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .limit(20_000),
  ])

  // ── Label data ────────────────────────────────────────────────────────────
  const labels = labelsRes.status === 'fulfilled' && !labelsRes.value.error
    ? (labelsRes.value.data ?? []) as Array<{ label: string; risk_event_id: string }>
    : []

  // Deduplicate by risk_event_id (keep latest)
  const labelMap = new Map<string, string>()
  for (const l of labels) labelMap.set(l.risk_event_id, l.label)
  const uniqueLabels = [...labelMap.values()]
  const totalLabels  = uniqueLabels.length

  const labelCounts = {
    confirmed_fraud:  uniqueLabels.filter(l => l === 'confirmed_fraud').length,
    suspected_fraud:  uniqueLabels.filter(l => l === 'suspected_fraud').length,
    false_positive:   uniqueLabels.filter(l => l === 'false_positive').length,
    legitimate:       uniqueLabels.filter(l => l === 'legitimate').length,
  }

  // ── Volume criterion (25%) ────────────────────────────────────────────────
  // Sub-scores:
  //   a) Total labels toward 10k target (60%)
  //   b) Confirmed fraud toward 500 minimum (40%)
  const labelProgress   = Math.min(totalLabels / TARGETS.labels, 1)
  const fraudProgress   = Math.min(labelCounts.confirmed_fraud / TARGETS.confirmed_fraud, 1)
  const volumeRaw       = labelProgress * 0.60 + fraudProgress * 0.40
  const volumeScore     = Math.round(volumeRaw * WEIGHTS.volume * 100)

  // ── Quality criterion (25%) ───────────────────────────────────────────────
  // Sub-scores:
  //   a) Feature coverage in period (70%)
  //   b) Confirmed + suspected fraud labels exist (30%)
  const eventsCount   = eventsRes.status === 'fulfilled' ? (eventsRes.value.count ?? 0) : 0
  const eventsInPeriod = Math.max(eventsCount, 1)

  // Feature coverage: compare unique events with features vs total events
  const featuresCount  = featuresRes.status === 'fulfilled' && !('error' in featuresRes.value && featuresRes.value.error)
    ? (featuresRes.value.count ?? 0)
    : 0
  const featureCoverage = Math.min(featuresCount / eventsInPeriod, 1)
  const hasFraudLabels  = (labelCounts.confirmed_fraud + labelCounts.suspected_fraud) > 0 ? 1 : 0
  const qualityRaw      = featureCoverage * 0.70 + hasFraudLabels * 0.30
  const qualityScore    = Math.round(qualityRaw * WEIGHTS.quality * 100)

  // ── Balance criterion (20%) ───────────────────────────────────────────────
  // Healthy distribution: no class dominates above 80%; fraud classes present
  const balanceIssues: string[] = []
  let balanceRaw = 1.0

  if (totalLabels > 0) {
    const maxCount    = Math.max(...Object.values(labelCounts))
    const dominance   = maxCount / totalLabels
    if (dominance > TARGETS.balance_max_skew) {
      balanceRaw *= 0.5
      const dominant = Object.entries(labelCounts).find(([, v]) => v === maxCount)?.[0] ?? '?'
      balanceIssues.push(`Class "${dominant}" dominates at ${Math.round(dominance * 100)}% (target ≤80%)`)
    }
    if (labelCounts.confirmed_fraud === 0) {
      balanceRaw *= 0.4
      balanceIssues.push('Zero confirmed_fraud labels — model cannot learn true positive class')
    } else if (labelCounts.confirmed_fraud < 50) {
      balanceRaw *= 0.7
      balanceIssues.push(`Only ${labelCounts.confirmed_fraud} confirmed_fraud labels (target ≥50)`)
    }
    if (labelCounts.legitimate === 0) {
      balanceRaw *= 0.6
      balanceIssues.push('Zero legitimate labels — model cannot learn true negative class')
    }
  } else {
    balanceRaw = 0
    balanceIssues.push('No labels submitted yet')
  }
  const balanceScore = Math.round(balanceRaw * WEIGHTS.balance * 100)

  // ── Coverage criterion (15%) ──────────────────────────────────────────────
  // What fraction of all events have been labeled
  const labeledEventCount  = labelMap.size
  const coverageRate       = eventsCount > 0 ? labeledEventCount / eventsCount : 0
  const coverageRaw        = Math.min(coverageRate / TARGETS.label_coverage, 1)
  const coverageScore      = Math.round(coverageRaw * WEIGHTS.coverage * 100)

  // ── Consistency criterion (15%) ───────────────────────────────────────────
  // Shadow model agreement rate (only meaningful if ML_SHADOW_ENABLED)
  const preds = predsRes.status === 'fulfilled' && !('error' in predsRes.value && predsRes.value.error)
    ? (predsRes.value.data ?? []) as Array<{ agreement: boolean | null }>
    : []
  const totalPreds  = preds.length
  const agreeCount  = preds.filter(p => p.agreement === true).length
  const agreementRate = totalPreds > 0 ? agreeCount / totalPreds : 0
  // If shadow mode not enabled (zero predictions), give half credit (not penalize)
  const consistencyRaw   = totalPreds > 0
    ? Math.min(agreementRate / TARGETS.agreement_rate, 1)
    : 0.5
  const consistencyScore = Math.round(consistencyRaw * WEIGHTS.consistency * 100)

  // ── Final score ───────────────────────────────────────────────────────────
  const readinessScore = Math.min(100, volumeScore + qualityScore + balanceScore + coverageScore + consistencyScore)
  const classification = classify(readinessScore)

  // ── Blockers & recommendations ────────────────────────────────────────────
  const blockers: string[] = []
  const recommendations: string[] = []
  const passed: string[] = []

  // Volume
  if (totalLabels < 100) {
    blockers.push(`Insufficient labels: ${totalLabels}/10,000 (need ≥100 to start)`)
    recommendations.push('Submit fraud labels via Risk Events → Outcome Label')
  } else if (totalLabels < 1000) {
    recommendations.push(`Increase labels: ${totalLabels}/10,000 (target 1,000+ for meaningful training)`)
  } else {
    passed.push(`Label volume: ${totalLabels.toLocaleString()} labels collected`)
  }

  if (labelCounts.confirmed_fraud === 0) {
    blockers.push('Zero confirmed_fraud labels — critical blocker for supervised training')
  } else if (labelCounts.confirmed_fraud < 50) {
    recommendations.push(`Confirm more fraud cases: ${labelCounts.confirmed_fraud}/50 minimum`)
  } else {
    passed.push(`Confirmed fraud: ${labelCounts.confirmed_fraud} labeled`)
  }

  // Balance
  for (const issue of balanceIssues) {
    if (issue.includes('Zero')) {
      blockers.push(issue)
    } else {
      recommendations.push(issue)
    }
  }
  if (balanceIssues.length === 0 && totalLabels > 0) {
    passed.push('Label distribution is balanced')
  }

  // Coverage
  const covPct = Math.round(coverageRate * 1000) / 10
  if (covPct < 1) {
    recommendations.push(`Low label coverage: ${covPct}% of events labeled (target ≥10%)`)
  } else {
    passed.push(`Label coverage: ${covPct}% of events`)
  }

  // Consistency
  if (totalPreds === 0) {
    recommendations.push('Enable ML_SHADOW_ENABLED=true to start collecting shadow predictions')
  } else if (agreementRate < 0.60) {
    blockers.push(`Shadow agreement too low: ${Math.round(agreementRate * 100)}% (need ≥80%)`)
  } else if (agreementRate < TARGETS.agreement_rate) {
    recommendations.push(`Improve shadow agreement: ${Math.round(agreementRate * 100)}% (target ≥80%)`)
  } else {
    passed.push(`Shadow agreement rate: ${Math.round(agreementRate * 100)}%`)
  }

  // Feature quality
  const featureCovPct = Math.round(featureCoverage * 1000) / 10
  if (featureCovPct < 50) {
    recommendations.push(`Low feature coverage: ${featureCovPct}% (enable FEATURE_STORE_ENABLED=true)`)
  } else {
    passed.push(`Feature coverage: ${featureCovPct}%`)
  }

  return res.status(200).json({
    readiness_score:    readinessScore,
    classification,
    criteria: {
      volume: {
        score:            volumeScore,
        max:              Math.round(WEIGHTS.volume * 100),
        weight:           WEIGHTS.volume,
        total_labels:     totalLabels,
        confirmed_fraud:  labelCounts.confirmed_fraud,
        target_labels:    TARGETS.labels,
        target_fraud:     TARGETS.confirmed_fraud,
        label_progress_pct: Math.round(labelProgress * 1000) / 10,
        fraud_progress_pct: Math.round(fraudProgress * 1000) / 10,
      },
      quality: {
        score:              qualityScore,
        max:                Math.round(WEIGHTS.quality * 100),
        weight:             WEIGHTS.quality,
        feature_coverage_pct: featureCovPct,
        has_fraud_labels:   hasFraudLabels === 1,
        target_coverage:    Math.round(TARGETS.feature_coverage * 100),
      },
      balance: {
        score:        balanceScore,
        max:          Math.round(WEIGHTS.balance * 100),
        weight:       WEIGHTS.balance,
        label_counts: labelCounts,
        issues:       balanceIssues,
        is_balanced:  balanceIssues.length === 0,
      },
      coverage: {
        score:              coverageScore,
        max:                Math.round(WEIGHTS.coverage * 100),
        weight:             WEIGHTS.coverage,
        labeled_events:     labeledEventCount,
        total_events:       eventsCount,
        coverage_pct:       covPct,
        target_pct:         Math.round(TARGETS.label_coverage * 100),
      },
      consistency: {
        score:              consistencyScore,
        max:                Math.round(WEIGHTS.consistency * 100),
        weight:             WEIGHTS.consistency,
        total_predictions:  totalPreds,
        agreement_count:    agreeCount,
        agreement_rate_pct: Math.round(agreementRate * 1000) / 10,
        target_pct:         Math.round(TARGETS.agreement_rate * 100),
        shadow_enabled:     totalPreds > 0,
      },
    },
    blockers,
    recommendations,
    passed_checks:  passed,
    period_days:    days,
    generated_at:   new Date().toISOString(),
  })
}
