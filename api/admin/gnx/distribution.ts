/**
 * GET /api/admin/gnx/distribution?days=30&version=v2
 *
 * GNX Fraud Score™ distribution histogram for the authenticated org.
 *
 * Response:
 *   bands[]         — 10 score bands (0-99 … 900-1000) with count + percentage
 *   risk_bands      — aggregated low/review/high counts + percentages
 *   percentiles     — p50, p75, p90, p95, p99
 *   total           — total events with a gnx_score in the period
 *   health          — distribution health assessment
 *   version_counts  — breakdown by gnx_version
 *   period_days     — requested period
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient }                       from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const BAND_RANGES = [
  { label: '0-99',   min: 0,   max: 99   },
  { label: '100-199',min: 100, max: 199  },
  { label: '200-299',min: 200, max: 299  },
  { label: '300-399',min: 300, max: 399  },
  { label: '400-499',min: 400, max: 499  },
  { label: '500-599',min: 500, max: 599  },
  { label: '600-699',min: 600, max: 699  },
  { label: '700-799',min: 700, max: 799  },
  { label: '800-899',min: 800, max: 899  },
  { label: '900-1000',min: 900, max: 1000},
]

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
  const days    = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30))
  const version = req.query.version ? String(req.query.version) : undefined
  const since   = new Date(Date.now() - days * 86_400_000).toISOString()

  // ── Fetch events with gnx_score ───────────────────────────────────────────
  let query = supabase
    .from('risk_events')
    .select('gnx_score, gnx_version, decision')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .not('gnx_score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (version) query = query.eq('gnx_version', version)

  const { data: events, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const scores = (events ?? []).map(e => e.gnx_score as number)
  const total  = scores.length

  if (total === 0) {
    return res.status(200).json({
      bands:         BAND_RANGES.map(b => ({ ...b, count: 0, percentage: 0 })),
      risk_bands:    { low: 0, review: 0, high: 0, low_pct: 0, review_pct: 0, high_pct: 0 },
      percentiles:   { p50: null, p75: null, p90: null, p95: null, p99: null },
      total:         0,
      health:        { status: 'no_data', issues: [] },
      version_counts:{},
      period_days:   days,
    })
  }

  // ── Distribution Bands ────────────────────────────────────────────────────
  const bandCounts = BAND_RANGES.map(b => {
    const count = scores.filter(s => s >= b.min && s <= b.max).length
    return { label: b.label, min: b.min, max: b.max, count, percentage: Math.round(count / total * 1000) / 10 }
  })

  // ── Risk Bands ────────────────────────────────────────────────────────────
  const low    = scores.filter(s => s <= 300).length
  const review = scores.filter(s => s > 300 && s <= 700).length
  const high   = scores.filter(s => s > 700).length
  const pct    = (n: number) => Math.round(n / total * 1000) / 10

  // ── Percentiles ───────────────────────────────────────────────────────────
  const sorted = [...scores].sort((a, b) => a - b)
  const ptile  = (p: number) => sorted[Math.floor(p * (total - 1))] ?? null

  // ── Version Counts ────────────────────────────────────────────────────────
  const versionCounts: Record<string, number> = {}
  for (const e of events ?? []) {
    const v = (e.gnx_version as string) ?? 'unknown'
    versionCounts[v] = (versionCounts[v] ?? 0) + 1
  }

  // ── Health Assessment ─────────────────────────────────────────────────────
  const issues: string[] = []
  const lowPct    = pct(low)
  const reviewPct = pct(review)
  const highPct   = pct(high)

  if (lowPct < 60) issues.push(`LOW band too small (${lowPct}% — target ≥80%). Score may be too aggressive.`)
  if (highPct > 15) issues.push(`HIGH band too large (${highPct}% — target ≤5%). Score may be over-triggering.`)
  if (reviewPct > 30) issues.push(`REVIEW band too large (${reviewPct}% — target ≤15%). Consider tightening thresholds.`)

  const emptyBands = bandCounts.filter(b => b.count === 0).map(b => b.label)
  if (emptyBands.length > 0) issues.push(`Empty score ranges: ${emptyBands.join(', ')}. Distribution may be bimodal.`)

  const p95val = ptile(0.95) ?? 0
  if (p95val < 200) issues.push(`p95 score is only ${p95val}. Most events score very low — consider recalibrating weights.`)

  const health = {
    status: issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'warning' : 'critical',
    issues,
    targets: { low_pct: '~80%', review_pct: '~15%', high_pct: '~5%' },
    actual:  { low_pct: `${lowPct}%`, review_pct: `${reviewPct}%`, high_pct: `${highPct}%` },
  }

  return res.status(200).json({
    bands:      bandCounts,
    risk_bands: {
      low,    review,    high,
      low_pct: lowPct, review_pct: reviewPct, high_pct: highPct,
    },
    percentiles: {
      p50: ptile(0.50),
      p75: ptile(0.75),
      p90: ptile(0.90),
      p95: ptile(0.95),
      p99: ptile(0.99),
    },
    total,
    health,
    version_counts: versionCounts,
    period_days:    days,
  })
}
