/**
 * GET /api/admin/gnx/details?event_id=<uuid>
 *
 * GNX Fraud Score™ per-event breakdown for the authenticated org.
 *
 * Returns the full factor breakdown stored in gnx_score_factors,
 * grouped by category with weight annotations and impact contributions.
 *
 * Response:
 *   event_id         — risk_event.id
 *   gnx_score        — final 0–1000 score
 *   gnx_version      — formula version used
 *   risk_band        — 'low' | 'review' | 'high'
 *   top_factors[]    — all factors sorted by |impact| desc
 *   by_group         — factors aggregated by group
 *   context          — event metadata (fraud_score, trust_score, decision, created_at)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient }                       from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

function gnxScoreBand(score: number): 'low' | 'review' | 'high' {
  if (score >= 701) return 'high'
  if (score >= 301) return 'review'
  return 'low'
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

  // ── Param ─────────────────────────────────────────────────────────────────
  const eventId = String(req.query.event_id ?? '').trim()
  if (!eventId) return res.status(400).json({ error: 'event_id is required' })

  // ── Fetch event ───────────────────────────────────────────────────────────
  const { data: event, error } = await supabase
    .from('risk_events')
    .select('id, gnx_score, gnx_score_factors, gnx_version, fraud_score, trust_score, decision, risk_level, created_at')
    .eq('id', eventId)
    .eq('organization_id', orgId)
    .single()

  if (error || !event) return res.status(404).json({ error: 'Event not found' })

  const score   = event.gnx_score as number | null
  const factors = event.gnx_score_factors as Array<{
    feature: string; group: string; weight: number; raw: number; impact: number
  }> | null

  if (score == null) {
    return res.status(404).json({ error: 'GNX score not yet computed for this event' })
  }

  // ── Aggregate by group ────────────────────────────────────────────────────
  type GroupSummary = { group: string; total_impact: number; factors: typeof factors }
  const byGroup: Record<string, GroupSummary> = {}

  for (const f of factors ?? []) {
    if (!byGroup[f.group]) {
      byGroup[f.group] = { group: f.group, total_impact: 0, factors: [] }
    }
    byGroup[f.group].total_impact += f.impact
    byGroup[f.group].factors!.push(f)
  }

  return res.status(200).json({
    event_id:    event.id,
    gnx_score:   score,
    gnx_version: event.gnx_version ?? 'unknown',
    risk_band:   gnxScoreBand(score),
    top_factors: factors ?? [],
    by_group:    Object.values(byGroup).sort((a, b) => Math.abs(b.total_impact) - Math.abs(a.total_impact)),
    context: {
      fraud_score: event.fraud_score,
      trust_score: event.trust_score,
      decision:    event.decision,
      risk_level:  event.risk_level,
      created_at:  event.created_at,
    },
  })
}
