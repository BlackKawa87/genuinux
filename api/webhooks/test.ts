/**
 * POST /api/webhooks/test
 *
 * Sends a test risk.check.completed payload to a registered webhook.
 * Auth: Supabase JWT in Authorization: Bearer <access_token>.
 * Body: { webhook_id: string }
 */

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const TIMEOUT_MS = 10_000

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  return createClient(url, key)
}

function signPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = adminClient()

  // ── Auth: validate Supabase JWT ────────────────────────────
  const authHeader = req.headers['authorization']
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null

  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired session' })

  // ── Resolve org ────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  const orgId = profile?.organization_id as string | undefined
  if (!orgId) return res.status(403).json({ error: 'No organization linked to account' })

  // ── Validate body ──────────────────────────────────────────
  const body = req.body as Record<string, unknown>
  if (!body?.webhook_id || typeof body.webhook_id !== 'string') {
    return res.status(400).json({ error: 'webhook_id is required' })
  }

  // ── Fetch webhook (must belong to org) ────────────────────
  const { data: webhook } = await supabase
    .from('webhooks')
    .select('id, endpoint_url, secret')
    .eq('id', body.webhook_id)
    .eq('organization_id', orgId)
    .single()

  if (!webhook) return res.status(404).json({ error: 'Webhook not found' })

  // ── Build test payload ─────────────────────────────────────
  const timestamp  = Math.floor(Date.now() / 1000).toString()
  const payloadObj = {
    event:            'risk.check.completed',
    test:             true,
    event_id:         `evt_test_${Date.now()}`,
    external_user_id: 'test_user_001',
    event_type:       'signup',
    trust_score:      82,
    fraud_score:      18,
    risk_level:       'low',
    decision:         'approve',
    applied_rule:     null,
    signals:          [],
    summary:          'Test delivery from Genuinux dashboard.',
    created_at:       new Date().toISOString(),
  }
  const payload   = JSON.stringify(payloadObj)
  const signature = signPayload(webhook.secret as string, payload)
  const start     = Date.now()

  try {
    const response = await fetch(webhook.endpoint_url as string, {
      method: 'POST',
      headers: {
        'Content-Type':          'application/json',
        'X-Genuinux-Signature':  `sha256=${signature}`,
        'X-Genuinux-Event':      'risk.check.completed',
        'X-Genuinux-Timestamp':  timestamp,
        'User-Agent':            'Genuinux-Webhook/1.0',
        'X-Genuinux-Test':       'true',
      },
      body: payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const duration     = Date.now() - start
    const responseBody = await response.text().catch(() => '')
    const status       = response.ok ? 'success' : 'failed'

    void supabase.from('webhook_deliveries').insert({
      webhook_id:      webhook.id,
      organization_id: orgId,
      event_type:      'risk.check.completed',
      payload_json:    payloadObj,
      response_status: response.status,
      response_body:   responseBody.slice(0, 500),
      duration_ms:     duration,
      delivery_status: status,
      success:         response.ok,
    })
    void supabase.from('webhooks').update({
      last_delivery_status: status,
      last_delivery_at:     new Date().toISOString(),
    }).eq('id', webhook.id)

    return res.status(200).json({
      success:     response.ok,
      status:      response.status,
      duration_ms: duration,
    })
  } catch (err) {
    const duration = Date.now() - start
    const message  = err instanceof Error ? err.message : 'Unknown error'

    void supabase.from('webhook_deliveries').insert({
      webhook_id:      webhook.id,
      organization_id: orgId,
      event_type:      'risk.check.completed',
      payload_json:    payloadObj,
      response_body:   message,
      duration_ms:     duration,
      delivery_status: 'failed',
      success:         false,
    })
    void supabase.from('webhooks').update({
      last_delivery_status: 'failed',
      last_delivery_at:     new Date().toISOString(),
    }).eq('id', webhook.id)

    return res.status(200).json({
      success:     false,
      status:      null,
      duration_ms: duration,
      error:       message,
    })
  }
}
