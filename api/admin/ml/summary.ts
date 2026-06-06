/**
 * GET /api/admin/ml/summary
 *
 * ML Shadow Mode — Metrics summary (Phase 3.7 Module 6).
 *
 * Returns:
 *   total_predictions  — rows in ml_predictions for the period
 *   agreement_rate     — pct where ML prediction === engine decision
 *   coverage_rate      — pct of risk_events that received a prediction
 *   accuracy           — null until ground-truth labels are available
 *   precision          — null until ground-truth labels are available
 *   recall             — null until ground-truth labels are available
 *   f1_score           — null until ground-truth labels are available
 *   model_name         — active model identifier
 *   model_version      — active model version integer
 *
 * Degrades gracefully if v22 migration has not been applied.
 * Auth: Authorization: Bearer <supabase_access_token> (user JWT)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SHADOW_MODEL_NAME, SHADOW_MODEL_VERSION } from '../../_lib/shadowPredictor.js'

// ─── Clients ─────────────────────────────────────────────────────────────────

function userClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

// ─── Empty response ───────────────────────────────────────────────────────────

function emptyResponse(notice?: string) {
  return {
    total_predictions:   0,
    agreement_rate:      0,
    coverage_rate:       0,
    accuracy:            null as number | null,
    precision:           null as number | null,
    recall:              null as number | null,
    f1_score:            null as number | null,
    model_name:          SHADOW_MODEL_NAME,
    model_version:       SHADOW_MODEL_VERSION,
    total_events_period: 0,
    agreement_count:     0,
    disagreement_count:  0,
    period_days:         30,
    generated_at:        new Date().toISOString(),
    notice,
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Auth
  const authHeader = req.headers['authorization'] as string | undefined
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization' })
  const token = authHeader.slice(7).trim()

  const userSupa = userClient(token)
  const { data: { user }, error: authErr } = await userSupa.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await userSupa.from('profiles').select('organization_id').eq('user_id', user.id).single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })
  const orgId = profile.organization_id as string

  const days  = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const supa = adminClient()

  // ── Fetch predictions ─────────────────────────────────────────────────────
  const { data: predData, error: predErr } = await supa
    .from('ml_predictions')
    .select('prediction, actual_decision, agreement')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .limit(50_000)

  if (predErr) {
    if (predErr.code === '42P01') {
      return res.status(200).json(emptyResponse(
        'ml_predictions table not found — apply v22_ml_predictions.sql and set ML_SHADOW_ENABLED=true.',
      ))
    }
    return res.status(500).json({ error: 'Query failed', details: predErr.message })
  }

  const preds = (predData ?? []) as Array<{
    prediction: string; actual_decision: string | null; agreement: boolean | null
  }>
  const totalPreds = preds.length

  // ── Total events in period ────────────────────────────────────────────────
  const { count: totalEvents } = await supa
    .from('risk_events')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('created_at', since)

  const evCount      = totalEvents ?? 0
  const coverageRate = evCount === 0 ? 0 : Math.round((totalPreds / evCount) * 1000) / 10

  // ── Agreement ─────────────────────────────────────────────────────────────
  const agreeCount    = preds.filter(p => p.agreement === true).length
  const disagreeCount = totalPreds - agreeCount
  const agreementRate = totalPreds === 0 ? 0 : Math.round((agreeCount / totalPreds) * 1000) / 10

  // ── Performance vs ground-truth labels ────────────────────────────────────
  // Requires fraud_labels table (v19 migration). Gracefully skips if missing.
  let accuracy: number | null = null
  let precision: number | null = null
  let recall: number | null = null
  let f1_score: number | null = null

  if (totalPreds > 0) {
    const { data: labelData, error: labelErr } = await supa
      .from('fraud_labels')
      .select('risk_event_id, label')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .limit(20_000)

    if (!labelErr && labelData && labelData.length > 0) {
      const labelMap = new Map<string, string>()
      for (const l of labelData as Array<{ risk_event_id: string; label: string }>) {
        labelMap.set(l.risk_event_id, l.label)
      }

      // Fetch prediction event IDs to join with labels
      const { data: fullPreds } = await supa
        .from('ml_predictions')
        .select('risk_event_id, prediction')
        .eq('organization_id', orgId)
        .gte('created_at', since)
        .limit(50_000)

      let tp = 0, tn = 0, fp = 0, fn = 0

      for (const p of (fullPreds ?? []) as Array<{ risk_event_id: string; prediction: string }>) {
        const gt = labelMap.get(p.risk_event_id)
        if (!gt) continue

        const isPredFraud   = p.prediction === 'block' || p.prediction === 'review'
        const isActualFraud = gt === 'confirmed_fraud' || gt === 'suspected_fraud'

        if (isPredFraud  && isActualFraud)  tp++
        else if (!isPredFraud && !isActualFraud) tn++
        else if (isPredFraud  && !isActualFraud) fp++
        else                                     fn++
      }

      const labeled = tp + tn + fp + fn
      if (labeled > 0) {
        const pct  = (n: number) => Math.round((n / labeled) * 1000) / 10
        const prec = tp + fp === 0 ? 0 : Math.round((tp / (tp + fp)) * 1000) / 10
        const rec  = tp + fn === 0 ? 0 : Math.round((tp / (tp + fn)) * 1000) / 10

        accuracy  = pct(tp + tn)
        precision = prec
        recall    = rec
        f1_score  = prec + rec === 0 ? 0
          : Math.round((2 * prec * rec) / (prec + rec) * 100) / 100
      }
    }
  }

  return res.status(200).json({
    total_predictions:   totalPreds,
    agreement_rate:      agreementRate,
    coverage_rate:       coverageRate,
    accuracy,
    precision,
    recall,
    f1_score,
    model_name:          SHADOW_MODEL_NAME,
    model_version:       SHADOW_MODEL_VERSION,
    total_events_period: evCount,
    agreement_count:     agreeCount,
    disagreement_count:  disagreeCount,
    period_days:         days,
    generated_at:        new Date().toISOString(),
  })
}
