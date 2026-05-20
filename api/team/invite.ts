/**
 * POST /api/team/invite
 *
 * Sends a team invite email and creates a pending_invites row.
 * Auth: Authorization: Bearer <supabase_access_token>
 * Body: { email: string, role: 'admin' | 'member' }
 *
 * Requires pending_invites table — see migration SQL in Settings → Team tab.
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY    = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Admin client bypasses RLS — server-side only.
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Regular client for verifying caller JWT.
function userClient(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const ALLOWED_ORIGINS = [
  'https://www.genuinux.com',
  'https://genuinux.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

function cors(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers.origin ?? '') as string
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Vary', 'Origin')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'Server not configured — SUPABASE_SERVICE_ROLE_KEY missing.' })
  }

  // ── 1. Authenticate caller ───────────────────────────────────────────────
  const authHeader = req.headers['authorization'] ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing Authorization header.' })

  const { data: { user }, error: authErr } = await userClient(token).auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired token.' })

  // ── 2. Get caller profile (must be owner or admin) ───────────────────────
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (profErr || !profile) return res.status(403).json({ error: 'Profile not found.' })
  if (!['owner', 'admin'].includes(profile.role)) {
    return res.status(403).json({ error: 'Only owners and admins can invite team members.' })
  }

  // ── 3. Validate body ─────────────────────────────────────────────────────
  const { email, role } = req.body as { email?: string; role?: string }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' })
  }
  if (!role || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Role must be "admin" or "member".' })
  }

  const orgId = profile.organization_id as string

  // ── 4. Check for existing active invite ──────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from('pending_invites')
    .select('id')
    .eq('organization_id', orgId)
    .eq('email', email.toLowerCase())
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing) {
    return res.status(409).json({ error: 'An active invite already exists for this email.' })
  }

  // ── 5. Insert pending invite ─────────────────────────────────────────────
  const { data: invite, error: invErr } = await supabaseAdmin
    .from('pending_invites')
    .insert({
      organization_id: orgId,
      email: email.toLowerCase(),
      role,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (invErr || !invite) {
    // Surface migration hint if table doesn't exist
    if (invErr?.code === '42P01') {
      return res.status(500).json({
        error: 'pending_invites table not found. Run the SQL migration in Settings → Team.',
        code: 'TABLE_MISSING',
      })
    }
    return res.status(500).json({ error: invErr?.message ?? 'Failed to create invite.' })
  }

  // ── 6. Send invite email via Supabase Auth admin ──────────────────────────
  const origin = req.headers.origin ?? `https://${req.headers.host ?? 'genuinux.vercel.app'}`
  const redirectTo = `${origin}/join?token=${invite.id as string}`

  const { error: emailErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email.toLowerCase(),
    { redirectTo },
  )

  if (emailErr) {
    // Clean up the invite row if email failed
    await supabaseAdmin.from('pending_invites').delete().eq('id', invite.id)
    return res.status(500).json({ error: `Failed to send invite email: ${emailErr.message}` })
  }

  return res.status(200).json({ success: true, message: `Invite sent to ${email}.` })
}
