/**
 * Async AI enrichment — Priority 4 & 5.
 *
 * Called fire-and-forget after /api/risk/check sends its response.
 * Generates an AI-enhanced risk summary and updates the risk_event row.
 *
 * Features:
 *   - 24-hour cache keyed on signal combination + risk level + decision
 *   - Per-org monthly call budget (ai_monthly_limit / ai_calls_used)
 *   - Global kill switch: AI_SUMMARY_ENABLED=false
 *   - Global monthly cap: AI_GLOBAL_MONTHLY_CALL_LIMIT env var
 *   - Never throws — all errors are captured and logged
 */

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SummaryInput } from '../../src/lib/aiSummary'
import { captureException, captureMessage } from './monitoring.js'
import { createSecurityEvent } from './securityEvents.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgAiConfig {
  ai_enabled:       boolean
  ai_monthly_limit: number
  ai_calls_used:    number
  ai_reset_at:      string
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/**
 * Cache key: SHA-256 of sorted signal codes + risk_level + decision.
 * Identical fraud patterns produce the same key regardless of event order.
 */
function buildCacheKey(input: SummaryInput): string {
  const signals = [...input.signals].map(s => s.code).sort().join(',')
  const raw     = `${signals}|${input.risk_level}|${input.decision}`
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 40)
}

async function checkCache(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await supabase
    .from('ai_summary_cache')
    .select('id, summary, hit_count')
    .eq('cache_key', key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!data) return null

  const row = data as { id: string; summary: string; hit_count: number }

  // Increment hit counter (fire-and-forget — not critical)
  void supabase
    .from('ai_summary_cache')
    .update({ hit_count: row.hit_count + 1 })
    .eq('id', row.id)

  return row.summary
}

async function writeCache(supabase: SupabaseClient, key: string, summary: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await supabase
    .from('ai_summary_cache')
    .upsert({ cache_key: key, summary, expires_at: expiresAt, hit_count: 0 }, { onConflict: 'cache_key' })
}

// ─── OpenAI call ─────────────────────────────────────────────────────────────

async function callOpenAI(input: SummaryInput): Promise<string> {
  const signalBlock = input.signals.length > 0
    ? input.signals.map(s => `- [${s.severity}] ${s.label}`).join('\n')
    : 'None'

  const systemPrompt = [
    'You are a fraud analysis assistant for a B2B SaaS risk platform.',
    'Write a clear, professional 2-3 sentence summary of the risk assessment.',
    'Rules: do not accuse the user directly of fraud; use language like "suspicious patterns",',
    '"elevated risk indicators", "requires review"; do not invent data not present; be concise.',
    'Output plain text only — no markdown, no bullet points, no lists.',
  ].join(' ')

  const userPrompt = [
    `Event: ${input.event_type}`,
    `Trust score: ${input.trust_score}/100`,
    `Fraud score: ${input.fraud_score}/100`,
    `Risk level: ${input.risk_level}`,
    `Decision: ${input.decision}`,
    `\nDetected signals:\n${signalBlock}`,
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      max_tokens:  180,
      temperature: 0.25,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    }),
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`)

  const json = await response.json() as { choices: Array<{ message: { content: string } }> }
  const text = json.choices[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty OpenAI response')
  return text
}

// ─── Budget helpers ───────────────────────────────────────────────────────────

function globalCapReached(callsUsed: number): boolean {
  const capEnv = process.env.AI_GLOBAL_MONTHLY_CALL_LIMIT
  if (!capEnv) return false
  const cap = parseInt(capEnv, 10)
  return !isNaN(cap) && callsUsed >= cap
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Fire-and-forget AI enrichment.
 *
 * Call AFTER `res.status(200).json(response)` — this must not block the API response.
 * Uses `void enrichWithAiSummary(...)` at the call site to discard the promise.
 *
 * Order of operations:
 *   1. Global kill switch check
 *   2. Per-org AI gate
 *   3. Per-org budget reset if new month
 *   4. Cache lookup (24h TTL)
 *   5. Global cap check
 *   6. OpenAI call
 *   7. Persist: update risk_event + store in cache + increment counter
 */
export async function enrichWithAiSummary(
  supabase:  SupabaseClient,
  orgId:     string,
  eventId:   string,
  input:     SummaryInput,
  orgConfig: OrgAiConfig,
): Promise<void> {
  try {
    // 1. Global kill switch
    if (process.env.AI_SUMMARY_ENABLED === 'false') return

    // 2. Per-org gate
    if (!orgConfig.ai_enabled) return

    // 3. Monthly counter reset
    const resetAt = new Date(orgConfig.ai_reset_at)
    const now     = new Date()
    if (now.getFullYear() !== resetAt.getFullYear() || now.getMonth() !== resetAt.getMonth()) {
      await supabase
        .from('organizations')
        .update({ ai_calls_used: 0, ai_reset_at: now.toISOString() } as Record<string, unknown>)
        .eq('id', orgId)
      orgConfig = { ...orgConfig, ai_calls_used: 0 }
    }

    // Per-org budget exhausted
    if (orgConfig.ai_calls_used >= orgConfig.ai_monthly_limit) {
      captureMessage(
        `AI monthly limit reached for org ${orgId} (${orgConfig.ai_calls_used}/${orgConfig.ai_monthly_limit})`,
        'warning',
        { orgId, eventId },
      )
      void createSecurityEvent(supabase, {
        event_type:      'ai.cap_exceeded',
        organization_id: orgId,
        metadata:        { calls_used: orgConfig.ai_calls_used, limit: orgConfig.ai_monthly_limit, event_id: eventId },
      }, 'medium')
      return
    }

    // 4. Cache lookup
    const cacheKey = buildCacheKey(input)
    const cached   = await checkCache(supabase, cacheKey)

    if (cached) {
      // Cache hit — update event with no API call
      await supabase
        .from('risk_events')
        .update({ ai_summary: cached } as Record<string, unknown>)
        .eq('id', eventId)
      return
    }

    // Requires API key beyond this point
    if (!process.env.OPENAI_API_KEY) return

    // 5. Global cap
    if (globalCapReached(orgConfig.ai_calls_used)) {
      captureMessage('Global AI monthly cap reached', 'warning', { orgId, eventId })
      return
    }

    // 6. Call OpenAI
    const aiSummary = await callOpenAI(input)

    // 7. Persist in parallel — non-critical, so allSettled
    await Promise.allSettled([
      supabase
        .from('risk_events')
        .update({ ai_summary: aiSummary } as Record<string, unknown>)
        .eq('id', eventId),

      writeCache(supabase, cacheKey, aiSummary),

      supabase
        .from('organizations')
        .update({ ai_calls_used: orgConfig.ai_calls_used + 1 } as Record<string, unknown>)
        .eq('id', orgId),
    ])
  } catch (err) {
    // Never rethrow — enrichment is always fire-and-forget
    captureException(err, { context: 'enrichWithAiSummary', orgId, eventId })
  }
}
