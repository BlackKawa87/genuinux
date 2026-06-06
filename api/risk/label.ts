/**
 * POST /api/risk/label
 *
 * Dual-auth endpoint for ground-truth fraud labels.
 * Auth: Authorization: Bearer <api_key>  — client backends (hex, no dots)
 *       Authorization: Bearer <jwt>       — dashboard users (Supabase session token)
 *
 * Body:
 *   event_id  string  — risk_event.id (UUID)
 *   label     string  — confirmed_fraud | suspected_fraud | false_positive | legitimate
 *   notes?    string  — optional free-text context
 *
 * Writes to fraud_labels.
 * Fire-and-forget: builds training dataset row + updates entity_reputation.
 *
 * These labels form the ground-truth dataset for Phase 3 ML training
 * (Module 6). Activation threshold: 10,000 labels collected.
 */

import crypto from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getCachedApiKey, setCachedApiKey } from '../_lib/keyCache.js'
import { updateEntityReputation, type LabelValue } from '../_lib/reputationNetwork.js'
import { captureException } from '../_lib/monitoring.js'
import { buildTrainingDataset } from '../_lib/datasetBuilder.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_LABELS = new Set<string>([
  'confirmed_fraud', 'suspected_fraud', 'false_positive', 'legitimate',
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null

function adminClient(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  _supabase = createClient(url, key)
  return _supabase
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const t = authHeader.slice(7).trim()
  return t.length > 0 ? t : null
}

// JWTs are base64url.base64url.base64url — exactly 2 dots.
// API keys are hex strings — no dots.
function isJwt(token: string): boolean {
  return (token.match(/\./g) ?? []).length === 2
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── 1. Auth — dual mode (API key or dashboard JWT) ────────────────────────
  const rawKey = extractBearer(req.headers['authorization'] as string | undefined)
  if (!rawKey) {
    return res.status(401).json({ error: 'Authorization: Bearer <api_key|jwt> required' })
  }

  const supabase = adminClient()
  let orgId: string

  if (isJwt(rawKey)) {
    // Dashboard user path — resolve org via Supabase JWT
    const url    = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
    const anon   = process.env.VITE_SUPABASE_ANON_KEY ?? ''
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${rawKey}` } },
      auth:   { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()
    if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })
    orgId = profile.organization_id as string
  } else {
    // API key path (client backends) — Redis cache then DB lookup
    const keyHash = hashKey(rawKey)
    let apiKey = await getCachedApiKey(keyHash)
    if (!apiKey) {
      const { data } = await supabase
        .from('api_keys')
        .select('id, organization_id, name, requests_count')
        .eq('key_hash', keyHash)
        .eq('status', 'active')
        .single()
      if (!data) return res.status(401).json({ error: 'Invalid or revoked API key' })
      apiKey = data as typeof apiKey
      void setCachedApiKey(keyHash, apiKey!)
    }
    orgId = apiKey!.organization_id
  }

  // ── 2. Validate payload ───────────────────────────────────────────────────
  const body = req.body as Record<string, unknown> | null | undefined

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object' })
  }

  const eventId = body['event_id']
  const label   = body['label']
  const notes   = body['notes']

  if (typeof eventId !== 'string' || !eventId.trim()) {
    return res.status(400).json({ error: 'event_id is required' })
  }

  if (typeof label !== 'string' || !VALID_LABELS.has(label)) {
    return res.status(400).json({
      error: `label must be one of: ${[...VALID_LABELS].join(', ')}`,
    })
  }

  if (notes !== undefined && typeof notes !== 'string') {
    return res.status(400).json({ error: 'notes must be a string if provided' })
  }

  // ── 3. Upsert fraud_label (one label per event — unique constraint enforced) ──
  const { data: labelRow, error: upsertErr } = await supabase
    .from('fraud_labels')
    .upsert({
      organization_id: orgId,
      risk_event_id:   eventId.trim(),
      label,
      notes:           notes ?? null,
    }, { onConflict: 'organization_id,risk_event_id' })
    .select('id, risk_event_id, label, created_at')
    .single()

  if (upsertErr) {
    captureException(upsertErr, { context: 'risk/label: fraud_labels upsert', orgId, eventId })
    return res.status(500).json({ error: 'Failed to save label', details: upsertErr.message })
  }

  const row = labelRow as { id: string; risk_event_id: string; label: string; created_at: string }

  // ── 4. Respond immediately ────────────────────────────────────────────────
  res.status(200).json({
    label_id:  row.id,
    event_id:  row.risk_event_id,
    label:     row.label,
    created_at: row.created_at,
    message:   'Label recorded. Entity reputation will be updated asynchronously.',
  })

  // ── 5. Fire-and-forget: Dataset Builder (Phase 3.6) ─────────────────────
  void buildTrainingDataset(supabase, orgId, eventId.trim(), label, row.created_at)

  // ── 6. Fire-and-forget: update entity_reputation ─────────────────────────
  // Fetch the event's entities to update global reputation counters.
  // Query by id alone (no created_at) — scans all partitions, OK for label submission.
  try {
    const { data: event } = await supabase
      .from('risk_events')
      .select('ip_address, device_id, email')
      .eq('id', eventId.trim())
      .maybeSingle()

    if (event) {
      const ev = event as { ip_address: string | null; device_id: string | null; email: string | null }
      void updateEntityReputation(
        supabase,
        { ip: ev.ip_address, device: ev.device_id, email: ev.email },
        label as LabelValue,
      )
    }
  } catch (err) {
    captureException(err, { context: 'risk/label: entity reputation update', orgId, eventId })
  }
}
