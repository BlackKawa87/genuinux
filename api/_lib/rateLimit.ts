/**
 * Per-API-key sliding window rate limiter — plan-aware.
 *
 * Limits vary by plan tier:
 *   free: 30 req/10s · starter: 60 · growth/pro: 100 · enterprise: 200
 *
 * Fail-open: if UPSTASH env vars are missing all requests pass through,
 * and a startup warning is printed to the Vercel function logs.
 *
 * Required env vars (set in Vercel dashboard):
 *   UPSTASH_REDIS_REST_URL   — from Upstash console
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash console
 */

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

export interface RateLimitResult {
  allowed:   boolean
  limit:     number
  remaining: number
  resetMs:   number
}

// requests per 10-second sliding window, per plan tier
const PLAN_WINDOWS: Record<string, number> = {
  free:        30,
  starter:     60,
  growth:     100,
  pro:        100,
  enterprise: 200,
}

// one Ratelimit instance per plan tier — initialized lazily
const limiters = new Map<string, Ratelimit>()

// undefined = not yet checked; null = unavailable
let redisClient: Redis | null | undefined = undefined

function initRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    console.warn(
      '[rateLimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — ' +
      'rate limiting is disabled (fail-open). Set both vars to enable it.',
    )
    return null
  }

  return new Redis({ url, token })
}

function getLimiter(plan: string): Ratelimit | null {
  if (redisClient === undefined) redisClient = initRedis()
  if (!redisClient) return null

  const tier = plan in PLAN_WINDOWS ? plan : 'free'

  if (!limiters.has(tier)) {
    limiters.set(tier, new Ratelimit({
      redis:   redisClient,
      limiter: Ratelimit.slidingWindow(PLAN_WINDOWS[tier] ?? 30, '10 s'),
      prefix:  `gnx:rl:${tier}`,
    }))
  }

  return limiters.get(tier)!
}

export async function checkRateLimit(
  apiKeyId: string,
  plan = 'free',
): Promise<RateLimitResult> {
  const limiter  = getLimiter(plan)
  const limitVal = PLAN_WINDOWS[plan] ?? 30

  if (!limiter) {
    return { allowed: true, limit: limitVal, remaining: limitVal, resetMs: 0 }
  }

  const { success, limit, remaining, reset } = await limiter.limit(apiKeyId)
  return { allowed: success, limit, remaining, resetMs: reset }
}
