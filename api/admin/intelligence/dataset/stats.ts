/**
 * GET /api/admin/intelligence/dataset/stats
 *
 * Training Dataset audit endpoint — Phase 3.6 Modules 4–7.
 *
 * Returns:
 *   - total training_dataset records
 *   - label distribution with percentages
 *   - dataset coverage (training records / total labels)
 *   - dataset balance warnings (skew detection)
 *   - training readiness score (0–100) with component breakdown
 *   - feature coverage within the dataset
 *
 * Auth: Authorization: Bearer <supabase_access_token> (user JWT)
 * Available to any authenticated org member.
 *
 * Gracefully returns zeroed response with notice if v21 migration
 * has not been applied yet.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

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

type LabelKey = 'confirmed_fraud' | 'suspected_fraud' | 'false_positive' | 'legitimate'

interface DatasetRow {
  label:         string
  feature_count: number
}

// ─── Readiness score ──────────────────────────────────────────────────────────

const READINESS_TARGETS = {
  events:   100_000,
  labels:   10_000,
  coverage: 95,   // percent
}

function computeReadiness(
  totalEvents:      number,
  totalLabels:      number,
  featureCoveragePct: number,
): {
  score:            number
  status:           string
  events_progress:  number
  labels_progress:  number
  coverage_progress: number
} {
  const evPct  = Math.min(totalEvents   / READINESS_TARGETS.events,   1) * 100
  const lblPct = Math.min(totalLabels   / READINESS_TARGETS.labels,   1) * 100
  const covPct = Math.min(featureCoveragePct / READINESS_TARGETS.coverage, 1) * 100

  const score = Math.round((evPct + lblPct + covPct) / 3 * 10) / 10

  let status: string
  if (score >= 100)      status = 'Ready for ML Shadow Mode'
  else if (score >= 76)  status = 'Near Ready'
  else if (score >= 51)  status = 'Preparing Dataset'
  else if (score >= 26)  status = 'Collecting Data'
  else                   status = 'Not Ready'

  return {
    score,
    status,
    events_progress:   Math.round(evPct  * 10) / 10,
    labels_progress:   Math.round(lblPct * 10) / 10,
    coverage_progress: Math.round(covPct * 10) / 10,
  }
}

// ─── Balance warnings ─────────────────────────────────────────────────────────

function detectImbalance(
  dist: Record<LabelKey, { count: number; pct: number }>,
  total: number,
): string[] {
  const warnings: string[] = []
  if (total < 10) return warnings

  const { confirmed_fraud, suspected_fraud, false_positive, legitimate } = dist

  if (confirmed_fraud.pct + suspected_fraud.pct > 65) {
    warnings.push('Dataset is heavily skewed toward fraud. Consider adding more legitimate and false-positive samples to improve model generalization.')
  }
  if (legitimate.pct > 70) {
    warnings.push('Legitimate samples are overrepresented. The model may struggle to detect fraud patterns. Add more labeled fraud events.')
  }
  if (false_positive.pct > 30) {
    warnings.push('High false-positive rate in dataset. Investigate if approval decisions are being mislabeled as fraud.')
  }
  if (total > 50 && confirmed_fraud.count < 10) {
    warnings.push('Too few confirmed fraud labels. Fraud detection models require at least 50 confirmed fraud samples for meaningful training.')
  }
  if (total > 100 && legitimate.pct < 10) {
    warnings.push('Legitimate samples are underrepresented. A balanced dataset needs at least 10% legitimate events.')
  }

  return warnings
}

// ─── Zero response ────────────────────────────────────────────────────────────

function zeroResponse(notice: string) {
  const emptyDist = {
    confirmed_fraud: { count: 0, pct: 0 },
    suspected_fraud: { count: 0, pct: 0 },
    false_positive:  { count: 0, pct: 0 },
    legitimate:      { count: 0, pct: 0 },
  }
  return {
    total_records:          0,
    total_labels:           0,
    total_events:           0,
    feature_coverage_pct:   0,
    coverage_pct:           0,
    label_distribution:     emptyDist,
    dataset_balance_warnings: [],
    readiness:              computeReadiness(0, 0, 0),
    dataset_version:        1,
    generated_at:           new Date().toISOString(),
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
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }
  const token = authHeader.slice(7).trim()

  const userSupa = userClient(token)
  const { data: { user }, error: authErr } = await userSupa.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await userSupa
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })
  const orgId = profile.organization_id

  const supa = adminClient()

  // ── Fetch training_dataset rows ───────────────────────────────────────────
  const { data: dsRows, error: dsErr } = await supa
    .from('training_dataset')
    .select('label, feature_count')
    .eq('organization_id', orgId)
    .limit(100_000)

  if (dsErr) {
    if (dsErr.code === '42P01') {
      return res.status(200).json(zeroResponse('training_dataset table not found — apply v21_training_dataset.sql migration to activate the Dataset Builder.'))
    }
    console.error('[dataset/stats] query error:', dsErr.message)
    return res.status(500).json({ error: 'Dataset query failed' })
  }

  // ── Parallel: total labels (all-time) + total events (all-time) ───────────
  const [labelCountRes, eventCountRes] = await Promise.all([
    supa
      .from('fraud_labels')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supa
      .from('risk_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
  ])

  const totalLabels = labelCountRes.count ?? 0
  const totalEvents = eventCountRes.count ?? 0

  // ── Compute stats from in-memory rows ─────────────────────────────────────
  const rows = (dsRows ?? []) as DatasetRow[]
  const totalRecords = rows.length

  const labelCounts: Record<LabelKey, number> = {
    confirmed_fraud: 0,
    suspected_fraud: 0,
    false_positive:  0,
    legitimate:      0,
  }
  let withFeatures = 0

  for (const r of rows) {
    const k = r.label as LabelKey
    if (k in labelCounts) labelCounts[k]++
    if (r.feature_count > 0) withFeatures++
  }

  const pct = (n: number): number =>
    totalRecords === 0 ? 0 : Math.round((n / totalRecords) * 1000) / 10

  const labelDistribution = {
    confirmed_fraud: { count: labelCounts.confirmed_fraud, pct: pct(labelCounts.confirmed_fraud) },
    suspected_fraud: { count: labelCounts.suspected_fraud, pct: pct(labelCounts.suspected_fraud) },
    false_positive:  { count: labelCounts.false_positive,  pct: pct(labelCounts.false_positive)  },
    legitimate:      { count: labelCounts.legitimate,      pct: pct(labelCounts.legitimate)       },
  }

  // Feature coverage within the dataset (records with features / total records)
  const featureCoveragePct = totalRecords === 0
    ? 0
    : Math.round((withFeatures / totalRecords) * 1000) / 10

  // Dataset coverage (training records / total labels submitted)
  const coveragePct = totalLabels === 0
    ? 0
    : Math.round((totalRecords / totalLabels) * 1000) / 10

  const balanceWarnings = detectImbalance(labelDistribution, totalRecords)
  const readiness = computeReadiness(totalEvents, totalLabels, featureCoveragePct)

  return res.status(200).json({
    total_records:            totalRecords,
    total_labels:             totalLabels,
    total_events:             totalEvents,
    feature_coverage_pct:     featureCoveragePct,
    coverage_pct:             coveragePct,
    label_distribution:       labelDistribution,
    dataset_balance_warnings: balanceWarnings,
    readiness,
    dataset_version:          1,
    generated_at:             new Date().toISOString(),
  })
}
