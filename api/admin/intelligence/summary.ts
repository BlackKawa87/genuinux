/**
 * GET /api/admin/intelligence/summary?days=30
 *
 * Returns aggregated intelligence metrics for the authenticated org:
 *   - Feedback Loop: decision quality measured against submitted fraud labels
 *   - GNX Score distribution (Low / Review Zone / High)
 *   - Fraud label trends over time (daily buckets)
 *   - Label counts for period
 *   - Top fraud patterns (countries, event types, risk levels, original decisions)
 *   - Training Readiness (all-time label counts + progress to 10k threshold)
 *   - Data Quality Warnings
 *
 * Auth: Authorization: Bearer <supabase_access_token>
 * Available to any authenticated org member (not owner-only).
 * All queries are RLS-scoped to the user's organization automatically.
 *
 * If fraud_labels table does not exist (v19 migration not applied),
 * returns a zeroed-out response with a notice field.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─── Client ───────────────────────────────────────────────────────────────────

function userClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LabelRow  = { risk_event_id: string; label: string; created_at: string }
type EventRow  = { id: string; decision: string; gnx_score: number | null; event_type: string; country: string | null; risk_level: string }
type LabelOnly = { risk_event_id: string; label: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100)
}

function topN(vals: string[], n = 5): Array<{ value: string; count: number }> {
  const c: Record<string, number> = {}
  for (const v of vals) { if (v) c[v] = (c[v] ?? 0) + 1 }
  return Object.entries(c)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

// ─── Zero response (tables missing) ──────────────────────────────────────────

function zeroResponse(notice: string) {
  return {
    period_days:   30,
    total_events:  0,
    notice,
    feedback_loop: {
      total_labeled: 0, correct_approve: 0, incorrect_approve: 0,
      correct_block: 0, incorrect_block: 0, correct_review: 0, incorrect_review: 0,
      decision_accuracy: 0, false_positive_rate: 0, false_negative_rate: 0,
      precision: 0, recall: 0, review_quality: 0, label_coverage_rate: 0,
      insight: null,
    },
    gnx_distribution:   { low: 0, review_zone: 0, high: 0, total: 0 },
    fraud_trends:       [],
    label_counts:       { confirmed_fraud: 0, suspected_fraud: 0, false_positive: 0, legitimate: 0, total: 0 },
    top_patterns:       { countries: [], event_types: [], risk_levels: [], original_decisions: [] },
    training_readiness: {
      total_labels: 0, confirmed_fraud_labels: 0, suspected_fraud_labels: 0,
      legitimate_labels: 0, false_positive_labels: 0,
      progress_pct: 0, status: 'not_ready', data_quality_warnings: [],
    },
    generated_at: new Date().toISOString(),
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = (req.headers['authorization'] ?? '') as string
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization header required' })

  const supabase = userClient(token)
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired token' })

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!profile) return res.status(403).json({ error: 'No organization' })

  const rawDays = parseInt(String(req.query['days'] ?? '30'), 10)
  const days    = Math.min(90, Math.max(7, isNaN(rawDays) ? 30 : rawDays))
  const since   = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // ── Phase 1: Parallel queries ─────────────────────────────────────────────
  const [labelsRes, eventsRes, allLabelsRes] = await Promise.all([
    // Period fraud labels (for feedback loop + trends + patterns)
    supabase
      .from('fraud_labels')
      .select('risk_event_id, label, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000),
    // Period events — lightweight, for GNX distribution and total count
    supabase
      .from('risk_events')
      .select('id, decision, gnx_score, event_type, country, risk_level')
      .gte('created_at', since)
      .limit(5000),
    // All-time label counts for Training Readiness — include risk_event_id for dedup
    supabase
      .from('fraud_labels')
      .select('risk_event_id, label')
      .order('created_at', { ascending: true })
      .limit(50000),
  ])

  // Graceful degradation if fraud_labels table doesn't exist yet (v19 not applied)
  if (labelsRes.error?.message?.includes('does not exist') || labelsRes.error?.code === '42P01') {
    return res.status(200).json(zeroResponse('Run v19 migration to enable Intelligence Layer.'))
  }

  const periodLabels = (labelsRes.data ?? []) as LabelRow[]
  const periodEvents = (eventsRes.data ?? []) as EventRow[]
  const allLabels    = (allLabelsRes.data ?? []) as LabelOnly[]

  // Deduplicate labels by risk_event_id — keep the latest label per event.
  // Query is ordered ascending so the last entry for each event is the most recent.
  // This prevents label_coverage_rate from exceeding 100% when duplicate rows exist.
  const labelByEvent = new Map<string, LabelRow>()
  for (const l of periodLabels) labelByEvent.set(l.risk_event_id, l)
  const dedupedLabels = [...labelByEvent.values()]

  const allLabelsByEvent = new Map<string, LabelOnly>()
  for (const l of allLabels) allLabelsByEvent.set(l.risk_event_id, l)
  const dedupedAllLabels = [...allLabelsByEvent.values()]

  // ── Phase 2: Resolve events referenced by labels ──────────────────────────
  // Labels may reference events created before the current period window.
  // Build a map from phase 1 first, then fetch only the missing IDs.
  const eventMap = new Map<string, EventRow>(periodEvents.map(e => [e.id, e]))
  const missingIds = [...new Set(dedupedLabels.map(l => l.risk_event_id))]
    .filter(id => !eventMap.has(id))
    .slice(0, 500)

  if (missingIds.length > 0) {
    const { data: extra } = await supabase
      .from('risk_events')
      .select('id, decision, gnx_score, event_type, country, risk_level')
      .in('id', missingIds)
    for (const e of (extra ?? []) as EventRow[]) eventMap.set(e.id, e)
  }

  // ── Feedback Loop ─────────────────────────────────────────────────────────
  let correct_approve = 0, incorrect_approve = 0
  let correct_block   = 0, incorrect_block   = 0
  let correct_review  = 0, incorrect_review  = 0

  for (const lbl of dedupedLabels) {
    const ev = eventMap.get(lbl.risk_event_id)
    if (!ev) continue
    const isFraud = lbl.label === 'confirmed_fraud' || lbl.label === 'suspected_fraud'
    const isLegit = lbl.label === 'legitimate'      || lbl.label === 'false_positive'
    if      (ev.decision === 'allow')  { if (isLegit) correct_approve++; else if (isFraud) incorrect_approve++ }
    else if (ev.decision === 'block')  { if (isFraud) correct_block++;   else if (isLegit) incorrect_block++   }
    else if (ev.decision === 'review') { if (isFraud) correct_review++;  else if (isLegit) incorrect_review++  }
  }

  const total_labeled   = dedupedLabels.length
  const total_evaluated = correct_approve + incorrect_approve + correct_block + incorrect_block + correct_review + incorrect_review
  const total_events    = periodEvents.length

  const decision_accuracy   = pct(correct_approve + correct_block + correct_review, total_evaluated)
  const false_positive_rate = pct(incorrect_block,   correct_block   + incorrect_block)
  const false_negative_rate = pct(incorrect_approve, correct_approve + incorrect_approve)
  const precision           = pct(correct_block,     correct_block   + incorrect_block)
  const recall              = pct(correct_block,     correct_block   + incorrect_approve)
  const review_quality      = pct(correct_review,    correct_review  + incorrect_review)
  const label_coverage_rate = pct(total_labeled,     total_events)

  // Auto insight — most actionable finding for the period
  let insight: string | null = null
  if (total_labeled === 0) {
    insight = null
  } else if (false_negative_rate > 30) {
    insight = 'High false negative rate — many approved events were later confirmed as fraud. Consider tightening allow thresholds.'
  } else if (false_positive_rate > 30) {
    insight = 'False positive rate is elevated. Aggressive block rules may be creating unnecessary friction for legitimate users.'
  } else if (label_coverage_rate < 5 && total_events > 50) {
    insight = 'Label coverage is low. Submit more feedback via POST /api/risk/label to improve intelligence quality.'
  } else if (correct_block >= 5 && false_positive_rate < 15) {
    insight = 'Block decisions are highly accurate — confirmed fraud labels validate your current rule configuration.'
  } else if (correct_review + incorrect_review >= 5 && incorrect_review > correct_review) {
    insight = 'Most reviewed events are turning out to be legitimate. Consider loosening review thresholds to reduce manual workload.'
  } else {
    const remaining = Math.max(0, 10000 - dedupedAllLabels.length)
    insight = remaining > 0
      ? `${dedupedAllLabels.length.toLocaleString()} labels collected — ${remaining.toLocaleString()} more needed to activate ML training.`
      : 'Dataset is ready for ML shadow mode. Activate Shadow ML in Infrastructure settings.'
  }

  // ── GNX Score Distribution ────────────────────────────────────────────────
  let gnx_low = 0, gnx_review_zone = 0, gnx_high = 0
  for (const e of periodEvents) {
    if (e.gnx_score === null) continue
    if      (e.gnx_score <= 300) gnx_low++
    else if (e.gnx_score <= 700) gnx_review_zone++
    else                         gnx_high++
  }

  // ── Label counts (period) ─────────────────────────────────────────────────
  const label_counts = { confirmed_fraud: 0, suspected_fraud: 0, false_positive: 0, legitimate: 0, total: 0 }
  for (const l of dedupedLabels) {
    label_counts.total++
    if      (l.label === 'confirmed_fraud') label_counts.confirmed_fraud++
    else if (l.label === 'suspected_fraud') label_counts.suspected_fraud++
    else if (l.label === 'false_positive')  label_counts.false_positive++
    else if (l.label === 'legitimate')      label_counts.legitimate++
  }

  // ── Fraud Label Trends (daily buckets) ────────────────────────────────────
  const trendMap = new Map<string, { confirmed_fraud: number; suspected_fraud: number; false_positive: number; legitimate: number }>()
  for (const l of dedupedLabels) {
    const d = l.created_at.slice(0, 10) // YYYY-MM-DD
    if (!trendMap.has(d)) trendMap.set(d, { confirmed_fraud: 0, suspected_fraud: 0, false_positive: 0, legitimate: 0 })
    const b = trendMap.get(d)!
    if      (l.label === 'confirmed_fraud') b.confirmed_fraud++
    else if (l.label === 'suspected_fraud') b.suspected_fraud++
    else if (l.label === 'false_positive')  b.false_positive++
    else if (l.label === 'legitimate')      b.legitimate++
  }
  const fraud_trends = [...trendMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ── Top Fraud Patterns ────────────────────────────────────────────────────
  const confirmedIds = new Set(dedupedLabels.filter(l => l.label === 'confirmed_fraud').map(l => l.risk_event_id))
  const confirmedEvs = [...eventMap.values()].filter(e => confirmedIds.has(e.id))

  const top_patterns = {
    countries:          topN(confirmedEvs.map(e => e.country ?? 'Unknown')),
    event_types:        topN(confirmedEvs.map(e => e.event_type)),
    risk_levels:        topN(confirmedEvs.map(e => e.risk_level)),
    original_decisions: topN(confirmedEvs.map(e => e.decision)),
  }

  // ── Training Readiness (all-time) ─────────────────────────────────────────
  const atc = { total: 0, confirmed_fraud: 0, suspected_fraud: 0, false_positive: 0, legitimate: 0 }
  for (const l of dedupedAllLabels) {
    atc.total++
    if      (l.label === 'confirmed_fraud') atc.confirmed_fraud++
    else if (l.label === 'suspected_fraud') atc.suspected_fraud++
    else if (l.label === 'false_positive')  atc.false_positive++
    else if (l.label === 'legitimate')      atc.legitimate++
  }

  const progress_pct = Math.min(100, Math.round((atc.total / 10000) * 100))
  type Status = 'not_ready' | 'collecting' | 'near_ready' | 'ready'
  const status: Status = atc.total >= 10000 ? 'ready'
    : atc.total >= 5000 ? 'near_ready'
    : atc.total >= 1000 ? 'collecting'
    : 'not_ready'

  const data_quality_warnings: string[] = []
  if (atc.total >= 100) {
    if (atc.legitimate / atc.total < 0.15) data_quality_warnings.push('Too few legitimate labels — model may overfit to fraud patterns.')
    if (atc.false_positive / atc.total < 0.05) data_quality_warnings.push('False positive labels are missing — block precision cannot be calibrated.')
    if ((atc.confirmed_fraud + atc.suspected_fraud) / atc.total < 0.2) data_quality_warnings.push('Confirmed fraud labels below recommended threshold (20%).')
    if (atc.confirmed_fraud < 50) data_quality_warnings.push('Fewer than 50 confirmed fraud labels — insufficient for meaningful ML training.')
  }

  return res.status(200).json({
    period_days:  days,
    total_events,
    feedback_loop: {
      total_labeled, correct_approve, incorrect_approve,
      correct_block, incorrect_block, correct_review, incorrect_review,
      decision_accuracy, false_positive_rate, false_negative_rate,
      precision, recall, review_quality, label_coverage_rate,
      insight,
    },
    gnx_distribution: { low: gnx_low, review_zone: gnx_review_zone, high: gnx_high, total: gnx_low + gnx_review_zone + gnx_high },
    fraud_trends,
    label_counts,
    top_patterns,
    training_readiness: {
      total_labels:           atc.total,
      confirmed_fraud_labels: atc.confirmed_fraud,
      suspected_fraud_labels: atc.suspected_fraud,
      legitimate_labels:      atc.legitimate,
      false_positive_labels:  atc.false_positive,
      progress_pct,
      status,
      data_quality_warnings,
    },
    generated_at: new Date().toISOString(),
  })
}
