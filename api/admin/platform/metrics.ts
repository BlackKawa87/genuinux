/**
 * GET /api/admin/platform/metrics
 *
 * Platform-wide executive metrics for the Admin Console dashboard.
 * Queries across ALL organizations using service role.
 *
 * Auth: Bearer <supabase_access_token> (is_platform_admin only)
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedisClient } from '../../_lib/redisClient.js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey     = process.env.VITE_SUPABASE_ANON_KEY ?? ''

function userClient(token: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
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
    .from('profiles').select('is_platform_admin').eq('user_id', user.id).single()
  if (!profile?.is_platform_admin) return res.status(403).json({ error: 'Platform admin access required' })

  const supa       = createClient(supabaseUrl, serviceKey)
  const today      = new Date().toISOString().split('T')[0]
  const monthStart = `${today.slice(0, 7)}-01T00:00:00.000Z`
  const todayStart = `${today}T00:00:00.000Z`

  const [orgsRes, usersRes, keysRes, eventsToday, eventsMonth, labelsToday, mlToday, slowToday] =
    await Promise.allSettled([
      supa.from('organizations').select('id, plan, suspended_at'),
      supa.from('profiles').select('id', { count: 'exact', head: true }),
      supa.from('api_keys').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supa.from('risk_events').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supa.from('risk_events').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      supa.from('fraud_labels').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supa.from('ml_predictions').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supa.from('audit_logs').select('id', { count: 'exact', head: true })
        .eq('event_type', 'risk.check.slow').gte('created_at', todayStart),
    ])

  type OrgRow = { id: string; plan: string; suspended_at: string | null }
  const orgs: OrgRow[] = orgsRes.status === 'fulfilled' ? (orgsRes.value.data ?? []) as OrgRow[] : []

  const byPlan: Record<string, number> = {}
  let suspended = 0
  for (const o of orgs) {
    byPlan[o.plan] = (byPlan[o.plan] ?? 0) + 1
    if (o.suspended_at) suspended++
  }

  const safeCount = (r: PromiseSettledResult<unknown>): number | null => {
    if (r.status === 'rejected') return null
    const v = r as PromiseSettledResult<{ count: number | null; error: { code?: string } | null }>
    if (v.value.error) return null
    return v.value.count ?? 0
  }

  // Redis health check
  const redis = getRedisClient()
  let redisStatus: 'ok' | 'degraded' | 'unconfigured' = 'unconfigured'
  if (redis) {
    try { await redis.ping(); redisStatus = 'ok' } catch { redisStatus = 'degraded' }
  }

  return res.status(200).json({
    orgs: {
      total:     orgs.length,
      active:    orgs.length - suspended,
      suspended,
      by_plan:   byPlan,
    },
    users:    { total: safeCount(usersRes) },
    api_keys: { active: safeCount(keysRes) },
    events: {
      today: safeCount(eventsToday),
      month: safeCount(eventsMonth),
    },
    labels:     { today: safeCount(labelsToday) },
    ml:         { today: safeCount(mlToday) },
    slow_today: safeCount(slowToday),
    system: {
      redis:    redisStatus,
      supabase: 'ok',
      sentry:   process.env.SENTRY_DSN ? 'ok' : 'unconfigured',
      stripe:   process.env.STRIPE_SECRET_KEY ? 'ok' : 'unconfigured',
      resend:   process.env.RESEND_API_KEY ? 'ok' : 'unconfigured',
    },
    generated_at: new Date().toISOString(),
  })
}
