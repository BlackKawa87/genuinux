/**
 * POST /api/risk/label
 *
 * Client-facing endpoint — receives ground-truth labels from customers' backends.
 * Auth: Authorization: Bearer <api_key> (same as /api/risk/check).
 *
 * Body:
 *   event_id  string  — risk_event.id (UUID)
 *   label     string  — confirmed_fraud | suspected_fraud | false_positive | legitimate
 *   notes?    string  — optional free-text context
 *
 * Writes to fraud_labels.
 * Fire-and-forget: updates entity_reputation for IP, device, email.
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

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── 1. Auth — API key ─────────────────────────────────────────────────────
  const rawKey = extractBearer(req.headers['authorization'] as string | undefined)
  if (!rawKey) {
    return res.status(401).json({ error: 'Authorization: Bearer <api_key> required' })
  }

  const supabase = adminClient()
  const keyHash  = hashKey(rawKey)

  // Redis cache (same as check.ts)
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

  const orgId = apiKey!.organization_id

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

  // ── 3. Insert fraud_label ─────────────────────────────────────────────────
  const { data: labelRow, error: insertErr } = await supabase
    .from('fraud_labels')
    .insert({
      organization_id: orgId,
      risk_event_id:   eventId.trim(),
      label,
      notes:           notes ?? null,
    })
    .select('id, risk_event_id, label, created_at')
    .single()

  if (insertErr) {
    captureException(insertErr, { context: 'risk/label: fraud_labels insert', orgId, eventId })
    return res.status(500).json({ error: 'Failed to save label', details: insertErr.message })
  }

  const row = labelRow as { id: string; risk_event_id: string; label: string; created_at: string }

  // ── 4. Respond immediately ────────────────────────────────────────────────
  res.status(201).json({
    label_id:  row.id,
    event_id:  row.risk_event_id,
    label:     row.label,
    created_at: row.created_at,
    message:   'Label recorded. Entity reputation will be updated asynchronously.',
  })

  // ── 5. Fire-and-forget: update entity_reputation ─────────────────────────
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
