/**
 * GET /api/beta/validate-invite?code=xxx
 *
 * Checks whether a beta invite code is valid without exposing the
 * invite table to the client (service role key used server-side).
 *
 * Response: { valid: boolean, message?: string }
 *
 * Codes are invalid when:
 *   - not found in beta_invites
 *   - already used (used_at IS NOT NULL)
 *   - expired (expires_at < NOW())
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

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

  const code = (req.query.code ?? '') as string
  if (!code.trim()) {
    return res.status(400).json({ valid: false, message: 'code parameter required' })
  }

  const sb = adminClient()
  const { data } = await sb
    .from('beta_invites')
    .select('id, used_at, expires_at')
    .eq('code', code.trim().toUpperCase())
    .single()

  if (!data) {
    return res.status(200).json({ valid: false, message: 'Invite code not found.' })
  }

  if (data.used_at) {
    return res.status(200).json({ valid: false, message: 'This invite code has already been used.' })
  }

  if (new Date(data.expires_at as string) < new Date()) {
    return res.status(200).json({ valid: false, message: 'This invite code has expired.' })
  }

  return res.status(200).json({ valid: true })
}
