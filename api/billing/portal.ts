/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session for managing subscriptions.
 * Auth: Authorization: Bearer <supabase_access_token>
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY
 */

import Stripe from 'stripe'
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

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return res.status(503).json({
      error: 'Stripe is not configured.',
      code: 'STRIPE_NOT_CONFIGURED',
    })
  }

  const token = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing Authorization header.' })

  const { data: { user }, error: authErr } = await userClient(token).auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token.' })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile) return res.status(403).json({ error: 'Profile not found.' })
  if (!['owner'].includes(profile.role as string)) {
    return res.status(403).json({ error: 'Only the organization owner can manage billing.' })
  }

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', profile.organization_id as string)
    .single()

  const customerId = (org as Record<string, unknown> | null)?.stripe_customer_id as string | null

  if (!customerId) {
    return res.status(400).json({
      error: 'No Stripe customer on file. Upgrade to a paid plan first.',
      code: 'NO_CUSTOMER',
    })
  }

  const stripe  = new Stripe(stripeKey)
  const origin  = req.headers.origin ?? `https://${req.headers.host ?? 'genuinux.vercel.app'}`

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: `${origin}/dashboard/settings?tab=billing`,
  })

  return res.status(200).json({ url: portalSession.url })
}
