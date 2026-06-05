/**
 * Shared Upstash Redis singleton.
 *
 * Previously keyCache, monthlyUsage, and rateLimit each created their own
 * Redis client — 3 separate HTTP clients per warm Vercel instance and 3×
 * initialization overhead on cold starts.
 *
 * All Redis-using modules import getRedisClient() from here.
 * Fail-open: returns null when UPSTASH env vars are not set.
 */

import { Redis } from '@upstash/redis'

let _redis: Redis | null | undefined = undefined

export function getRedisClient(): Redis | null {
  if (_redis !== undefined) return _redis
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) { _redis = null; return null }
  _redis = new Redis({ url, token })
  return _redis
}
