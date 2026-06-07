/**
 * GET /api/admin/platform/audit?limit=100&org_id=&action=
 *
 * Audit log viewer across ALL organizations.
 * Auth: Bearer <supabase_access_token> (is_platform_admin only)
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey     = process.env.VITE_SUPABASE_ANON_KEY ?? ''

function userClient(token: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = ((req.headers.authorization ?? '') as string).replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization required' })

  const uc = userClient(token)
  const { data: { user }, error: authErr } = await uc.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await uc.from('profiles').select('is_platform_admin').eq('user_id', user.id).single()
  if (!profile?.is_platform_admin) return res.status(403).json({ error: 'Platform admin access required' })

  const supa  = createClient(supabaseUrl, serviceKey)
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '100'), 10) || 100))

  let query = supa
    .from('audit_logs')
    .select('id, organization_id, actor_id, action, event_type, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (req.query.org_id) query = query.eq('organization_id', String(req.query.org_id))
  if (req.query.action)  query = query.eq('action', String(req.query.action))

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  // Enrich with org names
  const orgIds = [...new Set((data ?? []).map((r: Record<string, unknown>) => r.organization_id as string))]
  const { data: orgs } = await supa.from('organizations').select('id, name').in('id', orgIds)
  const orgMap: Record<string, string> = {}
  for (const o of (orgs ?? []) as { id: string; name: string }[]) orgMap[o.id] = o.name

  type LogRow = { id: string; organization_id: string; actor_id: string | null; action: string | null; event_type: string | null; metadata: Record<string, unknown> | null; created_at: string }

  return res.status(200).json({
    logs: ((data ?? []) as LogRow[]).map(r => ({
      id:              r.id,
      organization_id: r.organization_id,
      org_name:        orgMap[r.organization_id] ?? '—',
      actor_id:        r.actor_id,
      action:          r.action ?? r.event_type ?? '—',
      metadata:        r.metadata,
      created_at:      r.created_at,
    })),
    total:        (data ?? []).length,
    generated_at: new Date().toISOString(),
  })
}
