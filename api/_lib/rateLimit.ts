/**
 * Per-API-key sliding window rate limiter — Priority 4 (security/reliability).
 *
 * Uses Upstash Redis via @upstash/ratelimit.
 * Fail-open: if UPSTASH env vars are missing, all requests pass through.
 * This means rate limiting is opt-in — the API works identically without Redis.
 *
 * Limit: 100 requests per 10 seconds per API key ID.
 *
 * Required env vars (set in Vercel dashboard):
 *   UPSTASH_REDIS_REST_URL   — from Upstash console
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash console
 *
 * To enable: add both env vars. To disable: remove either var.
 */

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

export interface RateLimitResult {
  allowed:   boolean
  limit:     number
  remaining: number
  resetMs:   number
}

let ratelimit: Ratelimit | null = null

function getLimiter(): Ratelimit | null {
  if (ratelimit) return ratelimit

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) return null

  ratelimit = new Ratelimit({
    redis:   new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(100, '10 s'),
    prefix:  'gnx:rl',
  })

  return ratelimit
}

export async function checkRateLimit(apiKeyId: string): Promise<RateLimitResult> {
  const limiter = getLimiter()

  if (!limiter) {
    return { allowed: true, limit: 100, remaining: 100, resetMs: 0 }
  }

  const { success, limit, remaining, reset } = await limiter.limit(apiKeyId)
  return { allowed: success, limit, remaining, resetMs: reset }
}
