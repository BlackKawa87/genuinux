/**
 * POST /api/risk/check
 *
 * Endpoint de produção para análise de risco.
 * Clientes autenticam com uma API key no header Authorization: Bearer <key>.
 *
 * Fluxo:
 *   1. Validar API key  →  identificar organização
 *   2. Validar payload
 *   3. Buscar contexto histórico (velocidade, duplicatas)
 *   4. Executar Risk Engine
 *   5. Upsert em users_checked
 *   6. Inserir em risk_events
 *   7. Se decision=review → criar item em review_queue
 *   8. Disparar webhooks ativos (fire-and-forget)
 *   9. Retornar resposta JSON
 */

import crypto from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { analyze, SIGNAL_CATEGORY } from '../_lib/riskEngine.js'
import type { RiskEngineContext, RiskEngineInput } from '../_lib/riskEngine.js'
import { templateSummary } from '../_lib/aiSummary.js'
import type { SummaryInput } from '../_lib/aiSummary.js'
import { enrichWithAiSummary } from '../_lib/aiEnricher.js'
import { captureException, setSentryTags } from '../_lib/monitoring.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { createSecurityEvent } from '../_lib/securityEvents.js'
import { getMonthlyUsage, incrementMonthlyUsage } from '../_lib/monthlyUsage.js'
import { incrementOrgStats } from '../_lib/orgStats.js'
import { readFraudCounters, writeFraudCounters } from '../_lib/fraudCounters.js'
import { computeGnxScore } from '../_lib/gnxScore.js'
import { persistFeatures }  from '../_lib/featureStore.js'
import {
  getCachedApiKey, setCachedApiKey,
  getCachedOrg,    setCachedOrg,
  getCachedRules,  setCachedRules,
} from '../_lib/keyCache.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CheckPayload {
  external_user_id: string
  event_type: string
  email?: string
  phone?: string
  ip_address?: string
  device_id?: string
  user_agent?: string
  country?: string
  metadata?: Record<string, unknown>
}

interface CheckResponse {
  event_id: string
  external_user_id: string
  decision: 'approve' | 'review' | 'block'
  risk_level: string
  trust_score: number
  fraud_score: number
  gnx_score: number
  confidence_level: string
  shadow_mode: boolean
  signals: Array<{
    key: string
    category: string
    severity: string
    label: string
  }>
  risk_reasons: Array<{
    category: string
    severity: string
    reason: string
  }>
  recommended_action: string
  applied_rules: Array<{ id: string; name: string }>
  summary: string
  metadata: {
    api_version: string
    engine_version: string
    processed_at: string
    processing_time_ms: number
  }
  // Shadow mode — only present when org.shadow_mode = true
  suggested_decision?: 'approve' | 'review' | 'block'
  live_decision?: 'approve'
  message?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set([
  'signup', 'login', 'transaction', 'withdrawal',
  'referral', 'checkout', 'custom',
])

// Timeout para chamadas de webhook de clientes (ms)
const WEBHOOK_TIMEOUT_MS = 5_000

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Module-level client — reused across warm Vercel invocations.
// Creating a new client per request multiplies connection overhead under load.
let _supabase: SupabaseClient | null = null

function adminClient(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  _supabase = createClient(url, key)
  return _supabase
}

/** SHA-256 da API key em hex — deve bater com key_hash na tabela api_keys */
function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function getRequestIp(req: VercelRequest): string | null {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string') return fwd.split(',')[0].trim() || null
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0].split(',')[0].trim() || null
  return null
}

/** HMAC-SHA256 do payload para assinar requests de webhook */
function signPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

/** Extrai o Bearer token do header Authorization */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  return token.length > 0 ? token : null
}

/** CORS headers para SDKs client-side */
function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Validação e autenticação da API key
// ─────────────────────────────────────────────────────────────────────────────

interface ApiKeyRecord {
  id: string
  organization_id: string
  name: string
  requests_count: number
}

async function validateApiKey(
  supabase: SupabaseClient,
  rawKey: string,
): Promise<{ record: ApiKeyRecord | null; cacheHit: boolean }> {
  const keyHash = hashApiKey(rawKey)

  // Redis cache hit — skip DB round-trip (~200ms saved on warm instances)
  const cached = await getCachedApiKey(keyHash)
  if (cached) {
    // Fire-and-forget update (don't await — cache hit path must stay fast)
    supabase.from('api_keys').update({
      last_used_at:   new Date().toISOString(),
      requests_count: (cached.requests_count ?? 0) + 1,
    }).eq('id', cached.id).then(() => {})
    return { record: cached, cacheHit: true }
  }

  const { data } = await supabase
    .from('api_keys')
    .select('id, organization_id, name, requests_count')
    .eq('key_hash', keyHash)
    .eq('status', 'active')
    .single()

  if (!data) return { record: null, cacheHit: false }

  // Populate cache for next requests with this key
  void setCachedApiKey(keyHash, data as ApiKeyRecord)

  // Atualiza last_used_at e incrementa requests_count (fire-and-forget)
  supabase
    .from('api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      requests_count: (data.requests_count ?? 0) + 1,
    })
    .eq('id', data.id)
    .then(() => {}) // não aguarda — não bloqueia a resposta

  return { record: data as ApiKeyRecord, cacheHit: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Validação do payload
// ─────────────────────────────────────────────────────────────────────────────

function validatePayload(body: unknown): { ok: true; data: CheckPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' }
  }

  const b = body as Record<string, unknown>

  if (!b.external_user_id || typeof b.external_user_id !== 'string') {
    return { ok: false, error: 'external_user_id is required and must be a string' }
  }

  if (!b.event_type || typeof b.event_type !== 'string') {
    return { ok: false, error: 'event_type is required and must be a string' }
  }

  if (!VALID_EVENT_TYPES.has(b.event_type)) {
    return {
      ok: false,
      error: `event_type must be one of: ${[...VALID_EVENT_TYPES].join(', ')}`,
    }
  }

  return {
    ok: true,
    data: {
      external_user_id: b.external_user_id,
      event_type:       b.event_type,
      email:            typeof b.email      === 'string' ? b.email      : undefined,
      phone:            typeof b.phone      === 'string' ? b.phone      : undefined,
      ip_address:       typeof b.ip_address === 'string' ? b.ip_address : undefined,
      device_id:        typeof b.device_id  === 'string' ? b.device_id  : undefined,
      user_agent:       typeof b.user_agent === 'string' ? b.user_agent : undefined,
      country:          typeof b.country    === 'string' ? b.country    : undefined,
      metadata:         b.metadata && typeof b.metadata === 'object'
                          ? (b.metadata as Record<string, unknown>)
                          : undefined,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Contexto histórico — single RPC call (6 queries → 1 HTTP round-trip)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchContext(
  supabase: SupabaseClient,
  orgId: string,
  payload: CheckPayload,
): Promise<RiskEngineContext> {
  // Redis-first (Phase 2B) — ~5ms vs ~80ms RPC.
  // Activated via REDIS_COUNTERS_ENABLED=true once counters are warmed up (24-48h of writes).
  // Falls through to RPC automatically on Redis error or if env flag is off.
  if (process.env.REDIS_COUNTERS_ENABLED === 'true') {
    const redisCtx = await readFraudCounters(
      orgId,
      payload.external_user_id,
      payload.ip_address ?? null,
      payload.device_id  ?? null,
      payload.email      ?? null,
    )
    if (redisCtx !== null) return redisCtx
  }

  const now    = Date.now()
  const m10ago = new Date(now - 10 * 60_000).toISOString()
  const h1ago  = new Date(now - 60 * 60_000).toISOString()
  const h24ago = new Date(now - 24 * 60 * 60_000).toISOString()
  const d90ago = new Date(now - 90 * 24 * 60 * 60_000).toISOString()

  // Try single RPC (v13 migration). Falls back to 6 parallel queries if function missing.
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_risk_context', {
    p_org_id:  orgId,
    p_user_id: payload.external_user_id,
    p_ip:      payload.ip_address ?? null,
    p_device:  payload.device_id  ?? null,
    p_email:   payload.email      ?? null,
    p_m10ago:  m10ago,
    p_h1ago:   h1ago,
    p_h24ago:  h24ago,
    p_d90ago:  d90ago,
  })

  if (!rpcError && rpcData) {
    const r = rpcData as {
      user_events_last_10min:     number
      ip_distinct_users_last_24h: number
      ip_signup_count_last_1h:    number
      device_distinct_users:      number
      device_has_prior_block:     boolean
      email_account_count:        number
    }
    return {
      user_events_last_10min:     r.user_events_last_10min     ?? 0,
      ip_distinct_users_last_24h: r.ip_distinct_users_last_24h ?? 0,
      ip_signup_count_last_1h:    r.ip_signup_count_last_1h    ?? 0,
      device_distinct_users:      r.device_distinct_users       ?? 0,
      device_has_prior_block:     Boolean(r.device_has_prior_block),
      email_account_count:        r.email_account_count         ?? 0,
    }
  }

  // Fallback: 6 parallel queries (pre-v13 DB or RPC error)
  const queries: Promise<unknown>[] = [
    Promise.resolve(
      supabase.from('risk_events').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('external_user_id', payload.external_user_id).gte('created_at', m10ago),
    ),
    payload.ip_address
      ? Promise.resolve(supabase.from('risk_events').select('external_user_id')
          .eq('organization_id', orgId).eq('ip_address', payload.ip_address).gte('created_at', h24ago))
      : Promise.resolve({ data: [] }),
    payload.ip_address
      ? Promise.resolve(supabase.from('risk_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('ip_address', payload.ip_address).eq('event_type', 'signup').gte('created_at', h1ago))
      : Promise.resolve({ count: 0 }),
    payload.device_id
      ? Promise.resolve(supabase.from('risk_events').select('external_user_id')
          .eq('organization_id', orgId).eq('device_id', payload.device_id).gte('created_at', d90ago))
      : Promise.resolve({ data: [] }),
    payload.device_id
      ? Promise.resolve(supabase.from('risk_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('device_id', payload.device_id).eq('decision', 'block').limit(1))
      : Promise.resolve({ count: 0 }),
    payload.email
      ? Promise.resolve(supabase.from('users_checked').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('email', payload.email))
      : Promise.resolve({ count: 0 }),
  ]

  type CountResult = { count: number | null }
  type RowsResult  = { data: Array<{ external_user_id: string }> | null }

  const [evR, ipUR, ipSR, devUR, devBR, emR] =
    await Promise.all(queries) as [CountResult, RowsResult, CountResult, RowsResult, CountResult, CountResult]

  return {
    user_events_last_10min:     evR.count  ?? 0,
    ip_distinct_users_last_24h: payload.ip_address
      ? new Set((ipUR.data ?? []).map(r => r.external_user_id)).size : 0,
    ip_signup_count_last_1h:    ipSR.count ?? 0,
    device_distinct_users:      payload.device_id
      ? new Set((devUR.data ?? []).map(r => r.external_user_id)).size : 0,
    device_has_prior_block:     (devBR.count ?? 0) > 0,
    email_account_count:        emR.count  ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Persistência
// ─────────────────────────────────────────────────────────────────────────────

async function upsertUserChecked(
  supabase: SupabaseClient,
  orgId: string,
  payload: CheckPayload,
): Promise<void> {
  await supabase
    .from('users_checked')
    .upsert(
      {
        organization_id:  orgId,
        external_user_id: payload.external_user_id,
        email:            payload.email      ?? null,
        phone:            payload.phone      ?? null,
        ip_address:       payload.ip_address ?? null,
        country:          payload.country    ?? null,
        device_id:        payload.device_id  ?? null,
      },
      { onConflict: 'organization_id,external_user_id' },
    )
}

async function insertRiskEvent(
  supabase: SupabaseClient,
  orgId: string,
  payload: CheckPayload,
  result: ReturnType<typeof analyze>,
  ruleMatch: RuleMatchResult,
  shadowMode: boolean,
  suggestedDecision: string | null,
  pregenId?: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('risk_events')
    .insert({
      ...(pregenId ? { id: pregenId } : {}),
      organization_id:    orgId,
      external_user_id:   payload.external_user_id,
      event_type:         payload.event_type,
      email:              payload.email      ?? null,
      ip_address:         payload.ip_address ?? null,
      device_id:          payload.device_id  ?? null,
      user_agent:         payload.user_agent ?? null,
      country:            payload.country    ?? null,
      trust_score:         result.trust_score,
      fraud_score:         result.fraud_score,
      risk_level:          result.risk_level,
      decision:            result.decision,
      signals_json:        result.signals,
      risk_reasons_json:   result.risk_reasons,
      confidence_level:    result.confidence_level,
      recommended_action:  result.recommended_action,
      ai_summary:          result.ai_summary,
      applied_rule_id:     ruleMatch.applied_rule_id,
      applied_rule_name:   ruleMatch.applied_rule_name,
      shadow_mode:         shadowMode,
      suggested_decision:  suggestedDecision,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[risk/check] risk_events insert error:', error.message)
    return null
  }

  return (data as { id: string }).id
}

async function createReviewQueueItem(
  supabase: SupabaseClient,
  orgId: string,
  eventId: string,
): Promise<void> {
  const { error } = await supabase.from('review_queue').insert({
    organization_id: orgId,
    risk_event_id:   eventId,
    status:          'pending',
  })

  if (error) {
    console.error('[risk/check] review_queue insert error:', error.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Webhooks
// ─────────────────────────────────────────────────────────────────────────────

interface WebhookRecord {
  id: string
  endpoint_url: string
  secret: string
  events_subscribed: string[]
}

/** Events generated for a given check result */
function resolveWebhookEvents(decision: 'allow' | 'review' | 'block', hasRule: boolean): string[] {
  const events = ['risk.check.completed']
  if (decision === 'block')  events.push('risk.event.blocked')
  if (decision === 'review') events.push('risk.review.required')
  if (decision === 'allow')  events.push('risk.event.approved')
  if (hasRule)               events.push('rule.triggered')
  return events
}

/** Empty events_subscribed means "all events" (backward compat) */
function webhookSubscribesTo(wh: WebhookRecord, event: string): boolean {
  if (!wh.events_subscribed || wh.events_subscribed.length === 0) return true
  return wh.events_subscribed.includes(event)
}

async function dispatchWebhooks(
  supabase: SupabaseClient,
  orgId: string,
  eventId: string,
  payload: CheckPayload,
  result: ReturnType<typeof analyze>,
  ruleMatch: RuleMatchResult,
  shadowMode: boolean,
  suggestedDecision: string | null,
): Promise<void> {
  const { data: webhooks } = await supabase
    .from('webhooks')
    .select('id, endpoint_url, secret, events_subscribed')
    .eq('organization_id', orgId)
    .eq('status', 'active')

  if (!webhooks || webhooks.length === 0) return

  // In shadow mode only fire risk.check.completed — avoid triggering
  // block/review handlers when nothing was actually blocked/reviewed.
  const eventsToFire = shadowMode
    ? ['risk.check.completed']
    : resolveWebhookEvents(ruleMatch.decision, Boolean(ruleMatch.applied_rule_id))
  const createdAt    = new Date().toISOString()
  const timestamp    = Math.floor(Date.now() / 1000).toString()

  const basePayload = {
    event_id:           eventId,
    external_user_id:   payload.external_user_id,
    event_type:         payload.event_type,
    trust_score:        result.trust_score,
    fraud_score:        result.fraud_score,
    risk_level:         result.risk_level,
    decision:           ruleMatch.decision === 'allow' ? 'approve' : ruleMatch.decision,
    confidence_level:   result.confidence_level,
    signals:            result.signals.map(s => ({
      key:      s.code,
      category: SIGNAL_CATEGORY[s.code] ?? 'behavioral',
      severity: s.severity,
      label:    s.label,
    })),
    risk_reasons:       result.risk_reasons,
    recommended_action: result.recommended_action,
    applied_rules:      ruleMatch.applied_rule_id
                          ? [{ id: ruleMatch.applied_rule_id, name: ruleMatch.applied_rule_name! }]
                          : [],
    summary:            result.ai_summary,
    shadow_mode:        shadowMode,
    created_at:         createdAt,
    ...(shadowMode && {
      suggested_decision: suggestedDecision === 'allow' ? 'approve' : suggestedDecision,
      live_decision:      'approve',
    }),
  }

  await Promise.allSettled(
    (webhooks as WebhookRecord[]).flatMap(wh => {
      const matchingEvents = eventsToFire.filter(e => webhookSubscribesTo(wh, e))

      return matchingEvents.map(eventType => {
        const payloadObj = { event: eventType, ...basePayload }
        const body       = JSON.stringify(payloadObj)
        const signature  = signPayload(wh.secret, body)
        const start      = Date.now()

        return fetch(wh.endpoint_url, {
          method: 'POST',
          headers: {
            'Content-Type':          'application/json',
            'X-Genuinux-Signature':  `sha256=${signature}`,
            'X-Genuinux-Event':      eventType,
            'X-Genuinux-Timestamp':  timestamp,
            'User-Agent':            'Genuinux-Webhook/1.0',
          },
          body,
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        })
          .then(r => {
            const duration = Date.now() - start
            if (!r.ok) console.warn(`[webhook] ${wh.endpoint_url} responded ${r.status}`)
            if (r.ok) {
              void supabase.from('webhook_deliveries').insert({
                webhook_id:      wh.id,
                organization_id: orgId,
                event_type:      eventType,
                payload_json:    payloadObj,
                response_status: r.status,
                duration_ms:     duration,
                delivery_status: 'delivered',
                success:         true,
                attempt_count:   1,
                max_attempts:    3,
              })
              void supabase.from('webhooks').update({
                last_delivery_status: 'success',
                last_delivery_at:     new Date().toISOString(),
              }).eq('id', wh.id)
            } else {
              void supabase.from('webhook_deliveries').insert({
                webhook_id:      wh.id,
                organization_id: orgId,
                event_type:      eventType,
                payload_json:    payloadObj,
                response_status: r.status,
                duration_ms:     duration,
                delivery_status: 'retrying',
                success:         false,
                attempt_count:   1,
                max_attempts:    3,
                next_retry_at:   new Date(Date.now() + 60_000).toISOString(),
              })
              void supabase.from('webhooks').update({
                last_delivery_status: 'failed',
                last_delivery_at:     new Date().toISOString(),
              }).eq('id', wh.id)
            }
          })
          .catch((err: Error) => {
            const duration = Date.now() - start
            console.error(`[webhook] ${wh.endpoint_url} failed:`, err.message)
            void supabase.from('webhook_deliveries').insert({
              webhook_id:      wh.id,
              organization_id: orgId,
              event_type:      eventType,
              payload_json:    payloadObj,
              response_body:   err.message.slice(0, 500),
              duration_ms:     duration,
              delivery_status: 'retrying',
              success:         false,
              attempt_count:   1,
              max_attempts:    3,
              next_retry_at:   new Date(Date.now() + 60_000).toISOString(),
            })
            void supabase.from('webhooks').update({
              last_delivery_status: 'failed',
              last_delivery_at:     new Date().toISOString(),
            }).eq('id', wh.id)
          })
      })
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.5. Custom rule evaluation
// ─────────────────────────────────────────────────────────────────────────────

interface RuleCondition {
  field:    string
  operator: string
  value:    string
}

interface ConditionGroup {
  match:      'all' | 'any'
  conditions: RuleCondition[]
}

interface RuleRow {
  id:              string
  name:            string
  condition_type:  string
  condition_value: string
  condition_group: ConditionGroup | null
  action:          'allow' | 'review' | 'block' | 'require_verification'
  priority:        number
}

interface RuleData {
  fraud_score:        number
  trust_score:        number
  risk_level:         string
  event_type:         string
  country:            string | undefined
  email:              string | undefined
  metadata:           Record<string, unknown> | undefined
  ip_user_count:      number
  ip_signup_count_1h: number
  device_user_count:  number
}

interface RuleMatchResult {
  decision:          'allow' | 'review' | 'block'
  applied_rule_id:   string | null
  applied_rule_name: string | null
}

function parseRuleCondition(cv: string): { operator: string; value: string } {
  const idx = cv.indexOf(':')
  return idx === -1
    ? { operator: 'eq', value: cv }
    : { operator: cv.slice(0, idx), value: cv.slice(idx + 1) }
}

function evalNumeric(a: number, op: string, bStr: string): boolean {
  const b = parseFloat(bStr)
  if (isNaN(b)) return false
  switch (op) {
    case 'gt':  return a > b
    case 'gte': return a >= b
    case 'lt':  return a < b
    case 'lte': return a <= b
    case 'eq':  return a === b
    default:    return false
  }
}

function evalString(a: string | undefined, op: string, b: string): boolean {
  if (a === undefined) return false
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  switch (op) {
    case 'eq':       return al === bl
    case 'neq':      return al !== bl
    case 'contains': return al.includes(bl)
    default:         return false
  }
}

function evalCondition(cond: RuleCondition, data: RuleData): boolean {
  const { field, operator, value } = cond
  switch (field) {
    case 'fraud_score':          return evalNumeric(data.fraud_score,        operator, value)
    case 'trust_score':          return evalNumeric(data.trust_score,        operator, value)
    case 'risk_level':           return evalString(data.risk_level,          operator, value)
    case 'event_type':           return evalString(data.event_type,          operator, value)
    case 'country':              return evalString(data.country,             operator, value)
    case 'email_domain': {
      const domain = data.email?.split('@')[1]
      return evalString(domain, operator, value)
    }
    case 'ip_user_count_1h':     return evalNumeric(data.ip_user_count,      operator, value)
    case 'ip_signup_count_1h':   return evalNumeric(data.ip_signup_count_1h, operator, value)
    case 'device_account_count': return evalNumeric(data.device_user_count,  operator, value)
    // Legacy field names (backward compat)
    case 'ip_user_count':        return evalNumeric(data.ip_user_count,      operator, value)
    case 'device_user_count':    return evalNumeric(data.device_user_count,  operator, value)
    default:
      if (field.startsWith('metadata.')) {
        const key = field.slice('metadata.'.length)
        const metaVal = data.metadata?.[key]
        if (metaVal === undefined) return false
        return evalString(String(metaVal), operator, value)
      }
      return false
  }
}

function evalConditionGroup(group: ConditionGroup, data: RuleData): boolean {
  if (!group.conditions || group.conditions.length === 0) return false
  return group.match === 'all'
    ? group.conditions.every(c => evalCondition(c, data))
    : group.conditions.some(c => evalCondition(c, data))
}

function matchRule(rule: RuleRow, data: RuleData): boolean {
  // New format: condition_group takes priority
  if (rule.condition_group && rule.condition_group.conditions?.length > 0) {
    return evalConditionGroup(rule.condition_group, data)
  }
  // Legacy single-condition format
  if (!rule.condition_type) return false
  const { operator, value } = parseRuleCondition(rule.condition_value)
  return evalCondition({ field: rule.condition_type, operator, value }, data)
}

async function applyCustomRules(
  supabase: SupabaseClient,
  orgId: string,
  data: RuleData,
  baseDecision: 'allow' | 'review' | 'block',
): Promise<{ result: RuleMatchResult; cacheHit: boolean }> {
  // Redis cache (60s TTL) — rules rarely change, saves 1 sequential DB round-trip
  let rules = await getCachedRules(orgId) as RuleRow[] | null
  const cacheHit = rules !== null

  if (!rules) {
    const { data: dbRules } = await supabase
      .from('rules')
      .select('id, name, condition_type, condition_value, condition_group, action, priority')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('priority',   { ascending: false })
      .order('created_at', { ascending: true })
    rules = (dbRules ?? []) as RuleRow[]
    void setCachedRules(orgId, rules)
  }

  if (!rules || rules.length === 0) {
    return { result: { decision: baseDecision, applied_rule_id: null, applied_rule_name: null }, cacheHit }
  }

  for (const rule of rules as RuleRow[]) {
    if (matchRule(rule, data)) {
      // require_verification maps to review in the DB/response
      const decision = rule.action === 'require_verification' ? 'review' : rule.action
      return {
        result: { decision, applied_rule_id: rule.id, applied_rule_name: rule.name },
        cacheHit,
      }
    }
  }

  return { result: { decision: baseDecision, applied_rule_id: null, applied_rule_name: null }, cacheHit }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res)
  res.setHeader('X-Genuinux-API-Version', 'v1')

  // ── Observability setup ──────────────────────────────────────
  const reqStart  = Date.now()
  const requestId = (req.headers['x-request-id'] as string | undefined)
    ?? crypto.randomUUID().slice(0, 8)
  res.setHeader('X-Request-ID', requestId)

  const timings: Record<string, number> = {}
  const cache:   Record<string, 'hit' | 'miss'> = {}
  let _prev = reqStart
  const step = (key: string) => { const n = Date.now(); timings[key] = n - _prev; _prev = n }

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = adminClient()

  // ── 1. Autenticação ─────────────────────────────────────────
  // Resilient header extraction — compatible with Node runtime, Edge runtime,
  // and clients that send the header with any casing.
  const authorizationHeader =
    (req.headers?.['authorization'] as string | undefined) ??
    (req.headers as Record<string, string | string[] | undefined>)?.['Authorization'] as string | undefined ??
    (req.headers as unknown as { get?: (k: string) => string | null })?.get?.('authorization') ??
    null

  const rawKey = extractBearerToken(authorizationHeader ?? undefined)

  if (!rawKey) {
    return res.status(401).json({
      error: 'Missing or malformed Authorization header. Use: Authorization: Bearer <api_key>',
    })
  }

  const { record: apiKey, cacheHit: keyCached } = await validateApiKey(supabase, rawKey)
  step('key_ms')
  cache.key = keyCached ? 'hit' : 'miss'

  if (!apiKey) {
    void createSecurityEvent(supabase, {
      event_type: 'api_key.invalid',
      actor_ip:   getRequestIp(req),
      metadata:   { key_prefix: rawKey.slice(0, 12), route: '/api/risk/check' },
    }, 'medium')
    return res.status(401).json({ error: 'Invalid or revoked API key' })
  }

  const orgId = apiKey.organization_id

  // ── 1.3. Fetch org config — Redis cache first, Supabase on miss ─────────
  const _orgCached = await getCachedOrg(orgId)
  cache.org = _orgCached ? 'hit' : 'miss'
  let orgRow: {
    plan?: string; shadow_mode?: boolean
    ai_enabled?: boolean; ai_monthly_limit?: number
    ai_calls_used?: number; ai_reset_at?: string
  } | null = _orgCached

  if (!orgRow) {
    // Cache miss — query Supabase (resilient: falls back to core fields if AI columns missing)
    const { data, error } = await supabase
      .from('organizations')
      .select('plan, shadow_mode, ai_enabled, ai_monthly_limit, ai_calls_used, ai_reset_at')
      .eq('id', orgId)
      .maybeSingle()

    if (error && !data) {
      const { data: fallback } = await supabase
        .from('organizations')
        .select('plan, shadow_mode')
        .eq('id', orgId)
        .maybeSingle()
      orgRow = fallback as typeof orgRow
    } else {
      orgRow = data as typeof orgRow
    }

    if (orgRow?.plan) {
      void setCachedOrg(orgId, {
        plan:             orgRow.plan,
        shadow_mode:      Boolean(orgRow.shadow_mode),
        ai_enabled:       Boolean(orgRow.ai_enabled),
        ai_monthly_limit: orgRow.ai_monthly_limit ?? 1000,
        ai_calls_used:    orgRow.ai_calls_used    ?? 0,
        ai_reset_at:      orgRow.ai_reset_at      ?? new Date().toISOString(),
      })
    }
  }

  const currentPlan  = orgRow?.plan ?? 'free'
  const isShadowMode = Boolean(orgRow?.shadow_mode)
  const orgAiRow     = orgRow
  step('org_ms')

  // Tag every subsequent Sentry event from this request with org/key/plan/requestId
  setSentryTags({ org_id: orgId, api_key_id: apiKey.id, plan: currentPlan, request_id: requestId })

  // ── 1.4. Rate limiting (per API key, plan-aware sliding window) ──────
  const rateLimit = await checkRateLimit(apiKey.id, currentPlan)
  if (!rateLimit.allowed) {
    void createSecurityEvent(supabase, {
      event_type:      'rate_limit.exceeded',
      organization_id: orgId,
      actor_ip:        getRequestIp(req),
      metadata:        { plan: currentPlan, key_id: apiKey.id },
    }, 'low')
    const retryAfterSec = Math.max(1, Math.ceil((rateLimit.resetMs - Date.now()) / 1000))
    res.setHeader('Retry-After',           String(retryAfterSec))
    res.setHeader('X-RateLimit-Limit',     String(rateLimit.limit))
    res.setHeader('X-RateLimit-Remaining', '0')
    res.setHeader('X-RateLimit-Reset',     String(rateLimit.resetMs))
    return res.status(429).json({
      error:          'Rate limit exceeded. Reduce request frequency and retry.',
      code:           'RATE_LIMIT_EXCEEDED',
      retry_after_ms: rateLimit.resetMs - Date.now(),
    })
  }
  res.setHeader('X-RateLimit-Limit',     String(rateLimit.limit))
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining))
  step('rate_ms')

  // ── 1.5. Plan monthly event limits (beta safety caps) ────────────────
  // Temporary beta safety limits — increase after load testing confirms stability.
  const PLAN_LIMITS: Record<string, number> = {
    free:        1_000,
    starter:    10_000,
    growth:     50_000,
    pro:        50_000,
    enterprise: 500_000,
  }

  const monthlyLimit = PLAN_LIMITS[currentPlan] ?? 1_000

  if (isFinite(monthlyLimit)) {
    // Redis-backed counter (O(1)). Falls back to Supabase COUNT(*) on miss/unavailability.
    const usedThisMonth = await getMonthlyUsage(orgId, supabase)

    step('monthly_ms')
    if (usedThisMonth >= monthlyLimit) {
      const planLabels: Record<string, string> = {
        free:       'Free (1,000/mo beta limit)',
        starter:    'Starter (10,000/mo beta limit)',
        growth:     'Growth (50,000/mo beta limit)',
        pro:        'Pro (50,000/mo beta limit)',
        enterprise: 'Enterprise (500,000/mo beta limit)',
      }
      return res.status(429).json({
        error: `Monthly event limit reached. Your ${planLabels[currentPlan] ?? currentPlan} plan limit has been reached. Upgrade to continue.`,
        code:  'PLAN_LIMIT_EXCEEDED',
        plan:  currentPlan,
        limit: monthlyLimit,
      })
    }
  }

  // ── 2. Validação do payload ─────────────────────────────────
  const validated = validatePayload(req.body)

  if (!validated.ok) {
    return res.status(400).json({ error: validated.error })
  }

  const payload = validated.data

  // ── 3. Contexto histórico ───────────────────────────────────
  const context = await fetchContext(supabase, orgId, payload)
  step('context_ms')

  // ── 4. Risk Engine ──────────────────────────────────────────
  const input: RiskEngineInput = {
    external_user_id: payload.external_user_id,
    event_type:       payload.event_type as RiskEngineInput['event_type'],
    email:            payload.email,
    phone:            payload.phone,
    ip_address:       payload.ip_address,
    device_id:        payload.device_id,
    user_agent:       payload.user_agent,
    country:          payload.country,
    metadata:         payload.metadata,
    context,
  }

  const result = analyze(input)

  // ── 4.5. Custom rules ───────────────────────────────────────
  const { result: ruleMatch, cacheHit: rulesCached } = await applyCustomRules(supabase, orgId, {
    fraud_score:        result.fraud_score,
    trust_score:        result.trust_score,
    risk_level:         result.risk_level,
    event_type:         payload.event_type,
    country:            payload.country,
    email:              payload.email,
    metadata:           payload.metadata,
    ip_user_count:      context.ip_distinct_users_last_24h ?? 0,
    ip_signup_count_1h: context.ip_signup_count_last_1h    ?? 0,
    device_user_count:  context.device_distinct_users       ?? 0,
  }, result.decision)
  step('engine_ms')
  cache.rules = rulesCached ? 'hit' : 'miss'
  const suggestedDecision = ruleMatch.decision
  // In shadow mode the live outcome is always 'allow' — engine still runs fully.
  const liveDecision      = isShadowMode ? 'allow' : suggestedDecision

  // ── 4.6. AI Summary (sync template — async GPT enrichment fires after response) ──
  const summaryInput: SummaryInput = {
    event_type:  payload.event_type,
    trust_score: result.trust_score,
    fraud_score: result.fraud_score,
    risk_level:  result.risk_level,
    decision:    liveDecision,
    signals:     result.signals,
    metadata:    payload.metadata,
  }
  const ai_summary = templateSummary(summaryInput)

  const effectiveResult = { ...result, decision: liveDecision, ai_summary }

  // Genuinux Fraud Score™ — computed synchronously before the response.
  // Pure function ~0.01ms — adds no meaningful latency.
  const gnxScore = computeGnxScore(result, context)

  // ── 9. Respond first — client gets the decision immediately ──────────
  // DB writes (upsert, insert, review queue, webhooks) happen after the
  // response is flushed. This removes ~400ms from client-perceived latency.
  // Vercel keeps the function alive until the handler Promise resolves.
  const eventId = crypto.randomUUID()  // pre-generate so response has a real ID
  const shadowSuggestedLabel = suggestedDecision === 'allow' ? 'approve' : suggestedDecision
  const processedAt = new Date().toISOString()
  const response: CheckResponse = {
    event_id:           eventId,
    external_user_id:   payload.external_user_id,
    decision:           effectiveResult.decision === 'allow' ? 'approve' : effectiveResult.decision,
    risk_level:         effectiveResult.risk_level,
    trust_score:        effectiveResult.trust_score,
    fraud_score:        effectiveResult.fraud_score,
    gnx_score:          gnxScore,
    confidence_level:   effectiveResult.confidence_level,
    shadow_mode:        isShadowMode,
    signals: effectiveResult.signals.map(s => ({
      key:      s.code,
      category: SIGNAL_CATEGORY[s.code] ?? 'behavioral',
      severity: s.severity,
      label:    s.label,
    })),
    risk_reasons:       effectiveResult.risk_reasons,
    recommended_action: effectiveResult.recommended_action,
    applied_rules:      ruleMatch.applied_rule_id
                          ? [{ id: ruleMatch.applied_rule_id, name: ruleMatch.applied_rule_name! }]
                          : [],
    summary:            effectiveResult.ai_summary,
    metadata: {
      api_version:        'v1',
      engine_version:     'risk-engine-v1',
      processed_at:       processedAt,
      processing_time_ms: effectiveResult.processing_time_ms,
    },
    ...(isShadowMode && {
      suggested_decision: shadowSuggestedLabel as 'approve' | 'review' | 'block',
      live_decision:      'approve',
      message:            suggestedDecision === 'block'
        ? 'This event would have been blocked in Live Mode.'
        : suggestedDecision === 'review'
          ? 'This event would have been flagged for review in Live Mode.'
          : undefined,
    }),
  }

  timings.total_ms = Date.now() - reqStart
  res.status(200).json(response)  // ← client receives response HERE

  // Structured request log — emitted after response, never blocks client
  captureMessage('risk.check.completed', 'info', {
    request_id:  requestId,
    org_id:      orgId,
    plan:        currentPlan,
    shadow_mode: isShadowMode,
    decision:    effectiveResult.decision,
    risk_level:  effectiveResult.risk_level,
    fraud_score: effectiveResult.fraud_score,
    trust_score: effectiveResult.trust_score,
    signals:     effectiveResult.signals.length,
    rule_hit:    !!ruleMatch.applied_rule_id,
    timings_ms:  timings,
    cache,
  })

  // ── 5 & 6. Persistência (after response — invisible to client latency) ─
  const [, insertedId] = await Promise.all([
    upsertUserChecked(supabase, orgId, payload),
    insertRiskEvent(
      supabase, orgId, payload, effectiveResult, ruleMatch,
      isShadowMode, isShadowMode ? suggestedDecision : null,
      eventId,  // use pre-generated UUID
    ),
  ])

  if (!insertedId) {
    captureException(new Error('risk_event insert failed'), { orgId, eventId })
  } else {
    void incrementMonthlyUsage(orgId)
    void incrementOrgStats(orgId, effectiveResult.decision, timings['total_ms'] ?? 0)
    void writeFraudCounters(
      orgId,
      payload.external_user_id,
      payload.ip_address ?? null,
      payload.device_id  ?? null,
      payload.email      ?? null,
      effectiveResult.decision,
      payload.event_type,
    )

    // Genuinux Fraud Score™ — update risk_events.gnx_score (fire-and-forget)
    void supabase
      .from('risk_events')
      .update({ gnx_score: gnxScore })
      .eq('id', insertedId)
      .then(() => {})

    // Feature Store (Phase 3.3) — gated by FEATURE_STORE_ENABLED=true
    void persistFeatures(supabase, orgId, insertedId, effectiveResult, context, gnxScore, {
      event_type: payload.event_type,
      country:    payload.country,
    })

    if (process.env.DISABLE_AI_DURING_LOAD_TEST !== '1') {
      const orgAi = orgAiRow as {
        ai_enabled?: boolean; ai_monthly_limit?: number
        ai_calls_used?: number; ai_reset_at?: string
      } | null
      void enrichWithAiSummary(supabase, orgId, insertedId, summaryInput, {
        ai_enabled:       Boolean(orgAi?.ai_enabled),
        ai_monthly_limit: orgAi?.ai_monthly_limit ?? 1000,
        ai_calls_used:    orgAi?.ai_calls_used    ?? 0,
        ai_reset_at:      orgAi?.ai_reset_at      ?? new Date().toISOString(),
      })
    }
  }

  // ── 7. Review queue (after response, skipped in shadow mode) ──────────
  if (effectiveResult.decision === 'review') {
    createReviewQueueItem(supabase, orgId, eventId).catch(() => {})
  }

  // ── 8. Webhooks (fire-and-forget) ─────────────────────────────────────
  if (process.env.DISABLE_WEBHOOKS_DURING_LOAD_TEST !== '1') {
    dispatchWebhooks(
      supabase, orgId, eventId, payload, effectiveResult, ruleMatch,
      isShadowMode, isShadowMode ? suggestedDecision : null,
    ).catch(() => {})
  }
}
