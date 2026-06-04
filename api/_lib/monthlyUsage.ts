/**
 * Redis-backed monthly event counter per organization.
 *
 * Key: gnx:monthly_events:{orgId}:{YYYY-MM}
 * TTL: expires 5 days after end of current month (for billing reconciliation).
 *
 * Flow:
 *   READ  → Redis GET (O(1)) → miss → Supabase COUNT(*) → populate Redis
 *   WRITE → Redis INCR (O(1), fire-and-forget after insertRiskEvent)
 *
 * Fail-open: if Redis is unavailable, falls back to Supabase COUNT(*).
 * Never throws. Never breaks the /api/risk/check endpoint.
 *
 * Required env vars (same as rateLimit.ts):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

import { Redis } from '@upstash/redis'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureException, captureMessage } from './monitoring.js'

// ─── Redis client (module-level singleton, lazy init) ─────────────────────────

let _redis: Redis | null | undefined = undefined

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    _redis = null
    return null
  }

  _redis = new Redis({ url, token })
  return _redis
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

function monthKey(orgId: string): string {
  const now  = new Date()
  const yyyy = now.getUTCFullYear()
  const mm   = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `gnx:monthly_events:${orgId}:${yyyy}-${mm}`
}

/** Seconds until 5 days after end-of-month (UTC). Minimum 1s. */
function keyTtlSeconds(): number {
  const now = new Date()
  const endOfMonth = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,  // next month
    0,                       // day 0 = last day of current month
    23, 59, 59, 999,
  ))
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000
  const ttlMs = endOfMonth.getTime() + fiveDaysMs - Date.now()
  return Math.max(1, Math.ceil(ttlMs / 1000))
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the number of risk events for this org in the current calendar month.
 *
 * 1. Try Redis GET (O(1), ~1ms)
 * 2. Cache miss → query Supabase COUNT(*) + populate Redis
 * 3. Redis unavailable → query Supabase directly (original behaviour)
 */
export async function getMonthlyUsage(
  orgId:    string,
  supabase: SupabaseClient,
): Promise<number> {
  const redis = getRedis()
  const key   = monthKey(orgId)

  if (redis) {
    try {
      const cached = await redis.get<string>(key)
      if (cached !== null && cached !== undefined) {
        return Number(cached)
      }
      // Cache miss — sync from DB and populate Redis
      return await syncMonthlyUsageFromDb(orgId, supabase, redis, key)
    } catch (err) {
      captureMessage(
        'Redis unavailable for monthly usage read — falling back to Supabase',
        'warning',
        { orgId, key },
      )
      captureException(err, { context: 'getMonthlyUsage:redis', orgId })
    }
  }

  // Redis not configured or unavailable — query DB directly
  return await querySupabaseCount(orgId, supabase)
}

/**
 * Increments the monthly event counter in Redis after a successful event insert.
 *
 * Must be called fire-and-forget: `void incrementMonthlyUsage(orgId)`.
 * Never throws.
 */
export async function incrementMonthlyUsage(orgId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return   // Redis not configured — getMonthlyUsage uses DB fallback

  const key = monthKey(orgId)

  try {
    const newCount = await redis.incr(key)

    // Set TTL on first write (INCR creates the key without expiry)
    if (newCount === 1) {
      await redis.expire(key, keyTtlSeconds())
      return
    }

    // Defensive check every 100 events: ensure TTL is set even if it was lost
    // (e.g. Redis restart without persistence)
    if (newCount % 100 === 0) {
      const ttl = await redis.ttl(key)
      if (ttl === -1) {
        await redis.expire(key, keyTtlSeconds())
      }
    }
  } catch (err) {
    captureException(err, { context: 'incrementMonthlyUsage', orgId })
    // Never rethrow — fire-and-forget
  }
}

/**
 * Explicit DB-to-Redis sync. Useful for warming up the cache on startup
 * or after a Redis flush. Returns the current DB count.
 */
export async function syncMonthlyUsageFromDb(
  orgId:    string,
  supabase: SupabaseClient,
  redis?:   Redis | null,
  key?:     string,
): Promise<number> {
  const count = await querySupabaseCount(orgId, supabase)

  const r = redis ?? getRedis()
  const k = key   ?? monthKey(orgId)

  if (r) {
    try {
      // Always cache, including 0 — avoids repeated DB queries on empty months
      await r.set(k, String(count), { ex: keyTtlSeconds() })
    } catch (err) {
      captureException(err, { context: 'syncMonthlyUsageFromDb:set', orgId })
    }
  }

  return count
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function querySupabaseCount(
  orgId:    string,
  supabase: SupabaseClient,
): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('risk_events')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('created_at', startOfMonth.toISOString())

  return count ?? 0
}
