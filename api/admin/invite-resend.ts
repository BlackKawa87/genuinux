/**
 * POST /api/admin/invite-resend
 *
 * Resends the beta invite email for an existing, active invite.
 * Auth: Authorization: Bearer <supabase_access_token> (role must be owner)
 * Body: { invite_id: string }
 *
 * Rejects if: invite not found, revoked, already used, or has no email address.
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendInviteEmail } from '../_lib/email.js'

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function userClient(accessToken: string) {
  const url  = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Missing Supabase env vars')
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}

async function verifyOwner(token: string): Promise<boolean> {
  const sb = userClient(token)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false
  const { data } = await sb.from('profiles').select('role').eq('user_id', user.id).single()
  return (data as { role?: string } | null)?.role === 'owner'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = ((req.headers['authorization'] ?? '') as string).replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization required' })
  if (!(await verifyOwner(token))) return res.status(403).json({ error: 'Owner role required' })

  const { invite_id } = (req.body ?? {}) as { invite_id?: string }
  if (!invite_id?.trim()) return res.status(400).json({ error: 'invite_id required' })

  const sb = adminClient()

  const { data } = await sb
    .from('beta_invites')
    .select('id, code, email, note, used_at, expires_at')
    .eq('id', invite_id.trim())
    .single()

  if (!data) return res.status(404).json({ error: 'Invite not found' })

  const invite = data as {
    id: string; code: string; email: string | null
    note: string | null; used_at: string | null; expires_at: string
  }

  if (invite.note === '[revoked]') {
    return res.status(400).json({ error: 'Cannot resend a revoked invite.' })
  }
  if (invite.used_at) {
    return res.status(400).json({ error: 'Cannot resend an already-used invite.' })
  }
  if (!invite.email) {
    return res.status(400).json({ error: 'This invite has no email address.' })
  }

  const result = await sendInviteEmail({
    to:         invite.email,
    inviteCode: invite.code,
    expiresAt:  invite.expires_at,
    note:       invite.note,
  })

  void sb.from('audit_logs').insert({
    action:   'beta_invite.resent',
    metadata: {
      invite_id: invite.id,
      to:        invite.email,
      success:   result.sent,
      ...(result.error ? { error: result.error } : {}),
    },
  })

  if (!result.sent) {
    return res.status(502).json({ email_sent: false, message: result.error ?? 'Failed to send email.' })
  }

  return res.status(200).json({ email_sent: true })
}
