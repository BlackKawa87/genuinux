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
import { analyze } from '../../src/lib/riskEngine'
import type { RiskEngineContext, RiskEngineInput } from '../../src/lib/riskEngine'
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
  trust_score: number
  fraud_score: number
  risk_level: string
  decision: 'approve' | 'review' | 'block'
  signals: Array<{
    code: string
    label: string
    severity: string
  }>
  summary: string
  processing_time_ms: number
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

function adminClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/** SHA-256 da API key em hex — deve bater com key_hash na tabela api_keys */
function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
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
): Promise<ApiKeyRecord | null> {
  const keyHash = hashApiKey(rawKey)

  const { data } = await supabase
    .from('api_keys')
    .select('id, organization_id, name, requests_count')
    .eq('key_hash', keyHash)
    .eq('status', 'active')
    .single()

  if (!data) return null

  // Atualiza last_used_at e incrementa requests_count (fire-and-forget)
  supabase
    .from('api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      requests_count: (data.requests_count ?? 0) + 1,
    })
    .eq('id', data.id)
    .then(() => {}) // não aguarda — não bloqueia a resposta

  return data as ApiKeyRecord
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
// 3. Contexto histórico
// ─────────────────────────────────────────────────────────────────────────────

async function fetchContext(
  supabase: SupabaseClient,
  orgId: string,
  payload: CheckPayload,
): Promise<RiskEngineContext> {
  const now    = Date.now()
  const m10ago = new Date(now - 10 * 60_000).toISOString()
  const h1ago  = new Date(now - 60 * 60_000).toISOString()
  const h24ago = new Date(now - 24 * 60 * 60_000).toISOString()

  const queries: Promise<unknown>[] = [
    // Eventos deste user nos últimos 10min
    supabase
      .from('risk_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('external_user_id', payload.external_user_id)
      .gte('created_at', m10ago),

    // Usuários distintos neste IP nas últimas 24h
    payload.ip_address
      ? supabase
          .from('risk_events')
          .select('external_user_id')
          .eq('organization_id', orgId)
          .eq('ip_address', payload.ip_address)
          .gte('created_at', h24ago)
      : Promise.resolve({ data: [] }),

    // Signups deste IP na última hora
    payload.ip_address
      ? supabase
          .from('risk_events')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('ip_address', payload.ip_address)
          .eq('event_type', 'signup')
          .gte('created_at', h1ago)
      : Promise.resolve({ count: 0 }),

    // Usuários distintos neste device
    payload.device_id
      ? supabase
          .from('risk_events')
          .select('external_user_id')
          .eq('organization_id', orgId)
          .eq('device_id', payload.device_id)
      : Promise.resolve({ data: [] }),

    // Device já bloqueado antes
    payload.device_id
      ? supabase
          .from('risk_events')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('device_id', payload.device_id)
          .eq('decision', 'block')
          .limit(1)
      : Promise.resolve({ count: 0 }),

    // Contas com este e-mail
    payload.email
      ? supabase
          .from('users_checked')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('email', payload.email)
      : Promise.resolve({ count: 0 }),
  ]

  type CountResult = { count: number | null }
  type RowsResult  = { data: Array<{ external_user_id: string }> | null }

  const [
    userEventsRes,
    ipUsersRes,
    ipSignupsRes,
    deviceUsersRes,
    deviceBlockRes,
    emailCountRes,
  ] = await Promise.all(queries) as [
    CountResult, RowsResult, CountResult, RowsResult, CountResult, CountResult
  ]

  const ipDistinctUsers = payload.ip_address
    ? new Set((ipUsersRes.data ?? []).map(r => r.external_user_id)).size
    : 0

  const deviceDistinctUsers = payload.device_id
    ? new Set((deviceUsersRes.data ?? []).map(r => r.external_user_id)).size
    : 0

  return {
    user_events_last_10min:     userEventsRes.count      ?? 0,
    ip_distinct_users_last_24h: ipDistinctUsers,
    ip_signup_count_last_1h:    ipSignupsRes.count        ?? 0,
    device_distinct_users:      deviceDistinctUsers,
    device_has_prior_block:     (deviceBlockRes.count     ?? 0) > 0,
    email_account_count:        emailCountRes.count       ?? 0,
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
): Promise<string | null> {
  const { data, error } = await supabase
    .from('risk_events')
    .insert({
      organization_id:  orgId,
      external_user_id: payload.external_user_id,
      event_type:       payload.event_type,
      email:            payload.email      ?? null,
      ip_address:       payload.ip_address ?? null,
      device_id:        payload.device_id  ?? null,
      user_agent:       payload.user_agent ?? null,
      country:          payload.country    ?? null,
      trust_score:      result.trust_score,
      fraud_score:      result.fraud_score,
      risk_level:       result.risk_level,
      decision:         result.decision,
      signals_json:     result.signals,
      ai_summary:       result.ai_summary,
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
}

async function dispatchWebhooks(
  supabase: SupabaseClient,
  orgId: string,
  eventId: string,
  payload: CheckPayload,
  result: ReturnType<typeof analyze>,
): Promise<void> {
  const { data: webhooks } = await supabase
    .from('webhooks')
    .select('id, endpoint_url, secret')
    .eq('organization_id', orgId)
    .eq('status', 'active')

  if (!webhooks || webhooks.length === 0) return

  const body = JSON.stringify({
    event_id:           eventId,
    external_user_id:   payload.external_user_id,
    event_type:         payload.event_type,
    trust_score:        result.trust_score,
    fraud_score:        result.fraud_score,
    risk_level:         result.risk_level,
    decision:           result.decision === 'allow' ? 'approve' : result.decision,
    signals:            result.signals.map(s => ({ code: s.code, label: s.label, severity: s.severity })),
    summary:            result.ai_summary,
    timestamp:          new Date().toISOString(),
  })

  await Promise.allSettled(
    (webhooks as WebhookRecord[]).map(wh => {
      const signature = signPayload(wh.secret, body)

      return fetch(wh.endpoint_url, {
        method: 'POST',
        headers: {
          'Content-Type':         'application/json',
          'X-Genuinux-Signature': `sha256=${signature}`,
          'X-Genuinux-Event':     payload.event_type,
          'User-Agent':           'Genuinux-Webhook/1.0',
        },
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      })
        .then(r => {
          if (!r.ok) console.warn(`[webhook] ${wh.endpoint_url} responded ${r.status}`)
        })
        .catch(err => {
          console.error(`[webhook] ${wh.endpoint_url} failed:`, err.message)
        })
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res)

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = adminClient()

  // ── 1. Autenticação ─────────────────────────────────────────
  const rawKey = extractBearerToken(req.headers['authorization'] as string | undefined)

  if (!rawKey) {
    return res.status(401).json({
      error: 'Missing or malformed Authorization header. Use: Authorization: Bearer <api_key>',
    })
  }

  const apiKey = await validateApiKey(supabase, rawKey)

  if (!apiKey) {
    return res.status(401).json({ error: 'Invalid or revoked API key' })
  }

  const orgId = apiKey.organization_id

  // ── 2. Validação do payload ─────────────────────────────────
  const validated = validatePayload(req.body)

  if (!validated.ok) {
    return res.status(400).json({ error: validated.error })
  }

  const payload = validated.data

  // ── 3. Contexto histórico ───────────────────────────────────
  const context = await fetchContext(supabase, orgId, payload)

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

  // ── 5 & 6. Persistência (paralela onde possível) ────────────
  await upsertUserChecked(supabase, orgId, payload)

  const eventId = await insertRiskEvent(supabase, orgId, payload, result)

  // ── 7. Review queue ─────────────────────────────────────────
  if (result.decision === 'review' && eventId) {
    // Não bloqueia a resposta
    createReviewQueueItem(supabase, orgId, eventId).catch(() => {})
  }

  // ── 8. Webhooks (fire-and-forget) ───────────────────────────
  if (eventId) {
    dispatchWebhooks(supabase, orgId, eventId, payload, result).catch(() => {})
  }

  // ── 9. Resposta ─────────────────────────────────────────────
  const response: CheckResponse = {
    event_id:            eventId ?? `evt_${Date.now()}`,
    trust_score:         result.trust_score,
    fraud_score:         result.fraud_score,
    risk_level:          result.risk_level,
    decision:            result.decision === 'allow' ? 'approve' : result.decision,
    signals:             result.signals.map(s => ({
      code:     s.code,
      label:    s.label,
      severity: s.severity,
    })),
    summary:             result.ai_summary,
    processing_time_ms:  result.processing_time_ms,
  }

  return res.status(200).json(response)
}
