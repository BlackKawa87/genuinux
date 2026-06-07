/**
 * GET  /api/admin/platform/users   — list all users across all orgs
 * PATCH /api/admin/platform/users  — change role or disable/enable user
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const token = ((req.headers.authorization ?? '') as string).replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization required' })

  const uc = userClient(token)
  const { data: { user }, error: authErr } = await uc.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: myProfile } = await uc.from('profiles')
    .select('is_platform_admin').eq('user_id', user.id).single()
  if (!myProfile?.is_platform_admin) return res.status(403).json({ error: 'Platform admin access required' })

  const supa = createClient(supabaseUrl, serviceKey)

  // ── GET — list all users with org name ──────────────────────────────────────
  if (req.method === 'GET') {
    const [profilesRes, orgsRes] = await Promise.allSettled([
      supa.from('profiles')
        .select('id, user_id, full_name, email, role, organization_id, created_at, is_platform_admin')
        .order('created_at', { ascending: false })
        .limit(500),
      supa.from('organizations').select('id, name, plan'),
    ])

    type ProfileRow = { id: string; user_id: string; full_name: string | null; email: string; role: string; organization_id: string; created_at: string; is_platform_admin: boolean }
    type OrgRow     = { id: string; name: string; plan: string }

    const profiles: ProfileRow[] = profilesRes.status === 'fulfilled' ? (profilesRes.value.data ?? []) as ProfileRow[] : []
    const orgMap: Record<string, OrgRow> = {}
    if (orgsRes.status === 'fulfilled') {
      for (const o of (orgsRes.value.data ?? []) as OrgRow[]) orgMap[o.id] = o
    }

    return res.status(200).json({
      users: profiles.map(p => ({
        id:                 p.id,
        user_id:            p.user_id,
        full_name:          p.full_name,
        email:              p.email,
        role:               p.role,
        is_platform_admin:  p.is_platform_admin ?? false,
        organization_id:    p.organization_id,
        org_name:           orgMap[p.organization_id]?.name ?? '—',
        org_plan:           orgMap[p.organization_id]?.plan ?? '—',
        created_at:         p.created_at,
      })),
      total:        profiles.length,
      generated_at: new Date().toISOString(),
    })
  }

  // ── PATCH — change role ──────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    type PatchBody = { profile_id?: string; role?: string; is_platform_admin?: boolean }
    const body = req.body as PatchBody
    if (!body.profile_id) return res.status(400).json({ error: 'profile_id required' })

    const updates: Record<string, unknown> = {}
    if (body.role !== undefined) updates.role = body.role
    if (body.is_platform_admin !== undefined) updates.is_platform_admin = body.is_platform_admin

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No changes provided' })

    const { data: target } = await supa.from('profiles').select('organization_id, email').eq('id', body.profile_id).single()
    if (!target) return res.status(404).json({ error: 'User not found' })

    const { error } = await supa.from('profiles').update(updates).eq('id', body.profile_id)
    if (error) return res.status(500).json({ error: error.message })

    await supa.from('audit_logs').insert({
      organization_id: (target as { organization_id: string }).organization_id,
      actor_id:        user.id,
      action:          'user.role_changed',
      metadata:        { profile_id: body.profile_id, updates, admin_user_id: user.id },
    })

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
