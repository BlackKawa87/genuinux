/**
 * GET /api/debug/plan
 *
 * Diagnostic endpoint — traces the full plan resolution chain for a given API key.
 * Returns every value in the path:
 *   Bearer key → api_keys row → organization_id → organizations.plan
 *   → currentPlan → PLAN_WINDOWS lookup → tier → limit
 *
 * Also returns ALL organizations linked to any active API key, so org/key
 * mismatches are immediately visible.
 *
 * Usage:
 *   curl https://www.genuinux.com/api/debug/plan \
 *     -H "Authorization: Bearer gnx_live_..."
 *
 * Remove this file after the rate-limit plan bug is resolved.
 */

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const PLAN_WINDOWS: Record<string, number> = {
  free:        30,
  starter:     60,
  growth:     100,
  pro:        100,
  enterprise: 200,
}

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

function hashKey(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()

  const authHeader = req.headers?.['authorization'] as string | undefined
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <api_key>' })
  }
  const rawKey  = authHeader.slice(7).trim()
  const keyHash = hashKey(rawKey)

  const supabase = adminClient()

  // ── Step 1: resolve api_key row ───────────────────────────────────────────

  const { data: keyRow, error: keyError } = await supabase
    .from('api_keys')
    .select('id, organization_id, name, status, requests_count, last_used_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  const step1 = {
    key_hash_prefix:  keyHash.slice(0, 16) + '...',
    key_row_found:    keyRow !== null,
    key_id:           keyRow?.id ?? null,
    key_name:         keyRow?.name ?? null,
    key_status:       keyRow?.status ?? null,
    key_org_id:       keyRow?.organization_id ?? null,
    key_error:        keyError?.message ?? null,
  }

  if (!keyRow) {
    return res.status(200).json({
      diagnosis: 'STEP 1 FAILED — API key not found or not active',
      step1,
    })
  }

  // ── Step 2: resolve organization row by the key's organization_id ─────────

  const { data: orgRow, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, plan, shadow_mode, created_at')
    .eq('id', keyRow.organization_id)
    .maybeSingle()

  const rawPlan     = orgRow?.plan ?? null
  const currentPlan = rawPlan ?? 'free'
  const tier        = currentPlan in PLAN_WINDOWS ? currentPlan : 'free'
  const limit       = PLAN_WINDOWS[tier] ?? 30

  const step2 = {
    org_id_queried:    keyRow.organization_id,
    org_row_found:     orgRow !== null,
    org_id:            orgRow?.id ?? null,
    org_name:          orgRow?.name ?? null,
    org_plan_raw:      rawPlan,
    org_plan_length:   typeof rawPlan === 'string' ? rawPlan.length : null,
    org_plan_trimmed:  typeof rawPlan === 'string' ? rawPlan.trim() : null,
    org_shadow_mode:   orgRow?.shadow_mode ?? null,
    org_created_at:    orgRow?.created_at ?? null,
    org_error:         orgError?.message ?? null,
  }

  // ── Step 3: plan resolution ───────────────────────────────────────────────

  const step3 = {
    raw_plan:           rawPlan,
    current_plan:       currentPlan,
    plan_in_windows:    currentPlan in PLAN_WINDOWS,
    resolved_tier:      tier,
    resolved_limit:     limit,
    expected_header:    `x-ratelimit-limit: ${limit}`,
    plan_windows:       PLAN_WINDOWS,
  }

  // ── Step 4: ALL organizations that have active API keys ───────────────────
  // Reveals org/key mismatches immediately

  const { data: allKeyOrgs } = await supabase
    .from('api_keys')
    .select('id, name, status, organization_id, organizations(id, name, plan, shadow_mode)')
    .eq('status', 'active')

  // ── Step 5: ALL orgs named "Genuinux" (any casing) ───────────────────────

  const { data: genuinuxOrgs } = await supabase
    .from('organizations')
    .select('id, name, plan, shadow_mode, created_at')
    .ilike('name', '%genuinux%')

  // ── Diagnosis ─────────────────────────────────────────────────────────────

  let diagnosis = 'OK — plan chain resolved correctly'

  if (!orgRow) {
    diagnosis = 'CRITICAL — organization_id in api_keys does not match any organization row. currentPlan falls back to "free".'
  } else if (rawPlan === null || rawPlan === undefined) {
    diagnosis = 'CRITICAL — organizations.plan is NULL. currentPlan falls back to "free".'
  } else if (rawPlan !== rawPlan.trim()) {
    diagnosis = `CRITICAL — organizations.plan has leading/trailing whitespace: "${rawPlan}". "enterprise" in PLAN_WINDOWS = false → tier = "free".`
  } else if (!(rawPlan in PLAN_WINDOWS)) {
    diagnosis = `CRITICAL — organizations.plan value "${rawPlan}" is not a known tier. tier falls back to "free".`
  } else if (rawPlan !== currentPlan) {
    diagnosis = `CRITICAL — rawPlan "${rawPlan}" differs from currentPlan "${currentPlan}".`
  } else if (limit === 30 && rawPlan !== 'free') {
    diagnosis = `UNEXPECTED — limit is 30 but plan is "${rawPlan}". Check PLAN_WINDOWS.`
  }

  return res.status(200).json({
    diagnosis,
    step1_api_key:        step1,
    step2_organization:   step2,
    step3_plan_resolution: step3,
    step4_all_active_keys: allKeyOrgs ?? [],
    step5_genuinux_orgs:  genuinuxOrgs ?? [],
  })
}
