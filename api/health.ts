/**
 * GET /api/health
 *
 * Lightweight health check for uptime monitors and deployment verification.
 * Never exposes secrets, keys, or internal configuration values.
 *
 * Response shape:
 *   { status, database, redis, openai, stripe, version, timestamp, environment }
 *
 * Each service status is one of: "ok" | "degraded" | "unavailable"
 * The top-level status is "ok" only if database is "ok"; otherwise "degraded".
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'dev'

function checkService(envVars: string[]): 'ok' | 'unavailable' {
  return envVars.every(v => Boolean(process.env[v])) ? 'ok' : 'unavailable'
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const timestamp = new Date().toISOString()

  // ── Database ping ────────────────────────────────────────────────────────────
  let database: 'ok' | 'degraded' | 'unavailable' = 'unavailable'
  const dbStart = Date.now()

  try {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
      const { error } = await sb.from('organizations').select('id').limit(1)
      database = error ? 'degraded' : 'ok'
    }
  } catch {
    database = 'degraded'
  }

  const dbMs = Date.now() - dbStart

  // ── Redis / Upstash ──────────────────────────────────────────────────────────
  const redis = checkService(['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'])

  // ── External services (config-only check — no network call) ─────────────────
  const openai = checkService(['OPENAI_API_KEY'])
  const stripe = checkService(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'])

  // ── Overall status ───────────────────────────────────────────────────────────
  const status = database === 'ok' ? 'ok' : 'degraded'

  return res.status(status === 'ok' ? 200 : 503).json({
    status,
    database: { status: database, response_ms: dbMs },
    redis:    { status: redis },
    openai:   { status: openai },
    stripe:   { status: stripe },
    version:  VERSION,
    timestamp,
    environment: process.env.VERCEL_ENV ?? 'local',
  })
}
