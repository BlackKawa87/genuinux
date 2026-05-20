/**
 * Shared helpers for owner-only admin endpoints.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function adminSb(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function verifyOwnerJwt(authHeader: string | undefined): Promise<boolean> {
  const token = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false

  const url  = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) return false

  const userSb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user } } = await userSb.auth.getUser()
  if (!user) return false

  const { data } = await userSb.from('profiles').select('role').eq('user_id', user.id).single()
  return (data as { role?: string } | null)?.role === 'owner'
}

export const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}
