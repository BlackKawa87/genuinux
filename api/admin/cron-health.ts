/**
 * GET /api/admin/cron-health
 * Cron infrastructure monitor — owner only.
 * Parses maintenance_logs.tasks JSONB to report per-task history.
 *
 * maintenance_logs schema (v8): { id, ran_at, tasks JSONB }
 * tasks format (written by api/cron/maintenance.ts):
 *   {
 *     ran_at: string,
 *     ai_cache_purge:           { status: 'ok'|'error', rows_deleted?: number, message?: string },
 *     webhook_deliveries_purge: { status: 'ok'|'error', rows_deleted?: number, message?: string }
 *   }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSb, verifyOwnerJwt, CORS } from '../_lib/adminAuth'

interface MaintenanceRow {
  id: string
  ran_at: string
  tasks: Record<string, unknown>
}

interface TaskStatus {
  task: string
  last_run: string | null
  status: string
  hours_since: number | null
  rows_deleted?: number | null
  error_message?: string | null
}

// Matches the task keys written by api/cron/maintenance.ts
const EXPECTED_TASK_KEYS: Record<string, string> = {
  ai_cache_purge:           'purge_ai_cache',
  webhook_deliveries_purge: 'purge_webhook_deliveries',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await verifyOwnerJwt(req.headers['authorization'] as string | undefined)))
    return res.status(403).json({ error: 'Owner role required' })

  const sb = adminSb()

  let rows: MaintenanceRow[] = []
  let table_available = false

  try {
    const { data, error } = await sb
      .from('maintenance_logs')
      .select('id, ran_at, tasks')
      .order('ran_at', { ascending: false })
      .limit(50)

    if (!error) {
      table_available = true
      rows = (data ?? []) as MaintenanceRow[]
    }
  } catch { /* table may not exist */ }

  // Latest row for each expected task key
  const task_status: TaskStatus[] = Object.entries(EXPECTED_TASK_KEYS).map(([taskKey, displayName]) => {
    // Find most recent row that has this task key
    const row = rows.find(r => r.tasks && typeof r.tasks === 'object' && taskKey in r.tasks)

    if (!row) {
      return { task: displayName, last_run: null, status: 'never_run', hours_since: null }
    }

    const taskData = (row.tasks as Record<string, Record<string, unknown>>)[taskKey] ?? {}
    const hoursAgo = (Date.now() - new Date(row.ran_at).getTime()) / 3_600_000

    return {
      task:          displayName,
      last_run:      row.ran_at,
      status:        (taskData.status as string | undefined) ?? 'unknown',
      hours_since:   Math.round(hoursAgo * 10) / 10,
      rows_deleted:  (taskData.rows_deleted as number | undefined) ?? null,
      error_message: (taskData.message as string | undefined) ?? null,
    }
  })

  // Cron schedule summary (from vercel.json)
  const cron_schedule = '0 3 * * *'  // 03:00 UTC daily
  const cron_configured = process.env.CRON_SECRET !== undefined

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

  if (!cron_configured)
    warnings.push('CRON_SECRET not set — cron endpoint is open to unauthenticated calls')

  const recent_runs = rows.map(r => ({
    id:      r.id,
    ran_at:  r.ran_at,
    tasks:   r.tasks,
  }))

  const all_ok = table_available && task_status.every(
    t => t.status !== 'never_run' && t.status !== 'error' && (t.hours_since ?? 99) < 26
  )

  const status =
    !table_available                    ? 'missing'  :
    !all_ok || warnings.length > 0      ? 'degraded' :
    'healthy'

  return res.status(200).json({
    status,
    table_available,
    cron_schedule,
    cron_configured,
    task_status,
    recent_runs: recent_runs.slice(0, 10),
    warnings,
    checked_at: new Date().toISOString(),
  })
}
