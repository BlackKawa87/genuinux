/**
 * GET /api/admin/gnx/evolution?days=30&granularity=daily
 *
 * GNX Fraud Score™ evolution over time for the authenticated org.
 *
 * Params:
 *   days         — lookback window (7–90, default 30)
 *   granularity  — 'daily' | 'weekly' | 'monthly' (default 'daily')
 *   version      — optional gnx_version filter (e.g. 'v2')
 *
 * Response:
 *   buckets[]    — time series with avg/p50/p90/p99/count/band breakdown per bucket
 *   summary      — overall stats for the period
 *   period_days  — requested period
 *   granularity  — as requested
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient }                       from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

function bucketKey(date: Date, granularity: string): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  if (granularity === 'monthly') return `${y}-${m}`
  if (granularity === 'weekly') {
    // ISO week start = Monday
    const day  = date.getUTCDay() || 7
    const mon  = new Date(date)
    mon.setUTCDate(date.getUTCDate() - (day - 1))
    const wy = mon.getUTCFullYear()
    const wm = String(mon.getUTCMonth() + 1).padStart(2, '0')
    const wd = String(mon.getUTCDate()).padStart(2, '0')
    return `${wy}-${wm}-${wd}`
  }
  return `${y}-${m}-${d}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Missing authorization token' })

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!profile) return res.status(403).json({ error: 'No organization' })

  const orgId = profile.organization_id

  // ── Params ────────────────────────────────────────────────────────────────
  const days        = Math.min(90, Math.max(7, parseInt(String(req.query.days ?? '30'), 10) || 30))
  const granularity = ['daily', 'weekly', 'monthly'].includes(String(req.query.granularity))
    ? String(req.query.granularity)
    : 'daily'
  const version = req.query.version ? String(req.query.version) : undefined
  const since   = new Date(Date.now() - days * 86_400_000).toISOString()

  // ── Fetch events ──────────────────────────────────────────────────────────
  let query = supabase
    .from('risk_events')
    .select('gnx_score, gnx_version, created_at, decision')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .not('gnx_score', 'is', null)
    .order('created_at', { ascending: true })
    .limit(10000)

  if (version) query = query.eq('gnx_version', version)

  const { data: events, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  // ── Group by bucket ────────────────────────────────────────────────────────
  type Bucket = {
    key:       string
    scores:    number[]
    low:       number
    review:    number
    high:      number
  }
  const bucketMap: Map<string, Bucket> = new Map()

  for (const e of events ?? []) {
    const score = e.gnx_score as number
    const key   = bucketKey(new Date(e.created_at as string), granularity)

    if (!bucketMap.has(key)) {
      bucketMap.set(key, { key, scores: [], low: 0, review: 0, high: 0 })
    }
    const bucket = bucketMap.get(key)!
    bucket.scores.push(score)
    if (score <= 300)       bucket.low    += 1
    else if (score <= 700)  bucket.review += 1
    else                    bucket.high   += 1
  }

  const ptile = (arr: number[], p: number) => arr[Math.floor(p * (arr.length - 1))] ?? null

  const buckets = [...bucketMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => {
      const sorted = [...b.scores].sort((x, y) => x - y)
      const count  = sorted.length
      const avg    = count ? Math.round(sorted.reduce((s, v) => s + v, 0) / count) : 0
      return {
        date:       key,
        count,
        avg_gnx:    avg,
        p50:        ptile(sorted, 0.50),
        p90:        ptile(sorted, 0.90),
        p99:        ptile(sorted, 0.99),
        low:        b.low,
        review:     b.review,
        high:       b.high,
        low_pct:    count ? Math.round(b.low    / count * 1000) / 10 : 0,
        review_pct: count ? Math.round(b.review / count * 1000) / 10 : 0,
        high_pct:   count ? Math.round(b.high   / count * 1000) / 10 : 0,
      }
    })

  // ── Period Summary ────────────────────────────────────────────────────────
  const allScores = (events ?? []).map(e => e.gnx_score as number).sort((a, b) => a - b)
  const total     = allScores.length
  const low       = allScores.filter(s => s <= 300).length
  const review    = allScores.filter(s => s > 300 && s <= 700).length
  const high      = allScores.filter(s => s > 700).length
  const pct       = (n: number) => total ? Math.round(n / total * 1000) / 10 : 0
  const avgTotal  = total ? Math.round(allScores.reduce((s, v) => s + v, 0) / total) : 0

  const summary = {
    total_events: total,
    avg_gnx:      avgTotal,
    p50:          ptile(allScores, 0.50),
    p75:          ptile(allScores, 0.75),
    p90:          ptile(allScores, 0.90),
    p95:          ptile(allScores, 0.95),
    p99:          ptile(allScores, 0.99),
    low,    low_pct:    pct(low),
    review, review_pct: pct(review),
    high,   high_pct:   pct(high),
  }

  return res.status(200).json({
    buckets,
    summary,
    period_days:  days,
    granularity,
  })
}
