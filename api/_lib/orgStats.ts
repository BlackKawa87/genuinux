/**
 * Redis-backed per-org daily stats counter.
 *
 * Key:    gnx:stats:{orgId}:{YYYY-MM-DD}  (Hash)
 * TTL:    33 days (rolling window — 32 complete days + today)
 * Fields: total, approve, review, block, latency_sum
 *
 * Writes use Redis pipeline (4 commands in one HTTP round-trip).
 * Fail-open — Redis errors are silently swallowed, never breaking the
 * /api/risk/check hot path.
 *
 * Persistence: /api/cron/maintenance aggregates yesterday's Redis hash
 * into org_daily_stats (Postgres) nightly for long-term retention.
 */

import { getRedisClient } from './redisClient.js'

const STATS_TTL = 33 * 24 * 60 * 60  // 33 days in seconds

function todayKey(orgId: string): string {
  const d    = new Date()
  const yyyy = d.getUTCFullYear()
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd   = String(d.getUTCDate()).padStart(2, '0')
  return `gnx:stats:${orgId}:${yyyy}-${mm}-${dd}`
}

export function statsDayKey(orgId: string, date: string): string {
  return `gnx:stats:${orgId}:${date}`
}

export async function incrementOrgStats(
  orgId:     string,
  decision:  'allow' | 'review' | 'block',
  latencyMs: number,
): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  const key         = todayKey(orgId)
  const decisionKey = decision === 'allow' ? 'approve' : decision

  try {
    const p = redis.pipeline()
    p.hincrby(key, 'total', 1)
    p.hincrby(key, decisionKey, 1)
    p.hincrby(key, 'latency_sum', Math.round(latencyMs))
    p.expire(key, STATS_TTL)
    await p.exec()
  } catch {
    // Never rethrow — fire-and-forget
  }
}

export interface DailyStats {
  total:       number
  approve:     number
  review:      number
  block:       number
  latency_sum: number
  avg_latency: number | null
}

export async function getTodayStats(orgId: string): Promise<DailyStats | null> {
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const raw = await redis.hgetall<Record<string, string>>(todayKey(orgId))
    if (!raw) return null

    const total       = parseInt(raw['total']       ?? '0', 10)
    const latency_sum = parseInt(raw['latency_sum'] ?? '0', 10)
    return {
      total,
      approve:     parseInt(raw['approve'] ?? '0', 10),
      review:      parseInt(raw['review']  ?? '0', 10),
      block:       parseInt(raw['block']   ?? '0', 10),
      latency_sum,
      avg_latency: total > 0 ? Math.round(latency_sum / total) : null,
    }
  } catch {
    return null
  }
}
