/**
 * GET /api/admin/ml/threshold-sim?days=30
 *
 * Phase 4.0 — GNX Score Threshold Simulator
 *
 * Simulates 6 GNX score thresholds (200–700) against labeled events
 * to find the optimal block/allow cutoff before activating supervised ML.
 *
 * For each threshold T:
 *   gnx_score > T  → predicted "fraud" (block/review)
 *   gnx_score ≤ T  → predicted "legitimate" (allow)
 *
 * Compares predictions to fraud_labels ground truth and computes:
 *   precision, recall, f1, fpr, fnr, accuracy
 *
 * Returns:
 *   thresholds[]      — metrics for each tested threshold
 *   recommended       — threshold with best F1 score
 *   labeled_events    — total events with both gnx_score and a label
 *   period_days       — requested period
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

const TESTED_THRESHOLDS = [200, 300, 400, 500, 600, 700]

// ─── Confusion matrix helpers ─────────────────────────────────────────────────

interface Metrics {
  threshold:   number
  tp:          number
  tn:          number
  fp:          number
  fn:          number
  labeled:     number
  accuracy:    number
  precision:   number
  recall:      number
  f1:          number
  fpr:         number   // false positive rate = fp / (fp + tn)
  fnr:         number   // false negative rate = fn / (fn + tp)
  block_pct:   number   // pct of events that would be blocked at this threshold
  note:        string
}

function computeMetrics(
  threshold:    number,
  events:       Array<{ gnx_score: number; is_fraud: boolean }>,
): Metrics {
  let tp = 0, tn = 0, fp = 0, fn = 0

  for (const e of events) {
    const predFraud   = e.gnx_score > threshold
    const actualFraud = e.is_fraud

    if (predFraud  && actualFraud)  tp++
    else if (!predFraud && !actualFraud) tn++
    else if (predFraud  && !actualFraud) fp++
    else                                 fn++
  }

  const labeled   = tp + tn + fp + fn
  const pct       = (n: number, d: number) => d === 0 ? 0 : Math.round((n / d) * 1000) / 10
  const prec      = pct(tp, tp + fp)
  const rec       = pct(tp, tp + fn)
  const f1        = prec + rec === 0 ? 0 : Math.round((2 * prec * rec) / (prec + rec) * 10) / 10
  const accuracy  = pct(tp + tn, labeled)
  const fpr       = pct(fp, fp + tn)
  const fnr       = pct(fn, fn + tp)
  const blockPct  = pct(tp + fp, labeled)

  let note = ''
  if (prec < 50) note = 'Too many false positives — blocks legitimate users'
  else if (rec < 50) note = 'Too many false negatives — misses real fraud'
  else if (f1 >= 70) note = 'Good balance of precision and recall'
  else note = 'Moderate performance'

  return { threshold, tp, tn, fp, fn, labeled, accuracy, precision: prec, recall: rec, f1, fpr, fnr, block_pct: blockPct, note }
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

  // ── Fetch labeled events with gnx_score ───────────────────────────────────
  const [eventsRes, labelsRes] = await Promise.all([
    supa.from('risk_events')
      .select('id, gnx_score')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .not('gnx_score', 'is', null)
      .limit(10_000),

    supa.from('fraud_labels')
      .select('risk_event_id, label')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .limit(10_000),
  ])

  if (eventsRes.error) return res.status(500).json({ error: eventsRes.error.message })

  // Dedup labels by risk_event_id
  const labelMap = new Map<string, string>()
  if (!labelsRes.error) {
    for (const l of (labelsRes.data ?? []) as Array<{ risk_event_id: string; label: string }>) {
      labelMap.set(l.risk_event_id, l.label)
    }
  }

  // Build joined dataset: events with both gnx_score and a label
  const joined: Array<{ gnx_score: number; is_fraud: boolean }> = []
  for (const e of (eventsRes.data ?? []) as Array<{ id: string; gnx_score: number }>) {
    const label = labelMap.get(e.id)
    if (!label) continue
    joined.push({
      gnx_score: e.gnx_score,
      is_fraud:  label === 'confirmed_fraud' || label === 'suspected_fraud',
    })
  }

  const labeledCount = joined.length

  if (labeledCount === 0) {
    return res.status(200).json({
      thresholds:     TESTED_THRESHOLDS.map(t => ({
        threshold: t, tp: 0, tn: 0, fp: 0, fn: 0, labeled: 0,
        accuracy: 0, precision: 0, recall: 0, f1: 0, fpr: 0, fnr: 0, block_pct: 0,
        note: 'No labeled events with GNX score available',
      })),
      recommended:    null,
      labeled_events: 0,
      period_days:    days,
      notice:         'Submit fraud labels on Risk Events to enable threshold simulation.',
    })
  }

  // ── Simulate each threshold ───────────────────────────────────────────────
  const results = TESTED_THRESHOLDS.map(t => computeMetrics(t, joined))

  // Recommend threshold with best F1 score
  // Tiebreak: prefer higher precision (fewer false positives in production)
  const recommended = results.reduce((best, curr) =>
    curr.f1 > best.f1 || (curr.f1 === best.f1 && curr.precision > best.precision) ? curr : best
  )

  // ── GNX score distribution in labeled set ─────────────────────────────────
  const fraudScores = joined.filter(e => e.is_fraud).map(e => e.gnx_score).sort((a, b) => a - b)
  const legitScores = joined.filter(e => !e.is_fraud).map(e => e.gnx_score).sort((a, b) => a - b)
  const ptile = (arr: number[], p: number) => arr.length ? arr[Math.floor(p * (arr.length - 1))] : null

  return res.status(200).json({
    thresholds: results,
    recommended: {
      threshold:  recommended.threshold,
      f1:         recommended.f1,
      precision:  recommended.precision,
      recall:     recommended.recall,
      fpr:        recommended.fpr,
      rationale:  `Threshold ${recommended.threshold} achieves the best F1 score (${recommended.f1}%) with ${recommended.precision}% precision and ${recommended.recall}% recall.`,
    },
    score_distribution: {
      fraud: {
        count:  fraudScores.length,
        p25:    ptile(fraudScores, 0.25),
        p50:    ptile(fraudScores, 0.50),
        p75:    ptile(fraudScores, 0.75),
        p90:    ptile(fraudScores, 0.90),
      },
      legitimate: {
        count:  legitScores.length,
        p25:    ptile(legitScores, 0.25),
        p50:    ptile(legitScores, 0.50),
        p75:    ptile(legitScores, 0.75),
        p90:    ptile(legitScores, 0.90),
      },
    },
    labeled_events:  labeledCount,
    fraud_events:    fraudScores.length,
    legit_events:    legitScores.length,
    period_days:     days,
    generated_at:    new Date().toISOString(),
  })
}
