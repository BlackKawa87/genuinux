/**
 * GET /api/admin/rate-limit-status
 * Rate limit infrastructure status — owner only.
 * Tests Redis connection and returns per-plan window config.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyOwnerJwt, CORS } from '../_lib/adminAuth.js'

const PLAN_WINDOWS: Record<string, number> = {
  free:       30,
  starter:    60,
  growth:     100,
  pro:        100,
  enterprise: 200,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await verifyOwnerJwt(req.headers['authorization'] as string | undefined)))
    return res.status(403).json({ error: 'Owner role required' })

  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const configured = Boolean(redisUrl && redisToken)

  let redis_reachable = false
  let redis_latency_ms = -1
  let redis_error: string | null = null

  if (configured) {
    try {
      const t0 = Date.now()
      const response = await fetch(`${redisUrl}/ping`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(3000),
      })
      redis_latency_ms = Date.now() - t0
      const body = await response.json() as { result?: string }
      redis_reachable = body.result === 'PONG'
    } catch (err) {
      redis_error = err instanceof Error ? err.message : 'Unknown error'
    }
  }

  const plans = Object.entries(PLAN_WINDOWS).map(([plan, limit]) => ({
    plan,
    requests_per_10s: limit,
    window_seconds: 10,
  }))

  const status =
    !configured     ? 'missing'   :
    !redis_reachable ? 'degraded'  :
    'healthy'

  return res.status(200).json({
    status,
    configured,
    redis_reachable,
    redis_latency_ms: redis_latency_ms >= 0 ? redis_latency_ms : null,
    redis_error,
    plans,
    fail_open: true,
    checked_at: new Date().toISOString(),
  })
}
