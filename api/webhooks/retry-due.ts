/**
 * POST /api/webhooks/retry-due  — Priority 7: Webhook Retry Worker
 *
 * Processes webhook deliveries scheduled for retry.
 * Called by Vercel Cron every minute (requires Vercel Pro).
 * Can also be triggered manually or by an external scheduler.
 *
 * Retry schedule (from dispatchWebhooks in check.ts):
 *   attempt 1: immediate (in check.ts)
 *   attempt 2: +1 minute  (this endpoint)
 *   attempt 3: +5 minutes (this endpoint)
 *   final:     marked failed, no more retries
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  x-vercel-cron: 1 header
 *       If CRON_SECRET is not set, the endpoint is open (set it in production).
 */

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { captureException } from '../_lib/monitoring.js'

// Delay before each retry attempt (attempt_count is 1-indexed: 1 = first try already done)
const RETRY_DELAYS_MS: Record<number, number> = {
  1: 60_000,    // attempt 2: 1 minute after first failure
  2: 300_000,   // attempt 3: 5 minutes after second failure
}

const DELIVERY_TIMEOUT_MS = 8_000
const MAX_PER_RUN         = 50

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function signPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

function isAuthorized(req: VercelRequest): boolean {
  // Vercel Cron requests carry this header automatically
  if (req.headers['x-vercel-cron'] === '1') return true

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // No secret configured — allow all; set CRON_SECRET in production

  const auth  = (req.headers['authorization'] ?? '') as string
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  return token === cronSecret
}

interface RetryDelivery {
  id:              string
  webhook_id:      string
  organization_id: string
  payload_json:    Record<string, unknown> | null
  attempt_count:   number
  max_attempts:    number
  event_type:      string
}

interface WebhookRow {
  endpoint_url: string
  secret:       string
  status:       string
}

async function attemptDelivery(
  supabase: ReturnType<typeof adminClient>,
  delivery: RetryDelivery,
): Promise<void> {
  const newAttemptCount = delivery.attempt_count + 1
  const isLastAttempt   = newAttemptCount >= delivery.max_attempts

  // Fetch current webhook config
  const { data: whData } = await supabase
    .from('webhooks')
    .select('endpoint_url, secret, status')
    .eq('id', delivery.webhook_id)
    .single()

  if (!whData || (whData as WebhookRow).status !== 'active') {
    // Webhook deleted or disabled — cancel all retries
    await supabase
      .from('webhook_deliveries')
      .update({ delivery_status: 'failed', attempt_count: newAttemptCount } as Record<string, unknown>)
      .eq('id', delivery.id)
    return
  }

  const wh         = whData as WebhookRow
  const payloadStr = JSON.stringify(delivery.payload_json ?? {})
  const timestamp  = Math.floor(Date.now() / 1000).toString()
  const signature  = signPayload(wh.secret, payloadStr)
  const start      = Date.now()

  try {
    const response = await fetch(wh.endpoint_url, {
      method:  'POST',
      headers: {
        'Content-Type':          'application/json',
        'X-Genuinux-Signature':  `sha256=${signature}`,
        'X-Genuinux-Event':      delivery.event_type,
        'X-Genuinux-Timestamp':  timestamp,
        'X-Genuinux-Retry':      String(newAttemptCount),
        'User-Agent':            'Genuinux-Webhook/1.0',
      },
      body:   payloadStr,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })

    const duration = Date.now() - start

    if (response.ok) {
      await supabase
        .from('webhook_deliveries')
        .update({
          delivery_status: 'delivered',
          success:         true,
          attempt_count:   newAttemptCount,
          response_status: response.status,
          duration_ms:     duration,
          next_retry_at:   null,
        } as Record<string, unknown>)
        .eq('id', delivery.id)

      void supabase
        .from('webhooks')
        .update({ last_delivery_status: 'success', last_delivery_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('id', delivery.webhook_id)
    } else {
      const delayMs     = RETRY_DELAYS_MS[newAttemptCount] ?? RETRY_DELAYS_MS[2]
      const nextRetryAt = isLastAttempt ? null : new Date(Date.now() + delayMs).toISOString()

      await supabase
        .from('webhook_deliveries')
        .update({
          delivery_status: isLastAttempt ? 'failed' : 'retrying',
          attempt_count:   newAttemptCount,
          response_status: response.status,
          duration_ms:     duration,
          next_retry_at:   nextRetryAt,
        } as Record<string, unknown>)
        .eq('id', delivery.id)

      if (isLastAttempt) {
        void supabase
          .from('webhooks')
          .update({ last_delivery_status: 'failed', last_delivery_at: new Date().toISOString() } as Record<string, unknown>)
          .eq('id', delivery.webhook_id)
      }
    }
  } catch (err) {
    const duration    = Date.now() - start
    const errMsg      = err instanceof Error ? err.message : 'Timeout or network error'
    const delayMs     = RETRY_DELAYS_MS[newAttemptCount] ?? RETRY_DELAYS_MS[2]
    const nextRetryAt = isLastAttempt ? null : new Date(Date.now() + delayMs).toISOString()

    captureException(err, {
      context:     'retry-due: delivery attempt',
      delivery_id: delivery.id,
      attempt:     newAttemptCount,
      endpoint:    wh.endpoint_url,
    })

    await supabase
      .from('webhook_deliveries')
      .update({
        delivery_status: isLastAttempt ? 'failed' : 'retrying',
        attempt_count:   newAttemptCount,
        response_body:   errMsg.slice(0, 500),
        duration_ms:     duration,
        next_retry_at:   nextRetryAt,
      } as Record<string, unknown>)
      .eq('id', delivery.id)

    if (isLastAttempt) {
      void adminClient()
        .from('webhooks')
        .update({ last_delivery_status: 'failed', last_delivery_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('id', delivery.webhook_id)
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = adminClient()

  // Find all deliveries scheduled for retry that are now due
  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('id, webhook_id, organization_id, payload_json, attempt_count, max_attempts, event_type')
    .eq('delivery_status', 'retrying')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) {
    captureException(error, { context: 'retry-due: fetch' })
    return res.status(500).json({ error: error.message })
  }

  const deliveries = (data ?? []) as RetryDelivery[]

  if (deliveries.length === 0) {
    return res.status(200).json({ processed: 0 })
  }

  // Process all due deliveries — allSettled so one failure doesn't block others
  const results = await Promise.allSettled(
    deliveries.map(d => attemptDelivery(supabase, d))
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed    = results.filter(r => r.status === 'rejected').length

  return res.status(200).json({
    processed: deliveries.length,
    succeeded,
    failed,
  })
}
