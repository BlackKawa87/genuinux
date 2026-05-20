/**
 * GET /api/admin/webhook-health
 * Webhook infrastructure monitor — owner only.
 * Returns delivery stats, failure rates, and per-org webhook counts.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSb, verifyOwnerJwt, CORS } from '../_lib/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await verifyOwnerJwt(req.headers['authorization'] as string | undefined)))
    return res.status(403).json({ error: 'Owner role required' })

  const sb = adminSb()

  const [
    webhooksRes,
    deliveriesTableRes,
  ] = await Promise.allSettled([
    sb.from('webhooks').select('id, organization_id, url, is_active, created_at'),
    sb.from('webhook_deliveries')
      .select('id, success, status_code, duration_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const webhooks = webhooksRes.status === 'fulfilled'
    ? (webhooksRes.value.data ?? []) as Array<{ id: string; organization_id: string; url: string; is_active: boolean; created_at: string }>
    : []

  const deliveries_table_available = deliveriesTableRes.status === 'fulfilled' && !deliveriesTableRes.value.error
  const deliveries = deliveries_table_available
    ? (deliveriesTableRes.value as { data: Array<{ id: string; success: boolean; status_code: number | null; duration_ms: number | null; created_at: string }> | null }).data ?? []
    : []

  const total_webhooks  = webhooks.length
  const active_webhooks = webhooks.filter(w => w.is_active).length

  const total_deliveries   = deliveries.length
  const success_deliveries = deliveries.filter(d => d.success).length
  const failed_deliveries  = total_deliveries - success_deliveries
  const success_rate = total_deliveries > 0
    ? Math.round((success_deliveries / total_deliveries) * 100)
    : null

  const avg_duration_ms = deliveries.length > 0
    ? Math.round(deliveries.filter(d => d.duration_ms != null).reduce((s, d) => s + (d.duration_ms ?? 0), 0) / deliveries.length)
    : null

  // Last delivery attempt
  const last_delivery = deliveries[0] ?? null

  const warnings: string[] = []
  if (!deliveries_table_available)
    warnings.push('webhook_deliveries table not found — run v2 migration to enable delivery tracking')
  if (failed_deliveries > 50)
    warnings.push(`${failed_deliveries} failed deliveries in last 500 — check endpoint availability`)
  if (success_rate !== null && success_rate < 80)
    warnings.push(`Success rate is ${success_rate}% — below 80% threshold`)

  const status =
    !deliveries_table_available                    ? 'degraded' :
    failed_deliveries > 100 || (success_rate !== null && success_rate < 80) ? 'degraded' :
    'healthy'

  return res.status(200).json({
    status,
    total_webhooks,
    active_webhooks,
    deliveries_table_available,
    total_deliveries,
    success_deliveries,
    failed_deliveries,
    success_rate,
    avg_duration_ms,
    last_delivery_at: last_delivery?.created_at ?? null,
    last_delivery_success: last_delivery?.success ?? null,
    warnings,
    checked_at: new Date().toISOString(),
  })
}
