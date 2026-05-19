/**
 * POST /api/team/accept
 *
 * Accepts a pending team invite. Handles the full flow atomically using the
 * service role so that RLS doesn't block org deletion.
 *
 * Auth: Authorization: Bearer <supabase_access_token>  (from the user who accepted)
 * Body: { token: string }   — the pending_invites.id UUID
 *
 * Steps:
 *   1. Verify caller JWT
 *   2. Fetch invite (must be valid, unexpired, unaccepted, email-matched)
 *   3. Capture the auto-created org ID from the caller's current profile
 *   4. Update profile → invited org + role
 *   5. Mark invite accepted_at = now()
 *   6. Delete the auto-created org (cascade removes all its orphaned rows)
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY    = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function userClient(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'Server not configured.' })
  }

  // ── 1. Verify caller JWT ─────────────────────────────────────────────────
  const token = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing Authorization header.' })

  const { data: { user }, error: authErr } = await userClient(token).auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token.' })

  // ── 2. Fetch invite ──────────────────────────────────────────────────────
  const { inviteToken } = req.body as { inviteToken?: string }
  if (!inviteToken) return res.status(400).json({ error: 'inviteToken required.' })

  const { data: invite, error: invErr } = await supabaseAdmin
    .from('pending_invites')
    .select('id, organization_id, email, role, expires_at, accepted_at')
    .eq('id', inviteToken)
    .single()

  if (invErr || !invite) {
    return res.status(404).json({ error: 'Invite not found or already used.' })
  }
  if (invite.accepted_at) {
    return res.status(409).json({ error: 'This invite has already been accepted.' })
  }
  if (new Date(invite.expires_at as string) < new Date()) {
    return res.status(410).json({ error: 'Invite link has expired.' })
  }
  if ((invite.email as string).toLowerCase() !== (user.email ?? '').toLowerCase()) {
    return res.status(403).json({
      error: `This invite was sent to ${invite.email as string}. Sign in with that email.`,
    })
  }

  // ── 3. Get current (auto-created) org from caller profile ────────────────
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  const autoCreatedOrgId = profile?.organization_id as string | null
  const invitedOrgId     = invite.organization_id as string

  // ── 4. Update profile to invited org + role ──────────────────────────────
  const { error: profErr } = await supabaseAdmin
    .from('profiles')
    .update({ organization_id: invitedOrgId, role: invite.role })
    .eq('user_id', user.id)

  if (profErr) {
    return res.status(500).json({ error: `Failed to update profile: ${profErr.message}` })
  }

  // ── 5. Mark invite accepted ───────────────────────────────────────────────
  await supabaseAdmin
    .from('pending_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inviteToken)

  // ── 6. Delete auto-created org (only if different from the invited org) ───
  if (autoCreatedOrgId && autoCreatedOrgId !== invitedOrgId) {
    // Verify the user was the owner before deleting (safety check).
    const { data: autoOrg } = await supabaseAdmin
      .from('organizations')
      .select('id, owner_id')
      .eq('id', autoCreatedOrgId)
      .single()

    if (autoOrg && (autoOrg as Record<string, unknown>).owner_id === user.id) {
      await supabaseAdmin
        .from('organizations')
        .delete()
        .eq('id', autoCreatedOrgId)
    }
  }

  // Fetch org name for the response
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', invitedOrgId)
    .single()

  return res.status(200).json({
    success: true,
    org_name: (org as Record<string, unknown> | null)?.name ?? 'the organization',
  })
}
