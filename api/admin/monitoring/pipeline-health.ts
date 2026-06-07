/**
 * GET /api/admin/monitoring/pipeline-health
 *
 * Data pipeline health: row counts for all 5 derived tables in last 24h.
 * Gracefully returns null for any table that doesn't exist yet (migration not applied).
 *
 * Tables:
 *   risk_events      — always present (core table)
 *   fraud_labels     — v19 migration
 *   fraud_features   — v19 + v20 migrations
 *   training_dataset — v21 migration
 *   ml_predictions   — v22 migration
 *
 * Auth: Bearer <supabase_access_token> (owner only)
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey     = process.env.VITE_SUPABASE_ANON_KEY ?? ''

function userClient(token: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = ((req.headers.authorization ?? '') as string).replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization required' })

  const userSupa = userClient(token)
  const { data: { user }, error: authErr } = await userSupa.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await userSupa
    .from('profiles')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })
  if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner role required' })

  const orgId    = profile.organization_id as string
  const supa     = createClient(supabaseUrl, serviceKey)
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

  const [reRes, labelsRes, featuresRes, datasetRes, predsRes] = await Promise.allSettled([
    supa.from('risk_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since24h),

    supa.from('fraud_labels')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since24h),

    supa.from('fraud_features')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since24h),

    supa.from('training_dataset')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since24h),

    supa.from('ml_predictions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since24h),
  ])

  // null = table exists but query failed; -1 signals table not found
  type SettledCount = PromiseSettledResult<{ count: number | null; error: { code?: string } | null }>
  const countOf = (r: PromiseSettledResult<unknown>): number | null => {
    if (r.status === 'rejected') return null
    const v = (r as SettledCount).value
    if (v.error) return v.error.code === '42P01' ? -1 : null  // -1 = table missing
    return v.count ?? 0
  }

  const riskEventsCount     = countOf(reRes)
  const fraudLabelsCount    = countOf(labelsRes)
  const fraudFeaturesCount  = countOf(featuresRes)
  const trainingDatasetCount = countOf(datasetRes)
  const mlPredictionsCount  = countOf(predsRes)

  const tableStatus = (n: number | null) => {
    if (n === null) return 'error'
    if (n === -1)   return 'migration_pending'
    return 'ok'
  }

  return res.status(200).json({
    since: since24h,
    tables: {
      risk_events:      { count: riskEventsCount   === -1 ? null : riskEventsCount,   status: tableStatus(riskEventsCount)     },
      fraud_labels:     { count: fraudLabelsCount  === -1 ? null : fraudLabelsCount,  status: tableStatus(fraudLabelsCount)    },
      fraud_features:   { count: fraudFeaturesCount === -1 ? null : fraudFeaturesCount, status: tableStatus(fraudFeaturesCount) },
      training_dataset: { count: trainingDatasetCount === -1 ? null : trainingDatasetCount, status: tableStatus(trainingDatasetCount) },
      ml_predictions:   { count: mlPredictionsCount === -1 ? null : mlPredictionsCount, status: tableStatus(mlPredictionsCount)  },
    },
    generated_at: new Date().toISOString(),
  })
}
