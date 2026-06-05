/**
 * GET /api/admin/ml/features?model=shadow-v1
 *
 * ML Shadow Mode — Feature Importance (Phase 3.7 Module 8).
 *
 * Returns the weights used by the active shadow model.
 * Sourced from the feature_importance table (seeded by v22_ml_predictions.sql).
 *
 * Response: [{ feature: string, weight: number }] ordered by weight DESC.
 *
 * Auth: Authorization: Bearer <supabase_access_token> (user JWT)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SHADOW_MODEL_NAME } from '../../_lib/shadowPredictor.js'

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

  // No org check needed — feature_importance is global (model weights are not org-scoped)

  const modelVersion = String(req.query.model ?? SHADOW_MODEL_NAME)
  const supa         = adminClient()

  const { data, error } = await supa
    .from('feature_importance')
    .select('feature_name, importance_score')
    .eq('model_version', modelVersion)
    .order('importance_score', { ascending: false })

  if (error) {
    if (error.code === '42P01') {
      return res.status(200).json({
        features: [],
        model:    modelVersion,
        notice:   'feature_importance table not found — apply v22_ml_predictions.sql migration.',
      })
    }
    return res.status(500).json({ error: 'Query failed', details: error.message })
  }

  const rows = (data ?? []) as Array<{ feature_name: string; importance_score: number }>

  return res.status(200).json({
    features: rows.map(r => ({
      feature: r.feature_name,
      weight:  r.importance_score,
    })),
    model:       modelVersion,
    total_weight: rows.reduce((s, r) => s + r.importance_score, 0),
  })
}
