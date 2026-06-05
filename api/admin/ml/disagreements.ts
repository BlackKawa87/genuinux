/**
 * GET /api/admin/ml/disagreements?page=1&limit=20&days=30
 *
 * ML Shadow Mode — Disagreement Analysis (Phase 3.7 Module 7).
 *
 * Returns paginated list of events where the shadow model's prediction
 * differed from the live engine decision.
 *
 * Auth: Authorization: Bearer <supabase_access_token> (user JWT)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

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

  const { data: profile } = await userSupa.from('profiles').select('organization_id').eq('id', user.id).single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })
  const orgId = profile.organization_id as string

  const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20))
  const days  = Math.min(90, Math.max(1, parseInt(String(req.query.days  ?? '30'), 10) || 30))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const from  = (page - 1) * limit
  const to    = from + limit - 1

  const supa = adminClient()

  const { data, error, count } = await supa
    .from('ml_predictions')
    .select('risk_event_id, actual_decision, prediction, prediction_score, created_at', { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('agreement', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    if (error.code === '42P01') {
      return res.status(200).json({
        disagreements: [],
        total: 0,
        page,
        limit,
        notice: 'ml_predictions table not found — apply v22_ml_predictions.sql migration.',
      })
    }
    return res.status(500).json({ error: 'Query failed', details: error.message })
  }

  const rows = (data ?? []) as Array<{
    risk_event_id:    string
    actual_decision:  string | null
    prediction:       string
    prediction_score: number | null
    created_at:       string
  }>

  return res.status(200).json({
    disagreements: rows.map(r => ({
      risk_event_id:     r.risk_event_id,
      official_decision: r.actual_decision ?? 'unknown',
      shadow_prediction: r.prediction,
      confidence:        r.prediction_score ?? 0,
      created_at:        r.created_at,
    })),
    total:      count ?? 0,
    page,
    limit,
    has_more:   (count ?? 0) > to + 1,
    period_days: days,
  })
}
