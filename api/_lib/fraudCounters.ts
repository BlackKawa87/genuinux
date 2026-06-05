/**
 * Redis-backed fraud velocity counters — Phase 2B.
 *
 * Replaces the 6 COUNT subqueries inside get_risk_context() RPC.
 * Expected latency: ~5–15ms (Redis pipeline) vs ~80ms (Supabase RPC).
 *
 * 6 signals tracked:
 *   1. user_events_last_10min      — INCR in 10min buckets, TTL 20min
 *   2. ip_distinct_users_last_24h  — SADD userId to 25h rolling set
 *   3. ip_signup_count_last_1h     — INCR in 1h buckets, TTL 2h
 *   4. device_distinct_users       — SADD userId to 91d rolling set
 *   5. device_has_prior_block      — SET flag on block decision, TTL 180d
 *   6. email_account_count         — SADD userId to 180d rolling set
 *
 * writeFraudCounters() — fire-and-forget after insertRiskEvent
 * readFraudCounters()  — Redis-first in fetchContext (env-gated)
 *
 * Fail-open: any Redis error returns null from read / swallows from write.
 * Never breaks the /api/risk/check hot path.
 *
 * Activation: set REDIS_COUNTERS_ENABLED=true in Vercel env after
 * 24-48h of dual-write warm-up so counters are populated before use.
 */

import { getRedisClient } from './redisClient.js'
import type { RiskEngineContext } from './riskEngine.js'

// ── TTLs (seconds) ────────────────────────────────────────────────────────────

const TTL_10M  = 1_200       // 2 × 10min buckets → covers full sliding window
const TTL_25H  = 90_000      // 25h rolling (ip distinct users ≈ last 24h)
const TTL_2H   = 7_200       // 2 × 1h buckets → covers full sliding window
const TTL_91D  = 7_862_400   // device history window (90d + buffer)
const TTL_180D = 15_552_000  // device block flag + email account history

// ── Bucket helpers ────────────────────────────────────────────────────────────

function b10m(): number { return Math.floor(Date.now() / 600_000) }
function b1h():  number { return Math.floor(Date.now() / 3_600_000) }

// Static noop key — never written to.
// SCARD on nonexistent key → 0.  GET on nonexistent key → null.
// Used to fill fixed pipeline slots when ip/device/email is absent.
const NOOP = 'gnx:noop'

// ── Write (fire-and-forget) ───────────────────────────────────────────────────

export async function writeFraudCounters(
  orgId:     string,
  userId:    string,
  ip:        string | null,
  deviceId:  string | null,
  email:     string | null,
  decision:  'allow' | 'review' | 'block',
  eventType: string,
): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  const bkt10m = b10m()
  const bkt1h  = b1h()

  try {
    const p = redis.pipeline()

    // 1. User velocity — 10min bucket
    p.incr(`gnx:cnt:u:${orgId}:${userId}:${bkt10m}`)
    p.expire(`gnx:cnt:u:${orgId}:${userId}:${bkt10m}`, TTL_10M)

    // 2. IP distinct users — 25h rolling set
    if (ip) {
      p.sadd(`gnx:cnt:ip:u:${orgId}:${ip}`, userId)
      p.expire(`gnx:cnt:ip:u:${orgId}:${ip}`, TTL_25H)
    }

    // 3. IP signup count — 1h bucket (only on signup events)
    if (ip && eventType === 'signup') {
      p.incr(`gnx:cnt:ip:s:${orgId}:${ip}:${bkt1h}`)
      p.expire(`gnx:cnt:ip:s:${orgId}:${ip}:${bkt1h}`, TTL_2H)
    }

    // 4. Device distinct users — 91d rolling set
    if (deviceId) {
      p.sadd(`gnx:cnt:dev:u:${orgId}:${deviceId}`, userId)
      p.expire(`gnx:cnt:dev:u:${orgId}:${deviceId}`, TTL_91D)
    }

    // 5. Device block flag — permanent until TTL expires (180d)
    if (deviceId && decision === 'block') {
      p.set(`gnx:flag:dev:b:${orgId}:${deviceId}`, '1', { ex: TTL_180D })
    }

    // 6. Email distinct users — 180d rolling set
    if (email) {
      p.sadd(`gnx:cnt:email:u:${orgId}:${email}`, userId)
      p.expire(`gnx:cnt:email:u:${orgId}:${email}`, TTL_180D)
    }

    await p.exec()
  } catch {
    // Never rethrow — fire-and-forget
  }
}

// ── Read (Redis-first in fetchContext) ────────────────────────────────────────

export async function readFraudCounters(
  orgId:    string,
  userId:   string,
  ip:       string | null,
  deviceId: string | null,
  email:    string | null,
): Promise<RiskEngineContext | null> {
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const bkt10m = b10m()
    const bkt1h  = b1h()

    const p = redis.pipeline()

    // Fixed 8-slot pipeline — optional signals use NOOP key (safe defaults: 0/null)
    p.get(`gnx:cnt:u:${orgId}:${userId}:${bkt10m}`)          // [0] user curr bucket
    p.get(`gnx:cnt:u:${orgId}:${userId}:${bkt10m - 1}`)      // [1] user prev bucket
    p.scard(ip       ? `gnx:cnt:ip:u:${orgId}:${ip}`                      : NOOP)  // [2]
    p.get  (ip       ? `gnx:cnt:ip:s:${orgId}:${ip}:${bkt1h}`             : NOOP)  // [3]
    p.get  (ip       ? `gnx:cnt:ip:s:${orgId}:${ip}:${bkt1h - 1}`         : NOOP)  // [4]
    p.scard(deviceId ? `gnx:cnt:dev:u:${orgId}:${deviceId}`               : NOOP)  // [5]
    p.get  (deviceId ? `gnx:flag:dev:b:${orgId}:${deviceId}`              : NOOP)  // [6]
    p.scard(email    ? `gnx:cnt:email:u:${orgId}:${email}`                 : NOOP)  // [7]

    const res = await p.exec() as (string | number | null)[]

    // Coerce string counters and null → number
    const n = (v: string | number | null): number => {
      if (typeof v === 'number') return v
      const parsed = parseInt(String(v ?? '0'), 10)
      return isNaN(parsed) ? 0 : parsed
    }

    return {
      user_events_last_10min:     n(res[0]) + n(res[1]),
      ip_distinct_users_last_24h: ip       ? n(res[2]) : 0,
      ip_signup_count_last_1h:    ip       ? n(res[3]) + n(res[4]) : 0,
      device_distinct_users:      deviceId ? n(res[5]) : 0,
      device_has_prior_block:     deviceId ? res[6] === '1' : false,
      email_account_count:        email    ? n(res[7]) : 0,
    }
  } catch {
    return null  // Fall back to RPC on any Redis error
  }
}
