/**
 * Redis cache for the hot path in /api/risk/check.
 *
 * Caches two things that are read on every single request:
 *   1. API key hash → { id, organization_id, name }   TTL: 5 min
 *   2. org id       → { plan, shadow_mode, … }         TTL: 60 s
 *
 * Without this cache, every request makes 2 sequential Supabase queries
 * before any business logic runs. Under load this is the main source of
 * latency (each query adds 100–300 ms on warm instances, 500ms+ under pressure).
 *
 * Fail-open: cache misses and Redis errors are transparent — the caller
 * falls back to the regular Supabase queries.
 */

import { Redis } from '@upstash/redis'

// ─── Singleton Redis client ───────────────────────────────────────────────────

let _redis: Redis | null | undefined = undefined

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) { _redis = null; return null }
  _redis = new Redis({ url, token })
  return _redis
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CachedApiKey {
  id:              string
  organization_id: string
  name:            string
  requests_count:  number
}

export interface CachedOrg {
  plan:             string
  shadow_mode:      boolean
  ai_enabled:       boolean
  ai_monthly_limit: number
  ai_calls_used:    number
  ai_reset_at:      string
}

// ─── API key cache ────────────────────────────────────────────────────────────

const KEY_TTL = 300  // 5 minutes

export async function getCachedApiKey(keyHash: string): Promise<CachedApiKey | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    return await redis.get<CachedApiKey>(`gnx:key:${keyHash}`)
  } catch {
    return null
  }
}

export async function setCachedApiKey(keyHash: string, data: CachedApiKey): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(`gnx:key:${keyHash}`, data, { ex: KEY_TTL })
  } catch {
    // ignore — cache write failures are non-fatal
  }
}

export async function invalidateCachedApiKey(keyHash: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(`gnx:key:${keyHash}`)
  } catch {
    // ignore
  }
}

// ─── Org cache ────────────────────────────────────────────────────────────────

const ORG_TTL = 60  // 60 seconds — plan changes take effect within 1 minute

export async function getCachedOrg(orgId: string): Promise<CachedOrg | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    return await redis.get<CachedOrg>(`gnx:org:${orgId}`)
  } catch {
    return null
  }
}

export async function setCachedOrg(orgId: string, data: CachedOrg): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(`gnx:org:${orgId}`, data, { ex: ORG_TTL })
  } catch {
    // ignore
  }
}

// ─── Rules cache ──────────────────────────────────────────────────────────────

const RULES_TTL = 60  // 60 seconds — rule changes take effect within 1 minute

export async function getCachedRules(orgId: string): Promise<unknown[] | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    return await redis.get<unknown[]>(`gnx:rules:${orgId}`)
  } catch {
    return null
  }
}

export async function setCachedRules(orgId: string, rules: unknown[]): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(`gnx:rules:${orgId}`, rules, { ex: RULES_TTL })
  } catch {
    // ignore
  }
}

export async function invalidateCachedRules(orgId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(`gnx:rules:${orgId}`)
  } catch {
    // ignore
  }
}
