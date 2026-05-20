/**
 * POST /api/beta/use-invite
 *
 * Marks a beta invite as used after a successful signup.
 * This is the authoritative ownership gate — validate-invite is pre-flight only.
 *
 * Auth: Authorization: Bearer <supabase_access_token>
 * Body: { code: string, email: string }
 *
 * Validation:
 *   1. Invite exists and is not revoked
 *   2. Invite is not expired
 *   3. Invite is not already used
 *   4. If invite.email is set: must match body.email (case-insensitive)
 *   5. Mark used_by + used_at (WHERE used_at IS NULL for idempotency)
 *   6. Write audit_log entry (beta_invite.used)
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createSecurityEvent } from '../_lib/securityEvents'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  // ── Verify user token ────────────────────────────────────────────────────────
  const auth  = (req.headers['authorization'] ?? '') as string
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ ok: false, message: 'Authorization required' })

  const { data: { user } } = await userClient(token).auth.getUser()
  if (!user) return res.status(401).json({ ok: false, message: 'Invalid token' })

  const { code, email } = (req.body ?? {}) as { code?: string; email?: string }
  if (!code?.trim()) return res.status(400).json({ ok: false, message: 'code required' })
  if (!email?.trim()) return res.status(400).json({ ok: false, message: 'email required' })

  const normalizedEmail = email.trim().toLowerCase()
  const normalizedCode  = code.trim().toUpperCase()

  const sb = adminClient()

  // ── Fetch invite ─────────────────────────────────────────────────────────────
  const { data } = await sb
    .from('beta_invites')
    .select('id, email, used_at, expires_at, note')
    .eq('code', normalizedCode)
    .single()

  if (!data) {
    return res.status(400).json({ ok: false, message: 'Invalid invite code.' })
  }

  const invite = data as {
    id: string
    email: string | null
    used_at: string | null
    expires_at: string
    note: string | null
  }

  // Revoked
  if (invite.note === '[revoked]') {
    return res.status(400).json({ ok: false, message: 'Invalid invite code.' })
  }

  // Already used
  if (invite.used_at) {
    return res.status(400).json({ ok: false, message: 'This invite has already been used.' })
  }

  // Expired
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(400).json({ ok: false, message: 'This invite has expired.' })
  }

  // ── Email ownership check ────────────────────────────────────────────────────
  if (invite.email) {
    const inviteEmail = invite.email.trim().toLowerCase()
    if (inviteEmail !== normalizedEmail) {
      void createSecurityEvent(sb, {
        event_type: 'beta_invite.email_mismatch',
        metadata: {
          invite_id:           invite.id,
          signup_email_domain: normalizedEmail.split('@')[1] ?? 'unknown',
        },
      }, 'medium')
      return res.status(403).json({
        ok:      false,
        message: 'This invite is not assigned to this email address.',
      })
    }
  }

  // ── Mark invite as used ──────────────────────────────────────────────────────
  await sb
    .from('beta_invites')
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq('code', normalizedCode)
    .is('used_at', null) // idempotency guard

  // ── Audit log ────────────────────────────────────────────────────────────────
  try {
    // Best-effort: get org_id from profile if available
    const { data: profile } = await sb
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    const orgId = (profile as { organization_id?: string } | null)?.organization_id ?? null

    await sb.from('audit_logs').insert({
      user_id:         user.id,
      organization_id: orgId,
      action:          'beta_invite.used',
      metadata: {
        invite_id:    invite.id,
        invite_email: invite.email ?? null,
        signup_email: normalizedEmail,
        code:         normalizedCode,
      },
    })
  } catch {
    // Audit log is best-effort — never block the response
  }

  return res.status(200).json({ ok: true })
}
