/**
 * GET /api/beta/validate-invite?code=xxx[&email=user@example.com]
 *
 * Pre-flight check before signup. Does NOT mark the invite as used.
 * The real ownership gate is in POST /api/beta/use-invite.
 *
 * Validation order:
 *   1. Invite exists
 *   2. Not revoked (note = '[revoked]')
 *   3. Not already used
 *   4. Not expired
 *   5. If invite.email is set and email param is provided: must match (case-insensitive)
 *
 * Security: never exposes invite records, email addresses, or whether an email
 * is registered in the system.
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createSecurityEvent } from '../_lib/securityEvents.js'

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ valid: false, message: 'Method not allowed' })

  const code      = ((req.query.code  ?? '') as string).trim().toUpperCase()
  const emailRaw  = ((req.query.email ?? '') as string).trim().toLowerCase()

  if (!code) {
    return res.status(400).json({ valid: false, message: 'code parameter required' })
  }

  const sb = adminClient()

  const { data } = await sb
    .from('beta_invites')
    .select('id, email, used_at, expires_at, note')
    .eq('code', code)
    .single()

  // 1. Not found
  if (!data) {
    return res.status(200).json({ valid: false, message: 'Invalid invite code.' })
  }

  const invite = data as {
    id: string
    email: string | null
    used_at: string | null
    expires_at: string
    note: string | null
  }

  // 2. Revoked
  if (invite.note === '[revoked]') {
    return res.status(200).json({ valid: false, message: 'Invalid invite code.' })
  }

  // 3. Already used
  if (invite.used_at) {
    return res.status(200).json({ valid: false, message: 'This invite has already been used.' })
  }

  // 4. Expired
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(200).json({ valid: false, message: 'This invite has expired.' })
  }

  // 5. Email match — only checked when both the invite and the request have an email
  if (invite.email && emailRaw) {
    const inviteEmail = invite.email.trim().toLowerCase()
    if (inviteEmail !== emailRaw) {
      // Fire security event — log domain only, not full email
      void createSecurityEvent(sb, {
        event_type: 'beta_invite.email_mismatch',
        metadata: {
          invite_id:           invite.id,
          signup_email_domain: emailRaw.split('@')[1] ?? 'unknown',
        },
      }, 'medium')

      return res.status(200).json({
        valid:   false,
        message: 'This invite is not assigned to this email address.',
      })
    }
  }

  return res.status(200).json({ valid: true })
}
