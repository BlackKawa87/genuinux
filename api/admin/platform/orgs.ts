/**
 * GET   /api/admin/platform/orgs         — list all orgs with stats
 * PATCH /api/admin/platform/orgs         — update plan / suspend / reactivate
 *
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

async function requirePlatformAdmin(token: string) {
  const uc = userClient(token)
  const { data: { user }, error } = await uc.auth.getUser()
  if (error || !user) return null
  const { data: profile } = await uc.from('profiles')
    .select('user_id, is_platform_admin').eq('user_id', user.id).single()
  return profile?.is_platform_admin ? user : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const token = ((req.headers.authorization ?? '') as string).replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization required' })

  const adminUser = await requirePlatformAdmin(token)
  if (!adminUser) return res.status(403).json({ error: 'Platform admin access required' })

  const supa = createClient(supabaseUrl, serviceKey)

  // ── GET — list all orgs with stats ──────────────────────────────────────────
  if (req.method === 'GET') {
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`

    const [orgsRes, profilesRes, keysRes, statsRes, activityRes] = await Promise.allSettled([
      supa.from('organizations').select('id, name, plan, plan_source, shadow_mode, suspended_at, created_at').order('created_at', { ascending: false }),
      supa.from('profiles').select('organization_id'),
      supa.from('api_keys').select('organization_id').eq('status', 'active'),
      supa.from('org_daily_stats').select('organization_id, total_requests').gte('date', monthStart),
      supa.from('risk_events').select('organization_id, created_at').order('created_at', { ascending: false }).limit(500),
    ])

    type OrgRow = { id: string; name: string; plan: string; plan_source: string | null; shadow_mode: boolean; suspended_at: string | null; created_at: string }

    const orgs: OrgRow[] = orgsRes.status === 'fulfilled' ? (orgsRes.value.data ?? []) as OrgRow[] : []

    // Build per-org lookup maps
    const userCounts: Record<string, number> = {}
    if (profilesRes.status === 'fulfilled') {
      for (const p of profilesRes.value.data ?? []) {
        const oid = (p as { organization_id: string }).organization_id
        userCounts[oid] = (userCounts[oid] ?? 0) + 1
      }
    }

    const keyCounts: Record<string, number> = {}
    if (keysRes.status === 'fulfilled') {
      for (const k of keysRes.value.data ?? []) {
        const oid = (k as { organization_id: string }).organization_id
        keyCounts[oid] = (keyCounts[oid] ?? 0) + 1
      }
    }

    const monthlyEvents: Record<string, number> = {}
    if (statsRes.status === 'fulfilled') {
      for (const s of statsRes.value.data ?? []) {
        const r = s as { organization_id: string; total_requests: number }
        monthlyEvents[r.organization_id] = (monthlyEvents[r.organization_id] ?? 0) + r.total_requests
      }
    }

    const lastActivity: Record<string, string> = {}
    if (activityRes.status === 'fulfilled') {
      for (const e of activityRes.value.data ?? []) {
        const r = e as { organization_id: string; created_at: string }
        if (!lastActivity[r.organization_id]) lastActivity[r.organization_id] = r.created_at
      }
    }

    return res.status(200).json({
      orgs: orgs.map(o => ({
        id:            o.id,
        name:          o.name,
        plan:          o.plan,
        plan_source:   o.plan_source ?? 'stripe',
        shadow_mode:   o.shadow_mode,
        suspended_at:  o.suspended_at,
        created_at:    o.created_at,
        user_count:    userCounts[o.id] ?? 0,
        key_count:     keyCounts[o.id] ?? 0,
        events_month:  monthlyEvents[o.id] ?? 0,
        last_activity: lastActivity[o.id] ?? null,
      })),
      generated_at: new Date().toISOString(),
    })
  }

  // ── PATCH — update plan / suspend / reactivate ───────────────────────────────
  if (req.method === 'PATCH') {
    type PatchBody = { org_id?: string; plan?: string; plan_source?: string; action?: 'suspend' | 'reactivate' }
    const body = req.body as PatchBody
    if (!body.org_id) return res.status(400).json({ error: 'org_id required' })

    const { data: org } = await supa.from('organizations').select('plan, plan_source').eq('id', body.org_id).single()
    if (!org) return res.status(404).json({ error: 'Organization not found' })

    const updates: Record<string, unknown> = {}
    const auditMeta: Record<string, unknown> = { org_id: body.org_id, admin_user_id: adminUser.id }

    if (body.plan && body.plan !== org.plan) {
      updates.plan = body.plan
      updates.plan_source = body.plan_source ?? 'admin_grant'
      auditMeta.old_plan = org.plan
      auditMeta.new_plan = body.plan
      auditMeta.plan_source = updates.plan_source
    }

    if (body.action === 'suspend') {
      updates.suspended_at = new Date().toISOString()
      updates.suspended_by = adminUser.id
      auditMeta.action = 'suspend'
    }

    if (body.action === 'reactivate') {
      updates.suspended_at = null
      updates.suspended_by = null
      auditMeta.action = 'reactivate'
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No changes provided' })

    const { error: updateErr } = await supa.from('organizations').update(updates).eq('id', body.org_id)
    if (updateErr) return res.status(500).json({ error: updateErr.message })

    // Audit log
    await supa.from('audit_logs').insert({
      organization_id: body.org_id,
      actor_id:        adminUser.id,
      action:          body.plan ? 'org.plan_changed' : `org.${body.action}`,
      metadata:        auditMeta,
    })

    return res.status(200).json({ ok: true, updated: updates })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
