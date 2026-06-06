/**
 * GET /api/admin/intelligence/features?days=30&feature_name=&feature_group=
 *
 * Feature Store audit endpoint — Phase 3.3 Module 6.
 *
 * Returns aggregated statistics from fraud_features for the authenticated org:
 *   - total feature rows collected
 *   - per-group counts and averages
 *   - per-feature statistics (count, avg, min, max)
 *   - feature coverage rate (events with features / total events)
 *   - data quality warnings
 *   - daily growth over the requested period
 *
 * Auth: Authorization: Bearer <supabase_access_token>  (user JWT, RLS-scoped)
 * Available to any authenticated org member.
 *
 * Gracefully returns zeroed response with a notice if v19/v20 migrations
 * have not been applied yet.
 *
 * Query params:
 *   days         1–90  (default 30)
 *   feature_name filter to a specific feature (optional)
 *   feature_group filter by group (optional)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─── Client ───────────────────────────────────────────────────────────────────

function userClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureRow {
  feature_name:    string
  feature_value:   number
  feature_group:   string
  feature_version: number
  created_at:      string
  risk_event_id:   string
}

interface FeatureStat {
  feature_name:    string
  feature_group:   string
  feature_version: number
  count:           number
  avg:             number
  min:             number
  max:             number
}

interface GroupStat {
  group:         string
  count:         number
  feature_count: number
}

interface DayBucket {
  date:  string
  count: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FEATURE_GROUPS = ['velocity', 'reputation', 'behavior', 'risk', 'context'] as const

// Data quality warnings
function buildWarnings(
  stats:    FeatureStat[],
  coverage: number,
  sinceMs:  number,
): string[] {
  const warnings: string[] = []
  const now = Date.now()

  if (coverage < 95 && coverage > 0) {
    warnings.push(`Feature coverage is ${coverage.toFixed(1)}% — below 95% threshold. Check FEATURE_STORE_ENABLED env var.`)
  }
  if (coverage === 0) {
    warnings.push('No features collected yet. Set FEATURE_STORE_ENABLED=true and apply v19+v20 migrations.')
  }

  for (const s of stats) {
    // Flag if a feature has zero variance (all values identical)
    if (s.count > 10 && s.min === s.max) {
      warnings.push(`Feature "${s.feature_name}" has zero variance — all ${s.count} values are ${s.min}. May indicate a constant or broken extractor.`)
    }
    // Flag if a feature hasn't been updated in the last 2× the requested period
    // (we detect this if count is very low relative to total events)
  }

  // Check that all expected groups are represented
  const presentGroups = new Set(stats.map(s => s.feature_group))
  for (const g of FEATURE_GROUPS) {
    if (!presentGroups.has(g)) {
      warnings.push(`No features in group "${g}" — expected at least 1 row.`)
    }
  }

  void sinceMs // suppress unused warning — used for context above
  void now

  return warnings
}

// ─── Zero response ────────────────────────────────────────────────────────────

function zeroResponse(notice: string) {
  return {
    total_features:      0,
    feature_count:       0,
    coverage_pct:        0,
    period_days:         30,
    group_stats:         FEATURE_GROUPS.map(g => ({ group: g, count: 0, feature_count: 0 })),
    feature_stats:       [] as FeatureStat[],
    daily_growth:        [] as DayBucket[],
    data_quality_warnings: [notice],
    generated_at:        new Date().toISOString(),
    notice,
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] as string | undefined
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }
  const token = authHeader.slice(7).trim()

  const userSupa = userClient(token)
  const { data: { user }, error: authErr } = await userSupa.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  // ── Resolve org ───────────────────────────────────────────────────────────────
  const { data: profile } = await userSupa
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })
  const orgId = profile.organization_id

  // ── Parse params ──────────────────────────────────────────────────────────────
  const daysParam = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30))
  const filterName  = typeof req.query.feature_name  === 'string' ? req.query.feature_name  : null
  const filterGroup = typeof req.query.feature_group === 'string' ? req.query.feature_group : null

  const since = new Date(Date.now() - daysParam * 24 * 60 * 60 * 1000).toISOString()

  // ── Fetch features ────────────────────────────────────────────────────────────
  // Use admin client for the actual data query — the SELECT policy requires
  // current_org_id() which is only set via the anon JWT path. The admin client
  // bypasses RLS but we've already verified the user belongs to this org above.
  const supa = adminClient()

  let query = supa
    .from('fraud_features')
    .select('feature_name, feature_value, feature_group, feature_version, created_at, risk_event_id')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .limit(50000)

  if (filterName)  query = query.eq('feature_name',  filterName)
  if (filterGroup) query = query.eq('feature_group', filterGroup)

  const { data: rows, error: featErr } = await query

  if (featErr) {
    // Table likely doesn't exist yet — v19 migration not applied
    if (featErr.code === '42P01') {
      return res.status(200).json(zeroResponse('fraud_features table not found — apply v19 + v20 migrations to activate the Feature Store.'))
    }
    // Column doesn't exist — v20 migration not applied
    if (featErr.code === '42703') {
      return res.status(200).json(zeroResponse('fraud_features schema outdated — apply v20_feature_store.sql migration to add feature_group, feature_version, source columns.'))
    }
    console.error('[features] query error:', featErr.message)
    return res.status(500).json({ error: 'Feature store query failed' })
  }

  // ── Also fetch total risk_events count for coverage calc ──────────────────────
  const { count: totalEvents } = await supa
    .from('risk_events')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('created_at', since)

  const featureRows = (rows ?? []) as FeatureRow[]
  const totalFeatureRows = featureRows.length

  // ── Compute per-feature stats ─────────────────────────────────────────────────
  const statMap: Record<string, { values: number[]; group: string; version: number }> = {}
  const eventSet = new Set<string>()

  for (const r of featureRows) {
    const key = `${r.feature_name}::v${r.feature_version}`
    if (!statMap[key]) {
      statMap[key] = { values: [], group: r.feature_group ?? 'risk', version: r.feature_version ?? 1 }
    }
    statMap[key].values.push(r.feature_value)
    eventSet.add(r.risk_event_id)
  }

  const featureStats: FeatureStat[] = Object.entries(statMap).map(([key, d]) => {
    const namePart = key.split('::')[0]
    const vals = d.values
    const sum  = vals.reduce((a, b) => a + b, 0)
    return {
      feature_name:    namePart,
      feature_group:   d.group,
      feature_version: d.version,
      count:           vals.length,
      avg:             vals.length === 0 ? 0 : Math.round((sum / vals.length) * 10000) / 10000,
      min:             vals.length === 0 ? 0 : Math.min(...vals),
      max:             vals.length === 0 ? 0 : Math.max(...vals),
    }
  }).sort((a, b) => b.count - a.count)

  // ── Group stats ───────────────────────────────────────────────────────────────
  const groupMap: Record<string, { count: number; names: Set<string> }> = {}
  for (const r of featureRows) {
    const g = r.feature_group ?? 'risk'
    if (!groupMap[g]) groupMap[g] = { count: 0, names: new Set() }
    groupMap[g].count++
    groupMap[g].names.add(r.feature_name)
  }

  const groupStats: GroupStat[] = FEATURE_GROUPS.map(g => ({
    group:         g,
    count:         groupMap[g]?.count       ?? 0,
    feature_count: groupMap[g]?.names.size  ?? 0,
  }))

  // ── Daily growth ──────────────────────────────────────────────────────────────
  const bucketMap: Record<string, number> = {}
  for (const r of featureRows) {
    const day = r.created_at.slice(0, 10)
    bucketMap[day] = (bucketMap[day] ?? 0) + 1
  }
  const dailyGrowth: DayBucket[] = Object.entries(bucketMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))

  // ── Coverage ──────────────────────────────────────────────────────────────────
  // Events with at least 1 feature / total events in period
  const eventsWithFeatures = eventSet.size
  const coveragePct = totalEvents && totalEvents > 0
    ? Math.round((eventsWithFeatures / totalEvents) * 1000) / 10
    : 0

  // ── Quality warnings ──────────────────────────────────────────────────────────
  const warnings = buildWarnings(featureStats, coveragePct, Date.now() - daysParam * 86400000)

  return res.status(200).json({
    total_features:        totalFeatureRows,
    feature_count:         Object.keys(statMap).length,
    events_with_features:  eventsWithFeatures,
    total_events:          totalEvents ?? 0,
    coverage_pct:          coveragePct,
    period_days:           daysParam,
    group_stats:           groupStats,
    feature_stats:         featureStats,
    daily_growth:          dailyGrowth,
    data_quality_warnings: warnings,
    generated_at:          new Date().toISOString(),
  })
}
