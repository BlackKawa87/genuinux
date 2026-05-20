/**
 * GET|POST /api/cron/maintenance — Daily maintenance worker.
 *
 * Scheduled by Vercel Cron: 0 3 * * * (03:00 UTC every day).
 * Can also be triggered manually with the correct auth header.
 *
 * Tasks (in order):
 *   1. Purge expired ai_summary_cache rows (expires_at < NOW())
 *   2. Purge stale webhook_deliveries rows older than 90 days
 *   3. Write run summary to maintenance_logs (requires v8 schema migration)
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  x-vercel-cron: 1 header
 *       If CRON_SECRET is not set, the endpoint is open — set it in production.
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { captureException, captureMessage } from '../_lib/monitoring'

const DELIVERY_RETENTION_DAYS = 90

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function isAuthorized(req: VercelRequest): boolean {
  if (req.headers['x-vercel-cron'] === '1') return true

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true

  const auth  = (req.headers['authorization'] ?? '') as string
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  return token === cronSecret
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = adminClient()
  const now      = new Date().toISOString()
  const results: Record<string, unknown> = { ran_at: now }

  // ── Task 1: Purge expired AI summary cache rows ─────────────────────────
  try {
    const { error: cacheErr, count: cacheCount } = await supabase
      .from('ai_summary_cache')
      .delete({ count: 'exact' })
      .lt('expires_at', now)

    if (cacheErr) {
      captureException(cacheErr, { context: 'maintenance: ai_summary_cache purge' })
      results.ai_cache_purge = { status: 'error', message: cacheErr.message }
    } else {
      results.ai_cache_purge = { status: 'ok', rows_deleted: cacheCount ?? 0 }
      captureMessage(
        `maintenance: purged ${cacheCount ?? 0} expired ai_summary_cache rows`,
        'info',
        { ran_at: now },
      )
    }
  } catch (err) {
    captureException(err, { context: 'maintenance: ai_summary_cache purge (exception)' })
    results.ai_cache_purge = { status: 'error', message: String(err) }
  }

  // ── Task 2: Purge old webhook_deliveries (90-day retention) ─────────────
  try {
    const cutoff = new Date(Date.now() - DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { error: wdErr, count: wdCount } = await supabase
      .from('webhook_deliveries')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff)

    if (wdErr) {
      captureException(wdErr, { context: 'maintenance: webhook_deliveries purge' })
      results.webhook_deliveries_purge = { status: 'error', message: wdErr.message }
    } else {
      results.webhook_deliveries_purge = { status: 'ok', rows_deleted: wdCount ?? 0 }
      captureMessage(
        `maintenance: purged ${wdCount ?? 0} old webhook_deliveries rows`,
        'info',
        { cutoff, ran_at: now },
      )
    }
  } catch (err) {
    captureException(err, { context: 'maintenance: webhook_deliveries purge (exception)' })
    results.webhook_deliveries_purge = { status: 'error', message: String(err) }
  }

  // ── Task 3: Write run to maintenance_logs (v8 migration required) ───────────
  try {
    await supabase.from('maintenance_logs').insert({
      ran_at:  now,
      tasks:   results,
    })
  } catch {
    // maintenance_logs table is optional — silently skip if not yet migrated
  }

  return res.status(200).json(results)
}
