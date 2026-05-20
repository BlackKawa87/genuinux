/**
 * GET /api/admin/system-summary
 *
 * Owner-only endpoint — returns runtime metrics for the operations dashboard.
 * Auth: Authorization: Bearer <supabase_access_token> (user JWT, role must be owner).
 *
 * Response includes:
 *   - org_count: total organizations
 *   - table_sizes: estimated row counts for key tables
 *   - queue_size: pending review queue items
 *   - webhook_deliveries: retrying / failed counts
 *   - ai_cache: cached entries and hit rate estimate
 *   - generated_at: ISO timestamp
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function userClient(accessToken: string) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth: verify user JWT + owner role ───────────────────────────────────────
  const authHeader = (req.headers['authorization'] ?? '') as string
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization header required' })

  const userSb = userClient(token)
  const { data: { user }, error: authErr } = await userSb.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired token' })

  const { data: profile } = await userSb
    .from('profiles')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') {
    return res.status(403).json({ error: 'Owner role required' })
  }

  const sb = adminClient()
  const generated_at = new Date().toISOString()

  // Run all queries in parallel
  const [
    orgResult,
    riskEventsResult,
    usersCheckedResult,
    reviewQueueResult,
    rulesResult,
    webhookRetriesResult,
    webhookFailedResult,
    aiCacheResult,
  ] = await Promise.allSettled([
    sb.from('organizations').select('id', { count: 'exact', head: true }),
    sb.from('risk_events').select('id', { count: 'exact', head: true }),
    sb.from('users_checked').select('id', { count: 'exact', head: true }),
    sb.from('review_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('rules').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    sb.from('webhook_deliveries').select('id', { count: 'exact', head: true }).eq('delivery_status', 'retrying'),
    sb.from('webhook_deliveries').select('id', { count: 'exact', head: true }).eq('delivery_status', 'failed'),
    sb.from('ai_summary_cache').select('id, hit_count', { count: 'exact' }).limit(500),
  ])

  function countOf(result: PromiseSettledResult<{ count: number | null }>): number | null {
    return result.status === 'fulfilled' ? (result.value.count ?? null) : null
  }

  const aiCacheRows = aiCacheResult.status === 'fulfilled'
    ? (aiCacheResult.value.data ?? [])
    : []
  const aiTotalHits = aiCacheRows.reduce((s, r) => s + (r.hit_count ?? 0), 0)

  return res.status(200).json({
    org_count: countOf(orgResult as PromiseSettledResult<{ count: number | null }>),
    table_sizes: {
      risk_events:   countOf(riskEventsResult as PromiseSettledResult<{ count: number | null }>),
      users_checked: countOf(usersCheckedResult as PromiseSettledResult<{ count: number | null }>),
      rules_active:  countOf(rulesResult as PromiseSettledResult<{ count: number | null }>),
    },
    queue_size:  countOf(reviewQueueResult as PromiseSettledResult<{ count: number | null }>),
    webhook_deliveries: {
      retrying: countOf(webhookRetriesResult as PromiseSettledResult<{ count: number | null }>),
      failed:   countOf(webhookFailedResult  as PromiseSettledResult<{ count: number | null }>),
    },
    ai_cache: {
      entries:    aiCacheRows.length,
      total_hits: aiTotalHits,
    },
    generated_at,
  })
}
