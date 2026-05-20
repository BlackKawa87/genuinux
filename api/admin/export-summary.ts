/**
 * GET /api/admin/export-summary
 * Backup/export readiness — owner only.
 * Returns table list with row counts and backup readiness indicators.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSb, verifyOwnerJwt, CORS } from '../_lib/adminAuth'

const TABLES = [
  'organizations',
  'profiles',
  'api_keys',
  'risk_events',
  'users_checked',
  'review_queue',
  'rules',
  'webhooks',
  'webhook_deliveries',
  'audit_logs',
  'beta_invites',
  'security_events',
  'maintenance_logs',
  'feature_flags',
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await verifyOwnerJwt(req.headers['authorization'] as string | undefined)))
    return res.status(403).json({ error: 'Owner role required' })

  const sb = adminSb()

  const results = await Promise.allSettled(
    TABLES.map(t => sb.from(t).select('*', { count: 'exact', head: true }))
  )

  const tables = TABLES.map((table, i) => {
    const r = results[i]
    if (r.status === 'rejected') return { table, count: null, available: false }
    const { count, error } = r.value as { count: number | null; error: { message: string } | null }
    return {
      table,
      count:     error ? null : (count ?? 0),
      available: !error,
    }
  })

  const missing = tables.filter(t => !t.available).map(t => t.table)
  const total_rows = tables.reduce((s, t) => s + (t.count ?? 0), 0)

  const warnings: string[] = []
  if (missing.length > 0)
    warnings.push(`${missing.length} table(s) not found: ${missing.join(', ')} — check migration status`)

  const status = missing.length > 0 ? 'degraded' : 'healthy'

  return res.status(200).json({
    status,
    tables,
    missing_tables: missing,
    total_tables: TABLES.length,
    available_tables: tables.filter(t => t.available).length,
    total_rows,
    supabase_backup_note: 'Enable Point-in-Time Recovery (PITR) in Supabase project settings for automated backups.',
    warnings,
    checked_at: new Date().toISOString(),
  })
}
