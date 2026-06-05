/**
 * GET /api/admin/metrics/cache-stats
 *
 * Owner-only endpoint — returns Redis cache health for the authenticated org.
 *
 * Checks:
 *   - Redis connectivity
 *   - org cache TTL  (gnx:org:{orgId})
 *   - rules cache TTL (gnx:rules:{orgId})
 *   - today's Redis stats (gnx:stats:{orgId}:{YYYY-MM-DD})
 *   - monthly event counter (gnx:monthly_events:{orgId}:{YYYY-MM})
 *   - fraud counters env flag (REDIS_COUNTERS_ENABLED)
 *
 * Requires Redis env vars (UPSTASH_REDIS_REST_URL + TOKEN).
 * If Redis is not configured, returns status: 'unconfigured'.
 *
 * Auth: Authorization: Bearer <supabase_access_token>
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedisClient }  from '../../_lib/redisClient.js'
import { getTodayStats }   from '../../_lib/orgStats.js'

function userClient(accessToken: string) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

function currentMonthKey(orgId: string): string {
  const d  = new Date()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `gnx:monthly_events:${orgId}:${d.getUTCFullYear()}-${mm}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = (req.headers['authorization'] ?? '') as string
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization header required' })

  const supabase = userClient(token)
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired token' })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') {
    return res.status(403).json({ error: 'Owner role required' })
  }

  const orgId = profile.organization_id as string

  // ── Redis health ─────────────────────────────────────────────────────────────
  const redis = getRedisClient()

  if (!redis) {
    return res.status(200).json({
      status:                'unconfigured',
      message:               'UPSTASH_REDIS_REST_URL / TOKEN not set',
      fraud_counters_enabled: false,
      namespaces:            {},
      today:                 null,
      monthly_events:        null,
      generated_at:          new Date().toISOString(),
    })
  }

  // Run all reads in parallel — all fail-open
  const [
    orgTtlResult,
    rulesTtlResult,
    monthlyResult,
    todayResult,
  ] = await Promise.allSettled([
    redis.ttl(`gnx:org:${orgId}`),
    redis.ttl(`gnx:rules:${orgId}`),
    redis.get<string | number>(currentMonthKey(orgId)),
    getTodayStats(orgId),
  ])

  const ttl = (r: PromiseSettledResult<unknown>): number | null =>
    r.status === 'fulfilled' ? (r.value as number) : null

  const orgTtl    = ttl(orgTtlResult)
  const rulesTtl  = ttl(rulesTtlResult)
  const monthly   = monthlyResult.status === 'fulfilled' ? monthlyResult.value : null
  const today     = todayResult.status === 'fulfilled' ? todayResult.value : null

  // TTL semantics: -2 = key does not exist, -1 = no expiry, ≥0 = seconds remaining
  const cacheStatus = (ttl: number | null) => {
    if (ttl === null)  return { hit: false, ttl_remaining_s: null,  note: 'redis_error' }
    if (ttl === -2)    return { hit: false, ttl_remaining_s: null,  note: 'miss'        }
    if (ttl === -1)    return { hit: true,  ttl_remaining_s: null,  note: 'no_expiry'   }
    return              { hit: true,  ttl_remaining_s: ttl,   note: 'hit'          }
  }

  const fraudCountersEnabled = process.env.REDIS_COUNTERS_ENABLED === 'true'

  return res.status(200).json({
    status:  'connected',
    namespaces: {
      org:   { ...cacheStatus(orgTtl),   ttl_max_s: 60,   key: `gnx:org:${orgId}`                         },
      rules: { ...cacheStatus(rulesTtl), ttl_max_s: 60,   key: `gnx:rules:${orgId}`                       },
    },
    fraud_counters_enabled: fraudCountersEnabled,
    today,
    monthly_events: monthly !== null ? Number(monthly) : null,
    generated_at: new Date().toISOString(),
  })
}
