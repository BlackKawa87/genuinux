/**
 * GET /api/admin/metrics/per-org?days=30
 *
 * Owner-only endpoint — returns daily stats for the authenticated owner's
 * organization over the last N days (default 30, max 90).
 *
 * Data sources:
 *   - Postgres org_daily_stats (historical, populated nightly by maintenance cron)
 *   - Redis gnx:stats:{orgId}:{today} hash (today's real-time counter)
 *
 * Requires v17 migration (org_daily_stats table + aggregate_daily_stats fn).
 * If the table doesn't exist, returns an empty stats array with a notice.
 *
 * Auth: Authorization: Bearer <supabase_access_token> (JWT, role must be owner).
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getTodayStats } from '../../_lib/orgStats.js'

function userClient(accessToken: string) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

interface StatRow {
  date:            string
  total_requests:  number
  approve_count:   number
  review_count:    number
  block_count:     number
  avg_latency_ms:  number | null
  approve_pct:     number
  review_pct:      number
  block_pct:       number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────────
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

  // ── Query params ──────────────────────────────────────────────────────────────
  const rawDays = parseInt((req.query['days'] as string | undefined) ?? '30', 10)
  const days    = Math.min(Math.max(rawDays, 1), 90)
  const since   = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

  // ── Historical stats (org_daily_stats) ────────────────────────────────────────
  let stats: StatRow[] = []
  let notice: string | undefined

  const { data: rows, error: statsErr } = await supabase
    .from('org_daily_stats')
    .select('date, total_requests, approve_count, review_count, block_count, avg_latency_ms')
    .eq('organization_id', orgId)
    .gte('date', since)
    .order('date', { ascending: false })

  if (statsErr) {
    // Table missing = v17 migration not yet applied
    if (statsErr.code === '42P01' || statsErr.message?.includes('does not exist')) {
      notice = 'v17 migration not yet applied — run supabase/migrations/v17_org_daily_stats.sql'
    } else {
      return res.status(500).json({ error: statsErr.message })
    }
  } else {
    stats = (rows ?? []).map(r => {
      const total = r.total_requests || 0
      return {
        date:           r.date as string,
        total_requests: total,
        approve_count:  r.approve_count  || 0,
        review_count:   r.review_count   || 0,
        block_count:    r.block_count    || 0,
        avg_latency_ms: r.avg_latency_ms as number | null,
        approve_pct:    total > 0 ? Math.round((r.approve_count  / total) * 100) : 0,
        review_pct:     total > 0 ? Math.round((r.review_count   / total) * 100) : 0,
        block_pct:      total > 0 ? Math.round((r.block_count    / total) * 100) : 0,
      }
    })
  }

  // ── Today's real-time stats (Redis) ───────────────────────────────────────────
  const today = await getTodayStats(orgId)

  // ── 30-day summary ────────────────────────────────────────────────────────────
  const total30d   = stats.reduce((sum, r) => sum + r.total_requests, 0)
  const avgDaily   = stats.length > 0 ? Math.round(total30d / stats.length) : 0
  const peakDay    = stats.reduce<StatRow | null>(
    (best, r) => (!best || r.total_requests > best.total_requests) ? r : best,
    null,
  )

  return res.status(200).json({
    org_id:       orgId,
    window_days:  days,
    stats,
    today: today
      ? {
          total:       today.total,
          approve:     today.approve,
          review:      today.review,
          block:       today.block,
          approve_pct: today.total > 0 ? Math.round((today.approve / today.total) * 100) : 0,
          review_pct:  today.total > 0 ? Math.round((today.review  / today.total) * 100) : 0,
          block_pct:   today.total > 0 ? Math.round((today.block   / today.total) * 100) : 0,
          avg_latency_ms: today.avg_latency,
        }
      : null,
    summary: {
      total_requests:  total30d,
      avg_daily:       avgDaily,
      peak_day:        peakDay?.date ?? null,
      peak_requests:   peakDay?.total_requests ?? 0,
    },
    generated_at: new Date().toISOString(),
    ...(notice ? { notice } : {}),
  })
}
