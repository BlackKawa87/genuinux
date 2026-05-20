/**
 * GET /api/admin/cron-health
 * Cron infrastructure monitor — owner only.
 * Queries maintenance_logs table for recent cron run history.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSb, verifyOwnerJwt, CORS } from '../_lib/adminAuth'

interface MaintenanceLog {
  id: string
  task: string
  status: string
  rows_affected: number | null
  duration_ms: number | null
  error_message: string | null
  ran_at: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await verifyOwnerJwt(req.headers['authorization'] as string | undefined)))
    return res.status(403).json({ error: 'Owner role required' })

  const sb = adminSb()

  let logs: MaintenanceLog[] = []
  let table_available = false

  try {
    const { data, error } = await sb
      .from('maintenance_logs')
      .select('id, task, status, rows_affected, duration_ms, error_message, ran_at')
      .order('ran_at', { ascending: false })
      .limit(50)

    if (!error) {
      table_available = true
      logs = (data ?? []) as MaintenanceLog[]
    }
  } catch { /* table may not exist */ }

  // Expected cron tasks
  const EXPECTED_TASKS = [
    'purge_expired_events',
    'purge_expired_cache',
    'log_maintenance_run',
  ]

  // Find last run of each expected task
  const task_status = EXPECTED_TASKS.map(task => {
    const last = logs.find(l => l.task === task)
    if (!last) return { task, last_run: null, status: 'never_run', hours_since: null }

    const hoursAgo = (Date.now() - new Date(last.ran_at).getTime()) / 3_600_000
    return {
      task,
      last_run:    last.ran_at,
      status:      last.status,
      hours_since: Math.round(hoursAgo * 10) / 10,
      duration_ms: last.duration_ms,
      rows_affected: last.rows_affected,
    }
  })

  const warnings: string[] = []

  if (!table_available)
    warnings.push('maintenance_logs table not found — run v8 migration to enable cron tracking')

  task_status.forEach(t => {
    if (t.status === 'never_run')
      warnings.push(`Cron task '${t.task}' has never run — check Vercel cron configuration`)
    else if (t.hours_since !== null && t.hours_since > 26)
      warnings.push(`Cron task '${t.task}' last ran ${t.hours_since}h ago — may be failing`)
    else if (t.status === 'error')
      warnings.push(`Cron task '${t.task}' last run reported an error`)
  })

  const recent_errors = logs.filter(l => l.status === 'error').slice(0, 5)

  const all_recent_ok = table_available && task_status.every(
    t => t.status !== 'never_run' && (t.hours_since ?? 99) < 26
  )

  const status =
    !table_available                    ? 'missing'  :
    recent_errors.length > 0 || !all_recent_ok ? 'degraded' :
    'healthy'

  return res.status(200).json({
    status,
    table_available,
    task_status,
    recent_errors,
    last_50_runs: logs,
    warnings,
    checked_at: new Date().toISOString(),
  })
}
