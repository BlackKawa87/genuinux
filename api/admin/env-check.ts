/**
 * GET /api/admin/env-check
 * Environment readiness check — owner only. Returns which env vars are configured.
 * Never exposes actual values.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSb, verifyOwnerJwt, CORS } from '../_lib/adminAuth.js'

interface EnvVar {
  key: string
  category: 'core' | 'beta' | 'billing' | 'optional'
  configured: boolean
  severity: 'critical' | 'required' | 'optional'
  impact: string
}

function checkEnv(key: string): boolean {
  const val = process.env[key]
  return typeof val === 'string' && val.trim().length > 0
}

const ENV_SPEC: Array<Omit<EnvVar, 'configured'>> = [
  // Core — app will not function without these
  { key: 'SUPABASE_URL',              category: 'core',     severity: 'critical', impact: 'Database unreachable — API fully broken' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', category: 'core',     severity: 'critical', impact: 'Server-side DB writes fail — all endpoints broken' },
  { key: 'VITE_SUPABASE_ANON_KEY',   category: 'core',     severity: 'critical', impact: 'Frontend auth broken — dashboard inaccessible' },
  // Beta required — important for beta operations
  { key: 'UPSTASH_REDIS_REST_URL',    category: 'beta',     severity: 'required', impact: 'Rate limiting disabled — API open to abuse' },
  { key: 'UPSTASH_REDIS_REST_TOKEN',  category: 'beta',     severity: 'required', impact: 'Rate limiting disabled — API open to abuse' },
  { key: 'CRON_SECRET',               category: 'beta',     severity: 'required', impact: 'Cron endpoints unauthenticated — maintenance jobs exposed' },
  // Billing
  { key: 'STRIPE_SECRET_KEY',         category: 'billing',  severity: 'optional', impact: 'Billing/checkout unavailable — upgrade buttons return 503' },
  { key: 'STRIPE_WEBHOOK_SECRET',     category: 'billing',  severity: 'optional', impact: 'Stripe webhooks unverified — plan changes wont apply' },
  { key: 'STRIPE_PRICE_STARTER',      category: 'billing',  severity: 'optional', impact: 'Starter plan checkout broken' },
  { key: 'STRIPE_PRICE_GROWTH',       category: 'billing',  severity: 'optional', impact: 'Growth plan checkout broken' },
  // Optional enhancements
  { key: 'OPENAI_API_KEY',            category: 'optional', severity: 'optional', impact: 'AI summaries disabled — template fallback used instead' },
  { key: 'AI_GLOBAL_MONTHLY_CALL_LIMIT', category: 'optional', severity: 'optional', impact: 'No AI spend cap — cost could be unlimited' },
  { key: 'SENTRY_DSN',               category: 'optional', severity: 'optional', impact: 'Server-side errors not captured in Sentry' },
  { key: 'VITE_SENTRY_DSN',          category: 'optional', severity: 'optional', impact: 'Frontend errors not captured in Sentry' },
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await verifyOwnerJwt(req.headers['authorization'] as string | undefined)))
    return res.status(403).json({ error: 'Owner role required' })

  // Count how many orgs exist (benign check to confirm DB works)
  let dbReachable = false
  try {
    const sb = adminSb()
    const { error } = await sb.from('organizations').select('id', { count: 'exact', head: true })
    dbReachable = !error
  } catch { /* ignore */ }

  const vars: EnvVar[] = ENV_SPEC.map(spec => ({
    ...spec,
    configured: checkEnv(spec.key),
  }))

  const missing_critical = vars.filter(v => v.severity === 'critical' && !v.configured)
  const missing_required = vars.filter(v => v.severity === 'required' && !v.configured)
  const configured_count = vars.filter(v => v.configured).length

  const status =
    missing_critical.length > 0 ? 'critical' :
    missing_required.length > 0 ? 'degraded'  :
    'healthy'

  return res.status(200).json({
    status,
    db_reachable: dbReachable,
    configured_count,
    total_count: vars.length,
    missing_critical: missing_critical.map(v => ({ key: v.key, impact: v.impact })),
    missing_required: missing_required.map(v => ({ key: v.key, impact: v.impact })),
    vars,
    checked_at: new Date().toISOString(),
  })
}
