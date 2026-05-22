/**
 * GET /api/admin/ai-health
 * AI infrastructure monitor — owner only.
 * Returns OpenAI config, cache stats, and estimated cost exposure.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSb, verifyOwnerJwt, CORS } from '../_lib/adminAuth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await verifyOwnerJwt(req.headers['authorization'] as string | undefined)))
    return res.status(403).json({ error: 'Owner role required' })

  const sb = adminSb()

  const openai_configured = Boolean(process.env.OPENAI_API_KEY)
  const monthly_limit     = Number(process.env.AI_GLOBAL_MONTHLY_CALL_LIMIT ?? 0) || null
  const cost_cap_set      = monthly_limit !== null

  // Cache stats (optional table)
  let cache_total   = -1
  let cache_valid   = -1
  let cache_expired = -1

  try {
    const [totalRes, validRes, expiredRes] = await Promise.all([
      sb.from('ai_summary_cache').select('id', { count: 'exact', head: true }),
      sb.from('ai_summary_cache').select('id', { count: 'exact', head: true })
        .gte('expires_at', new Date().toISOString()),
      sb.from('ai_summary_cache').select('id', { count: 'exact', head: true })
        .lt('expires_at', new Date().toISOString()),
    ])
    cache_total   = totalRes.count   ?? 0
    cache_valid   = validRes.count   ?? 0
    cache_expired = expiredRes.count ?? 0
  } catch { /* table may not exist */ }

  const cache_table_available = cache_total >= 0

  // Load test flag
  const ai_disabled_for_load_test = process.env.DISABLE_AI_DURING_LOAD_TEST === '1'

  const warnings: string[] = []
  if (!openai_configured)
    warnings.push('OPENAI_API_KEY not set — AI summaries disabled, using template fallback')
  if (!cost_cap_set)
    warnings.push('AI_GLOBAL_MONTHLY_CALL_LIMIT not set — no spend cap in place')
  if (!cache_table_available)
    warnings.push('ai_summary_cache table not found — caching unavailable')
  if (cache_expired > 10_000)
    warnings.push(`${cache_expired.toLocaleString()} expired cache rows — run maintenance cron to purge`)
  if (ai_disabled_for_load_test)
    warnings.push('DISABLE_AI_DURING_LOAD_TEST=1 is active — AI disabled globally right now')

  const status =
    !openai_configured && !cache_table_available ? 'degraded' :
    warnings.length > 0                          ? 'degraded' :
    'healthy'

  return res.status(200).json({
    status,
    openai_configured,
    cost_cap_set,
    monthly_limit,
    cache_table_available,
    cache_total:   cache_total   >= 0 ? cache_total   : null,
    cache_valid:   cache_valid   >= 0 ? cache_valid   : null,
    cache_expired: cache_expired >= 0 ? cache_expired : null,
    ai_disabled_for_load_test,
    warnings,
    checked_at: new Date().toISOString(),
  })
}
