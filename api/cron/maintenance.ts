/**
 * GET|POST /api/cron/maintenance — Daily maintenance worker.
 *
 * Scheduled by Vercel Cron: 0 3 * * * (03:00 UTC every day).
 * Can also be triggered manually with the correct auth header.
 *
 * Tasks (in order):
 *   1. Purge expired ai_summary_cache rows (expires_at < NOW())
 *   2. Purge stale webhook_deliveries rows older than 90 days
 *   3. Aggregate yesterday's risk_events into org_daily_stats (v17 migration)
 *   4. Purge risk_events older than 365 days (v17 migration)
 *   5. Pre-create next month's risk_events partition (v18 migration)
 *   6. Write run summary to maintenance_logs (requires v8 schema migration)
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  x-vercel-cron: 1 header
 *       If CRON_SECRET is not set, the endpoint is open — set it in production.
 */

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { captureException, captureMessage } from '../_lib/monitoring.js'
import { createSecurityEvent } from '../_lib/securityEvents.js'

const DELIVERY_RETENTION_DAYS = 90

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function isAuthorized(req: VercelRequest): boolean {
  // Vercel Cron requests carry x-vercel-cron: 1 automatically — always trusted.
  if (req.headers['x-vercel-cron'] === '1') return true

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    // No secret configured — reject manual triggers.
    // Vercel cron calls still work via x-vercel-cron header above.
    // Set CRON_SECRET in Vercel environment variables to allow manual triggers.
    console.warn('[maintenance] CRON_SECRET not set — unauthenticated manual trigger rejected')
    return false
  }

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
      void createSecurityEvent(supabase, {
        event_type: 'infra.cron_failure',
        metadata:   { task: 'ai_cache_purge', error: cacheErr.message.slice(0, 200) },
      }, 'high')
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
      void createSecurityEvent(supabase, {
        event_type: 'infra.cron_failure',
        metadata:   { task: 'webhook_deliveries_purge', error: wdErr.message.slice(0, 200) },
      }, 'high')
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

  // ── Task 3: Aggregate yesterday's events into org_daily_stats ──────────
  try {
    const yesterday = new Date(Date.now() - 86_400_000)
    const targetDate = yesterday.toISOString().slice(0, 10)  // YYYY-MM-DD

    const { error: aggErr } = await supabase
      .rpc('aggregate_daily_stats', { target_date: targetDate })

    if (aggErr) {
      // Function missing = v17 migration not yet run — skip silently
      if (aggErr.message?.includes('does not exist') || aggErr.code === '42883') {
        results.daily_stats_aggregate = { status: 'skipped', reason: 'v17 migration not applied' }
      } else {
        captureException(aggErr, { context: 'maintenance: aggregate_daily_stats' })
        results.daily_stats_aggregate = { status: 'error', message: aggErr.message }
      }
    } else {
      results.daily_stats_aggregate = { status: 'ok', date: targetDate }
      captureMessage(`maintenance: aggregated daily stats for ${targetDate}`, 'info', { ran_at: now })
    }
  } catch (err) {
    captureException(err, { context: 'maintenance: aggregate_daily_stats (exception)' })
    results.daily_stats_aggregate = { status: 'error', message: String(err) }
  }

  // ── Task 4: Purge risk_events older than 365 days ─────────────────────
  try {
    const { data: purgeResult, error: purgeErr } = await supabase
      .rpc('purge_old_risk_events', { retention_days: 365 })

    if (purgeErr) {
      if (purgeErr.message?.includes('does not exist') || purgeErr.code === '42883') {
        results.risk_events_purge = { status: 'skipped', reason: 'v17 migration not applied' }
      } else {
        captureException(purgeErr, { context: 'maintenance: purge_old_risk_events' })
        results.risk_events_purge = { status: 'error', message: purgeErr.message }
      }
    } else {
      const deleted = purgeResult as number ?? 0
      results.risk_events_purge = { status: 'ok', rows_deleted: deleted }
      if (deleted > 0) {
        captureMessage(`maintenance: purged ${deleted} risk_events older than 365 days`, 'info', { ran_at: now })
      }
    }
  } catch (err) {
    captureException(err, { context: 'maintenance: purge_old_risk_events (exception)' })
    results.risk_events_purge = { status: 'error', message: String(err) }
  }

  // ── Task 5: Pre-create next month's risk_events partition ─────────────────
  // Ensures a partition exists 2 months ahead so inserts never miss a partition.
  // Silently skipped if v18 migration (partitioning) is not yet applied.
  try {
    const nextMonth = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)  // ~2 months ahead
    const targetMonth = nextMonth.toISOString().slice(0, 10)

    const { data: partResult, error: partErr } = await supabase
      .rpc('create_risk_events_partition', { target_month: targetMonth })

    if (partErr) {
      if (partErr.message?.includes('does not exist') || partErr.code === '42883') {
        results.partition_create = { status: 'skipped', reason: 'v18 migration not applied' }
      } else {
        captureException(partErr, { context: 'maintenance: create_risk_events_partition' })
        results.partition_create = { status: 'error', message: partErr.message }
      }
    } else {
      results.partition_create = { status: 'ok', result: partResult }
    }
  } catch (err) {
    captureException(err, { context: 'maintenance: create_risk_events_partition (exception)' })
    results.partition_create = { status: 'error', message: String(err) }
  }

  // ── Task 6: Write run to maintenance_logs (v8 migration required) ───────────
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
