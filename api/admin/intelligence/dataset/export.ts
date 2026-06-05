/**
 * GET /api/admin/intelligence/dataset/export?format=json|csv
 *
 * Training dataset export — Phase 3.6 Module 8.
 *
 * Returns all training_dataset rows for the authenticated org,
 * enriched with a flat feature snapshot (feature values as columns).
 *
 * Formats:
 *   json (default) — array of enriched records
 *   csv            — RFC 4180 CSV with headers
 *
 * Scoped to the authenticated user's org — no cross-org data possible.
 * Max export: 50,000 rows to keep response times reasonable.
 *
 * Auth: Authorization: Bearer <supabase_access_token> (user JWT)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─── Clients ─────────────────────────────────────────────────────────────────

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

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map(r => headers.map(h => csvEscape(r[h])).join(',')),
  ]
  return lines.join('\r\n')
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatasetRow {
  id:              string
  risk_event_id:   string
  label:           string
  decision:        string | null
  fraud_score:     number | null
  trust_score:     number | null
  gnx_score:       number | null
  feature_count:   number
  label_created_at: string | null
  event_created_at: string | null
  dataset_version: number
  created_at:      string
}

interface FeatureRow {
  risk_event_id:  string
  feature_name:   string
  feature_value:  number
  feature_group:  string
  feature_version: number
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] as string | undefined
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }
  const token = authHeader.slice(7).trim()

  const userSupa = userClient(token)
  const { data: { user }, error: authErr } = await userSupa.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await userSupa
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })
  const orgId = profile.organization_id

  const format = String(req.query.format ?? 'json').toLowerCase()
  if (format !== 'json' && format !== 'csv') {
    return res.status(400).json({ error: 'format must be json or csv' })
  }

  const supa = adminClient()

  // ── Fetch training_dataset rows ───────────────────────────────────────────
  const { data: dsData, error: dsErr } = await supa
    .from('training_dataset')
    .select('id, risk_event_id, label, decision, fraud_score, trust_score, gnx_score, feature_count, label_created_at, event_created_at, dataset_version, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50_000)

  if (dsErr) {
    if (dsErr.code === '42P01') {
      return res.status(404).json({
        error: 'training_dataset table not found — apply v21_training_dataset.sql migration first.',
      })
    }
    return res.status(500).json({ error: 'Export failed', details: dsErr.message })
  }

  const dsRows = (dsData ?? []) as DatasetRow[]

  // ── Fetch features for these events (join in-memory) ─────────────────────
  const eventIds = [...new Set(dsRows.map(r => r.risk_event_id))]
  const featureMap: Record<string, Record<string, number>> = {}

  if (eventIds.length > 0) {
    const { data: featData } = await supa
      .from('fraud_features')
      .select('risk_event_id, feature_name, feature_value, feature_group, feature_version')
      .in('risk_event_id', eventIds.slice(0, 1000))  // cap at 1000 events for feature lookup
      .eq('organization_id', orgId)

    const featRows = (featData ?? []) as FeatureRow[]
    for (const f of featRows) {
      if (!featureMap[f.risk_event_id]) featureMap[f.risk_event_id] = {}
      featureMap[f.risk_event_id][f.feature_name] = f.feature_value
    }
  }

  // ── Build enriched rows ───────────────────────────────────────────────────
  // Collect all distinct feature names to create consistent columns
  const allFeatureNames = new Set<string>()
  for (const feats of Object.values(featureMap)) {
    for (const name of Object.keys(feats)) allFeatureNames.add(name)
  }
  const featureNames = [...allFeatureNames].sort()

  const enriched = dsRows.map(r => {
    const feats = featureMap[r.risk_event_id] ?? {}
    const base: Record<string, unknown> = {
      id:               r.id,
      risk_event_id:    r.risk_event_id,
      label:            r.label,
      decision:         r.decision,
      fraud_score:      r.fraud_score,
      trust_score:      r.trust_score,
      gnx_score:        r.gnx_score,
      feature_count:    r.feature_count,
      dataset_version:  r.dataset_version,
      label_created_at: r.label_created_at,
      event_created_at: r.event_created_at,
      created_at:       r.created_at,
    }
    for (const name of featureNames) {
      base[`feat_${name}`] = feats[name] ?? null
    }
    return base
  })

  // ── Respond ───────────────────────────────────────────────────────────────
  const now = new Date().toISOString().slice(0, 10)

  if (format === 'csv') {
    const csv = toCsv(enriched)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="training_dataset_${now}.csv"`)
    return res.status(200).send(csv)
  }

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="training_dataset_${now}.json"`)
  return res.status(200).json({
    total:       enriched.length,
    features:    featureNames,
    exported_at: new Date().toISOString(),
    data:        enriched,
  })
}
