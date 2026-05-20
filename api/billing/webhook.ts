/**
 * POST /api/billing/webhook
 *
 * Handles Stripe webhook events to keep the organizations.plan in sync.
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard → Webhooks → endpoint secret
 *
 * Events handled:
 *   customer.subscription.created  → set plan from price
 *   customer.subscription.updated  → update plan
 *   customer.subscription.deleted  → downgrade to 'free'
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createSecurityEvent } from '../_lib/securityEvents'

const SUPABASE_URL  = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const STRIPE_KEY    = process.env.STRIPE_SECRET_KEY ?? ''
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

// Price ID → plan name mapping
const PRICE_PLAN_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_STARTER ?? '___']: 'starter',
  [process.env.STRIPE_PRICE_GROWTH  ?? '___']: 'growth',
  [process.env.STRIPE_PRICE_PRO     ?? '___']: 'pro',
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function getPlanFromItems(items: Stripe.SubscriptionItem[]): string {
  for (const item of items) {
    const priceId = typeof item.price === 'string' ? item.price : item.price.id
    const plan = PRICE_PLAN_MAP[priceId]
    if (plan) return plan
  }
  return 'free'
}

export const config = { api: { bodyParser: false } }

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end',  () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!STRIPE_KEY || !WEBHOOK_SECRET) return res.status(503).json({ error: 'Stripe not configured.' })

  const rawBody = await getRawBody(req)
  const sig     = req.headers['stripe-signature'] as string | undefined

  let event: Stripe.Event
  try {
    const stripe = new Stripe(STRIPE_KEY)
    event = stripe.webhooks.constructEvent(rawBody, sig ?? '', WEBHOOK_SECRET)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Stripe webhook signature verification failed:', msg)
    const fwd = req.headers['x-forwarded-for']
    const actorIp = typeof fwd === 'string' ? fwd.split(',')[0].trim() || null : null
    void createSecurityEvent(supabaseAdmin, {
      event_type: 'webhook.signature_invalid',
      actor_ip:   actorIp,
      metadata:   { source: 'stripe', error: msg.slice(0, 200) },
    }, 'high')
    return res.status(400).json({ error: `Webhook error: ${msg}` })
  }

  const sub = event.data.object as Stripe.Subscription

  if (event.type === 'customer.subscription.deleted') {
    const orgId = sub.metadata?.organization_id
    if (orgId) {
      await supabaseAdmin
        .from('organizations')
        .update({ plan: 'free' } as Record<string, unknown>)
        .eq('id', orgId)
    }
    return res.status(200).json({ received: true })
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated'
  ) {
    const orgId = sub.metadata?.organization_id
    if (orgId) {
      const plan = getPlanFromItems(sub.items.data)
      await supabaseAdmin
        .from('organizations')
        .update({ plan } as Record<string, unknown>)
        .eq('id', orgId)
    }
    return res.status(200).json({ received: true })
  }

  return res.status(200).json({ received: true })
}
