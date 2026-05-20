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
  ip_address: string | null
  user_id: string | null
  organization_id: string | null
  metadata: Record<string, unknown> | null
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
      .select('id, event_type, severity, ip_address, user_id, organization_id, metadata, created_at')
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
    by_type[e.event_type] = (by_type[e.event_type] ?? 0) + 1
  })

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
    table_available,
    total_events: events.length,
    events_last_24h: recent.length,
    by_severity,
    by_type,
    recent_events: recent.slice(0, 10),
    warnings,
    checked_at: new Date().toISOString(),
  })
}
