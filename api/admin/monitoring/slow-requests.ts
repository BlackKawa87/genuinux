/**
 * GET /api/admin/monitoring/slow-requests?limit=20
 *
 * Returns recent slow requests (total_ms > 1000ms) from audit_logs.
 * Records are written fire-and-forget by /api/risk/check when total_ms > 1000.
 *
 * Each row includes full step-by-step timing breakdown:
 *   key_ms, org_ms, rate_ms, monthly_ms, context_ms, engine_ms, gnx_ms, total_ms
 * plus cold_start boolean and context_path ('redis' | 'rpc').
 *
 * Auth: Bearer <supabase_access_token> (owner only)
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey     = process.env.VITE_SUPABASE_ANON_KEY ?? ''

function userClient(token: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = ((req.headers.authorization ?? '') as string).replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization required' })

  const userSupa = userClient(token)
  const { data: { user }, error: authErr } = await userSupa.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await userSupa
    .from('profiles')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.organization_id) return res.status(403).json({ error: 'No organization' })
  if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner role required' })

  const orgId = profile.organization_id as string
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20))
  const supa  = createClient(supabaseUrl, serviceKey)

  const { data, error } = await supa
    .from('audit_logs')
    .select('id, event_type, metadata, created_at')
    .eq('organization_id', orgId)
    .eq('event_type', 'risk.check.slow')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return res.status(200).json({
      slow_requests: [],
      total:         0,
      notice:        'No slow request data yet. Requests exceeding 1000ms are logged automatically.',
      generated_at:  new Date().toISOString(),
    })
  }

  type AuditRow = {
    id: string
    event_type: string
    metadata: Record<string, unknown> | null
    created_at: string
  }
  const rows = (data ?? []) as AuditRow[]

  return res.status(200).json({
    slow_requests: rows.map(r => {
      const m   = r.metadata ?? {}
      const tms = (m.timings_ms ?? {}) as Record<string, number>
      const c   = (m.cache     ?? {}) as Record<string, string>
      return {
        id:           r.id,
        created_at:   r.created_at,
        total_ms:     (m.total_ms     as number)  ?? null,
        cold_start:   (m.cold_start   as boolean) ?? null,
        context_path: (m.context_path as string)  ?? null,
        key_ms:       tms.key_ms     ?? null,
        org_ms:       tms.org_ms     ?? null,
        rate_ms:      tms.rate_ms    ?? null,
        monthly_ms:   tms.monthly_ms ?? null,
        context_ms:   tms.context_ms ?? null,
        engine_ms:    tms.engine_ms  ?? null,
        gnx_ms:       tms.gnx_ms    ?? null,
        persist_ms:   (m.persist_ms  as number)   ?? null,
        cache:        c,
      }
    }),
    total:        rows.length,
    generated_at: new Date().toISOString(),
  })
}
