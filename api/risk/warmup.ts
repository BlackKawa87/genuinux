/**
 * GET /api/risk/warmup
 *
 * Keep-warm ping for the /api/risk/check function.
 * Called by Vercel Cron every 5 minutes to prevent cold starts.
 *
 * Initializes the module-level Supabase singleton and Redis client
 * so the first real request doesn't pay the cold-start penalty.
 *
 * Auth: x-vercel-cron: 1 header (auto-injected by Vercel Cron)
 *       or no auth (pings are harmless — no data returned)
 *
 * Response: { warmed: true, cold_start: bool, ms: number }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getRedisClient } from '../_lib/redisClient.js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Module-level singleton — mirrors check.ts pattern exactly
let _warmed = false

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const t0       = Date.now()
  const coldStart = !_warmed

  // Initialize Supabase client (same lazy-singleton pattern as check.ts)
  if (supabaseUrl && serviceKey) {
    createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }

  // Touch Redis to warm the HTTP connection pool
  const redis = getRedisClient()
  if (redis) {
    try { await redis.ping() } catch { /* fail-open */ }
  }

  _warmed = true

  return res.status(200).json({
    warmed:     true,
    cold_start: coldStart,
    redis:      redis !== null,
    ms:         Date.now() - t0,
  })
}
