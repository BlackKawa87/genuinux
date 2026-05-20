/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout session and returns the redirect URL.
 * Auth: Authorization: Bearer <supabase_access_token>
 * Body: { plan: 'starter' | 'growth' }
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_STARTER   — Stripe Price ID for Starter plan (£99/mo)
 *   STRIPE_PRICE_GROWTH    — Stripe Price ID for Growth plan (£499/mo)
 *   STRIPE_PRICE_PRO       — Legacy alias for Growth; used if STRIPE_PRICE_GROWTH not set
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY    = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const PRICE_MAP: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth:  process.env.STRIPE_PRICE_GROWTH ?? process.env.STRIPE_PRICE_PRO,
  pro:     process.env.STRIPE_PRICE_PRO,
}

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
      error: 'Stripe is not configured on this server. Add STRIPE_SECRET_KEY to your environment.',
      code: 'STRIPE_NOT_CONFIGURED',
    })
  }

  // ── 1. Authenticate caller ───────────────────────────────────────────────
  const token = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing Authorization header.' })

  const { data: { user }, error: authErr } = await userClient(token).auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token.' })

  // ── 2. Validate plan ─────────────────────────────────────────────────────
  const { plan } = req.body as { plan?: string }
  if (!plan || !PRICE_MAP[plan]) {
    return res.status(400).json({ error: 'plan must be "starter" or "growth".' })
  }
  const priceId = PRICE_MAP[plan]
  if (!priceId) {
    return res.status(503).json({
      error: `Price ID for "${plan}" plan not configured. Add STRIPE_PRICE_${plan.toUpperCase()} to env.`,
      code: 'PRICE_NOT_CONFIGURED',
    })
  }

  // ── 3. Get org + existing Stripe customer ────────────────────────────────
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile) return res.status(403).json({ error: 'Profile not found.' })
  if (!['owner'].includes(profile.role as string)) {
    return res.status(403).json({ error: 'Only the organization owner can manage billing.' })
  }

  const orgId = profile.organization_id as string

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, stripe_customer_id')
    .eq('id', orgId)
    .single()

  if (!org) return res.status(404).json({ error: 'Organization not found.' })

  const stripe = new Stripe(stripeKey)
  const origin = req.headers.origin ?? `https://${req.headers.host ?? 'genuinux.vercel.app'}`

  // ── 4. Get or create Stripe customer ─────────────────────────────────────
  let customerId = (org as Record<string, unknown>).stripe_customer_id as string | null

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: (org as Record<string, unknown>).name as string,
      metadata: { organization_id: orgId, user_id: user.id },
    })
    customerId = customer.id

    // Persist customer ID (requires stripe_customer_id column — see migration)
    await supabaseAdmin
      .from('organizations')
      .update({ stripe_customer_id: customerId } as Record<string, unknown>)
      .eq('id', orgId)
  }

  // ── 5. Create checkout session ───────────────────────────────────────────
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard/settings?tab=billing&success=1`,
    cancel_url:  `${origin}/dashboard/settings?tab=billing`,
    subscription_data: {
      metadata: { organization_id: orgId },
    },
    allow_promotion_codes: true,
  })

  return res.status(200).json({ url: session.url })
}
