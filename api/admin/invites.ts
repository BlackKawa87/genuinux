/**
 * GET  /api/admin/invites  — list all beta invite codes
 * POST /api/admin/invites  — create a new invite code
 *
 * Auth: Authorization: Bearer <supabase_access_token> (role must be owner)
 *
 * POST body: { email?: string, note?: string, expires_days?: number }
 * Codes are auto-generated uppercase alphanumeric strings.
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
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

function generateCode(): string {
  // Format: BETA-XXXX-XXXX (12 chars of random uppercase alphanumeric)
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  // no I/O/0/1 to avoid confusion
  const segment = (n: number) =>
    Array.from(crypto.randomBytes(n))
      .map(b => chars[b % chars.length])
      .join('')
  return `BETA-${segment(4)}-${segment(4)}`
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()

  const token = ((req.headers['authorization'] ?? '') as string).replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Authorization required' })
  if (!(await verifyOwner(token))) return res.status(403).json({ error: 'Owner role required' })

  const sb = adminClient()

  // ── GET: list all invite codes ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('beta_invites')
      .select('id, code, email, note, used_by, used_at, expires_at, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ invites: data ?? [] })
  }

  // ── POST: create invite code ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { email, note, expires_days = 30 } = (req.body ?? {}) as {
      email?: string; note?: string; expires_days?: number
    }

    const days       = Math.min(365, Math.max(1, Number(expires_days) || 30))
    const expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    const code       = generateCode()

    const { data, error } = await sb
      .from('beta_invites')
      .insert({ code, email: email?.trim() || null, note: note?.trim() || null, expires_at })
      .select('id, code, email, note, expires_at, created_at')
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ invite: data })
  }

  // ── DELETE: revoke invite (mark as used with sentinel date) ──────────────────
  if (req.method === 'DELETE') {
    const id = (req.query.id ?? '') as string
    if (!id) return res.status(400).json({ error: 'id query param required' })

    const { error } = await sb
      .from('beta_invites')
      .update({ used_at: new Date().toISOString(), note: '[revoked]' })
      .eq('id', id)
      .is('used_at', null)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
