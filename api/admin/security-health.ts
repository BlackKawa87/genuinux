/**
 * GET /api/admin/security-health
 * Security infrastructure monitor — owner only.
 * Queries security_events table for threats, anomalies, and auth events.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSb, verifyOwnerJwt, CORS } from '../_lib/adminAuth'

interface SecurityEvent {
  id: string
  event_type: string
  severity: string
  actor_ip: string | null
  actor_user_id: string | null
  organization_id: string | null
  metadata: Record<string, unknown> | null
  occurrence_count: number
  first_seen_at: string
  last_seen_at: string
  created_at: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await verifyOwnerJwt(req.headers['authorization'] as string | undefined)))
    return res.status(403).json({ error: 'Owner role required' })

  const sb = adminSb()

  let events: SecurityEvent[] = []
  let table_available = false

  try {
    const { data, error } = await sb
      .from('security_events')
      .select('id, event_type, severity, actor_ip, actor_user_id, organization_id, metadata, occurrence_count, first_seen_at, last_seen_at, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (!error) {
      table_available = true
      events = (data ?? []) as SecurityEvent[]
    }
  } catch { /* table may not exist */ }

  const last24h = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const recent  = events.filter(e => e.created_at >= last24h)

  const by_severity = {
    critical: events.filter(e => e.severity === 'critical').length,
    high:     events.filter(e => e.severity === 'high').length,
    medium:   events.filter(e => e.severity === 'medium').length,
    low:      events.filter(e => e.severity === 'low').length,
  }

  const by_type: Record<string, number> = {}
  events.forEach(e => {
    by_type[e.event_type] = (by_type[e.event_type] ?? 0) + (e.occurrence_count ?? 1)
  })

  // Health score: 100 base, deductions capped per severity tier
  const healthScore = Math.max(0, Math.min(100,
    100
    - Math.min(by_severity.critical * 25, 60)
    - Math.min(by_severity.high     * 10, 30)
    - Math.min(by_severity.medium   *  3, 15)
  ))

  const healthLabel =
    healthScore >= 80 ? 'healthy' :
    healthScore >= 60 ? 'watch'   :
    healthScore >= 40 ? 'risk'    :
    'critical'

  const warnings: string[] = []

  if (!table_available)
    warnings.push('security_events table not found — run v8 migration to enable security logging')
  if (by_severity.critical > 0)
    warnings.push(`${by_severity.critical} critical severity security events in history`)
  if (recent.filter(e => e.severity === 'high' || e.severity === 'critical').length > 5)
    warnings.push(`${recent.filter(e => ['high','critical'].includes(e.severity)).length} high/critical events in last 24h`)

  const status =
    !table_available         ? 'missing'  :
    by_severity.critical > 0 ? 'critical' :
    warnings.length > 0      ? 'degraded' :
    'healthy'

  return res.status(200).json({
    status,
    health_score: healthScore,
    health_label: healthLabel,
    table_available,
    total_events: events.length,
    events_last_24h: recent.length,
    by_severity,
    by_type,
    recent_events: events.slice(0, 50),
    warnings,
    checked_at: new Date().toISOString(),
  })
}
