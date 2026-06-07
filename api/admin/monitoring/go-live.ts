/**
 * GET /api/admin/monitoring/go-live
 *
 * Post-Go Live operational health snapshot.
 * Single endpoint aggregates all monitoring signals for the GoLive tab.
 *
 * Returns:
 *   api_health     — risk_events last 24h: total, decision breakdown, today Redis stats
 *   latency        — avg_latency_ms today (Redis) + 7-day trend (org_daily_stats)
 *   gnx_health     — v2 coverage, null rate, score band distribution
 *   redis_health   — connected, fraud_counters_enabled, context_path
 *   sentry_enabled — whether SENTRY_DSN is configured
 *   slow_count_24h — count of risk.check.slow audit_log entries in last 24h
 *   go_live_status — 'healthy' | 'warning' | 'critical' with reasons[]
 *
 * Auth: Bearer <supabase_access_token> (owner only)
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedisClient } from '../../_lib/redisClient.js'
import { getTodayStats }  from '../../_lib/orgStats.js'

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

  const orgId   = profile.organization_id as string
  const supa    = createClient(supabaseUrl, serviceKey)
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const since7d  = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString().split('T')[0]

  const [eventsRes, gnxNullRes, gnxV2Res, dailyStatsRes, todayStatsRes, slowCountRes] =
    await Promise.allSettled([
      // Events last 24h — lightweight: only decision + gnx fields
      supa.from('risk_events')
        .select('decision, gnx_score, gnx_version')
        .eq('organization_id', orgId)
        .gte('created_at', since24h)
        .limit(10_000),

      // GNX null count last 24h
      supa.from('risk_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', since24h)
        .is('gnx_score', null),

      // GNX v2 count last 24h
      supa.from('risk_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', since24h)
        .eq('gnx_version', 'v2'),

      // 7-day latency trend from org_daily_stats (v17 migration)
      supa.from('org_daily_stats')
        .select('date, total_requests, avg_latency_ms')
        .eq('organization_id', orgId)
        .gte('date', since7d)
        .order('date', { ascending: false }),

      // Redis today stats
      getTodayStats(orgId),

      // Slow request count last 24h from audit_logs
      supa.from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('event_type', 'risk.check.slow')
        .gte('created_at', since24h),
    ])

  // ── Events ────────────────────────────────────────────────────────────────────
  type EventRow = { decision: string; gnx_score: number | null; gnx_version: string | null }
  const events: EventRow[] = eventsRes.status === 'fulfilled' && !eventsRes.value.error
    ? (eventsRes.value.data ?? []) as EventRow[]
    : []

  const total24h    = events.length
  const approveCount = events.filter(e => e.decision === 'allow' || e.decision === 'approve').length
  const reviewCount  = events.filter(e => e.decision === 'review').length
  const blockCount   = events.filter(e => e.decision === 'block').length

  const gnxNullCount = gnxNullRes.status === 'fulfilled' ? (gnxNullRes.value.count ?? 0) : 0
  const gnxV2Count   = gnxV2Res.status  === 'fulfilled' ? (gnxV2Res.value.count  ?? 0) : 0
  const gnxNullRate  = total24h > 0 ? gnxNullCount / total24h : 0

  // GNX score bands
  const bandLow    = events.filter(e => e.gnx_score !== null && e.gnx_score <= 300).length
  const bandReview = events.filter(e => e.gnx_score !== null && e.gnx_score > 300 && e.gnx_score <= 700).length
  const bandHigh   = events.filter(e => e.gnx_score !== null && e.gnx_score > 700).length

  // ── Latency ───────────────────────────────────────────────────────────────────
  const today = todayStatsRes.status === 'fulfilled' ? todayStatsRes.value : null
  type DailyRow = { date: string; total_requests: number; avg_latency_ms: number | null }
  const dailyStats: DailyRow[] = dailyStatsRes.status === 'fulfilled' && !('error' in dailyStatsRes.value && dailyStatsRes.value.error)
    ? (dailyStatsRes.value.data ?? []) as DailyRow[]
    : []

  // ── Redis ─────────────────────────────────────────────────────────────────────
  const redis                = getRedisClient()
  const redisConnected       = redis !== null
  const fraudCountersEnabled = process.env.REDIS_COUNTERS_ENABLED === 'true'
  const contextPath          = fraudCountersEnabled ? 'redis' : 'rpc'

  // ── Sentry ───────────────────────────────────────────────────────────────────
  const sentryEnabled = !!process.env.SENTRY_DSN
  const slowCount24h  = slowCountRes.status === 'fulfilled' ? (slowCountRes.value.count ?? 0) : null

  // ── Go Live Status ────────────────────────────────────────────────────────────
  const avgLatencyToday = today?.avg_latency_ms ?? null
  const reasons: string[] = []
  let statusLevel: 'healthy' | 'warning' | 'critical' = 'healthy'

  const escalate = (to: 'warning' | 'critical') => {
    if (to === 'critical') { statusLevel = 'critical'; return }
    if (statusLevel !== 'critical') statusLevel = 'warning'
  }

  // Critical gates
  if (!redisConnected) {
    escalate('critical')
    reasons.push('Redis disconnected — rate limiting and caching degraded')
  }
  if (gnxNullRate > 0.05) {
    escalate('critical')
    reasons.push(`GNX null rate ${Math.round(gnxNullRate * 100)}% exceeds 5% threshold`)
  }
  if (avgLatencyToday !== null && avgLatencyToday >= 1500) {
    escalate('critical')
    reasons.push(`Avg latency ${Math.round(avgLatencyToday)}ms ≥ 1500ms`)
  }

  // Warning gates
  if (gnxNullRate > 0 && gnxNullRate <= 0.05) {
    escalate('warning')
    reasons.push(`GNX null rate ${(gnxNullRate * 100).toFixed(1)}% — some events missing score`)
  }
  if (!fraudCountersEnabled && redisConnected) {
    escalate('warning')
    reasons.push('REDIS_COUNTERS_ENABLED not active — context via RPC (~500ms vs ~10ms)')
  }
  if (avgLatencyToday !== null && avgLatencyToday >= 800 && avgLatencyToday < 1500) {
    escalate('warning')
    reasons.push(`Avg latency ${Math.round(avgLatencyToday)}ms ≥ 800ms`)
  }
  if ((slowCount24h ?? 0) > 10) {
    escalate('warning')
    reasons.push(`${slowCount24h} slow requests (>1000ms) in last 24h`)
  }

  if (reasons.length === 0) reasons.push('All gates passing. System nominal.')

  return res.status(200).json({
    api_health: {
      total_24h:   total24h,
      approve:     approveCount,
      review:      reviewCount,
      block:       blockCount,
      today_redis: today,
    },
    latency: {
      avg_ms_today: avgLatencyToday,
      trend_7d:     dailyStats.map(d => ({ date: d.date, avg_ms: d.avg_latency_ms, requests: d.total_requests })),
      note:         'Percentile data (p50/p95/p99/max) available via load-test.mjs — not stored per-request',
    },
    gnx_health: {
      total_24h:    total24h,
      v2_count:     gnxV2Count,
      v2_rate_pct:  total24h > 0 ? Math.round((gnxV2Count / total24h) * 1000) / 10 : null,
      null_count:   gnxNullCount,
      null_rate_pct: Math.round(gnxNullRate * 1000) / 10,
      distribution: { low: bandLow, review: bandReview, high: bandHigh },
    },
    redis_health: {
      connected:              redisConnected,
      fraud_counters_enabled: fraudCountersEnabled,
      context_path:           contextPath,
    },
    sentry_enabled:  sentryEnabled,
    slow_count_24h:  slowCount24h,
    go_live_status: {
      status:  statusLevel,
      reasons,
    },
    generated_at: new Date().toISOString(),
  })
}
