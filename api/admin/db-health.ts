/**
 * GET /api/admin/db-health
 * Database infrastructure monitor — owner only.
 * Returns table row counts, warnings for high-volume tables, queue sizes.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSb, verifyOwnerJwt, CORS } from '../_lib/adminAuth.js'

interface TableStat {
  table: string
  count: number
  warning?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await verifyOwnerJwt(req.headers['authorization'] as string | undefined)))
    return res.status(403).json({ error: 'Owner role required' })

  const sb = adminSb()
  const t0 = Date.now()

  const queries = await Promise.allSettled([
    sb.from('organizations').select('id',    { count: 'exact', head: true }),
    sb.from('profiles').select('*',           { count: 'exact', head: true }),
    sb.from('risk_events').select('id',      { count: 'exact', head: true }),
    sb.from('api_keys').select('id',         { count: 'exact', head: true }),
    sb.from('review_queue').select('id',     { count: 'exact', head: true })
      .eq('status', 'pending'),
    sb.from('webhook_deliveries').select('id', { count: 'exact', head: true })
      .eq('success', false),
    sb.from('webhooks').select('id',         { count: 'exact', head: true }),
    sb.from('rules').select('id',            { count: 'exact', head: true }),
    sb.from('audit_logs').select('id',       { count: 'exact', head: true }),
  ])

  const response_ms = Date.now() - t0

  function cnt(r: PromiseSettledResult<{ count: number | null; data: unknown; error: unknown }>): number {
    if (r.status === 'rejected') return -1
    return r.value.count ?? 0
  }

  const orgs       = cnt(queries[0])
  const profiles   = cnt(queries[1])
  const events     = cnt(queries[2])
  const api_keys   = cnt(queries[3])
  const queue_pending = cnt(queries[4])
  const webhook_failures = cnt(queries[5])
  const webhooks   = cnt(queries[6])
  const rules      = cnt(queries[7])
  const audit_logs = cnt(queries[8])

  // Check ai_summary_cache (optional table)
  let ai_cache_expired = -1
  try {
    const { count } = await sb
      .from('ai_summary_cache')
      .select('id', { count: 'exact', head: true })
      .lt('expires_at', new Date().toISOString())
    ai_cache_expired = count ?? 0
  } catch { /* table may not exist */ }

  const tables: TableStat[] = [
    { table: 'organizations', count: orgs },
    { table: 'profiles',      count: profiles },
    {
      table: 'risk_events', count: events,
      ...(events > 1_000_000 ? { warning: 'Over 1M rows — consider archiving older data' } : {}),
    },
    { table: 'api_keys',  count: api_keys },
    { table: 'webhooks',  count: webhooks },
    { table: 'rules',     count: rules },
    { table: 'audit_logs', count: audit_logs },
  ]

  const warnings: string[] = []

  if (events > 1_000_000)
    warnings.push(`risk_events has ${events.toLocaleString()} rows — archival recommended`)
  if (webhook_failures > 100)
    warnings.push(`${webhook_failures} failed webhook deliveries — check destination endpoints`)
  if (ai_cache_expired > 10_000)
    warnings.push(`${ai_cache_expired.toLocaleString()} expired AI cache rows — run cache purge`)
  if (queue_pending > 100)
    warnings.push(`${queue_pending} events pending manual review — review queue backlog growing`)

  const status =
    queries.some(q => q.status === 'rejected') ? 'degraded' :
    warnings.length > 0                        ? 'degraded' :
    'healthy'

  return res.status(200).json({
    status,
    response_ms,
    tables,
    review_queue_pending:  queue_pending,
    webhook_failures,
    ai_cache_expired,
    warnings,
    checked_at: new Date().toISOString(),
  })
}
