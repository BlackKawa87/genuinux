/**
 * POST /api/beta/use-invite
 *
 * Marks a beta invite code as used after a successful signup.
 * Auth: Authorization: Bearer <supabase_access_token>
 *
 * Body: { code: string }
 * Response: { ok: boolean }
 *
 * Idempotent if called multiple times for the same code+user pair —
 * uses a conditional update (WHERE used_at IS NULL).
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

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

  const { code } = req.body as { code?: string }
  if (!code?.trim()) return res.status(400).json({ ok: false, message: 'code required' })

  // ── Mark invite as used (only if not already used) ───────────────────────────
  const sb = adminClient()
  await sb
    .from('beta_invites')
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq('code', code.trim().toUpperCase())
    .is('used_at', null)  // idempotent guard

  return res.status(200).json({ ok: true })
}
