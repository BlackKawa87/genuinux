/**
 * POST /api/analyze
 *
 * Recebe dados de um evento de usuário, busca contexto histórico no Supabase,
 * executa o Risk Engine e persiste o resultado em risk_events.
 *
 * Body: RiskEngineInput (ver src/lib/riskEngine.ts)
 * Response: RiskEngineOutput
 */

import { createClient } from '@supabase/supabase-js'
import { analyze } from '../src/lib/riskEngine'
import type { RiskEngineInput, RiskEngineContext } from '../src/lib/riskEngine'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Cliente admin — usa service role key para burlar RLS nas queries de contexto
function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Extrai organization_id do header (enviado pelo SDK do cliente)
  const orgId = req.headers['x-organization-id'] as string | undefined
  if (!orgId) {
    return res.status(401).json({ error: 'Missing x-organization-id header' })
  }

  const input = req.body as RiskEngineInput
  if (!input?.external_user_id || !input?.event_type) {
    return res.status(400).json({ error: 'external_user_id and event_type are required' })
  }

  try {
    const supabase = adminClient()
    const now      = new Date()
    const minus10m = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    const minus1h  = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const minus24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // ── Busca contexto histórico em paralelo ──────────────────────────────────
    const [
      userEventsRes,
      ipUsersRes,
      ipSignupsRes,
      deviceUsersRes,
      deviceBlockRes,
      emailCountRes,
    ] = await Promise.all([
      // Eventos deste user_id nos últimos 10 min
      supabase
        .from('risk_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('external_user_id', input.external_user_id)
        .gte('created_at', minus10m),

      // Usuários distintos neste IP nas últimas 24h
      input.ip_address
        ? supabase
            .from('risk_events')
            .select('external_user_id')
            .eq('organization_id', orgId)
            .eq('ip_address', input.ip_address)
            .gte('created_at', minus24h)
        : Promise.resolve({ data: [] }),

      // Signups deste IP na última hora
      input.ip_address
        ? supabase
            .from('risk_events')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('ip_address', input.ip_address)
            .eq('event_type', 'signup')
            .gte('created_at', minus1h)
        : Promise.resolve({ count: 0 }),

      // Usuários distintos neste device_id
      input.device_id
        ? supabase
            .from('risk_events')
            .select('external_user_id')
            .eq('organization_id', orgId)
            .eq('device_id', input.device_id)
        : Promise.resolve({ data: [] }),

      // Se este device já foi bloqueado
      input.device_id
        ? supabase
            .from('risk_events')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('device_id', input.device_id)
            .eq('decision', 'block')
            .limit(1)
        : Promise.resolve({ count: 0 }),

      // Quantas contas usam este e-mail
      input.email
        ? supabase
            .from('users_checked')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('email', input.email)
        : Promise.resolve({ count: 0 }),
    ])

    // Calcula distinct users para IP e device (Supabase não tem COUNT DISTINCT via client)
    const ipDistinctUsers = input.ip_address
      ? new Set((ipUsersRes.data ?? []).map((r: { external_user_id: string }) => r.external_user_id)).size
      : 0

    const deviceDistinctUsers = input.device_id
      ? new Set((deviceUsersRes.data ?? []).map((r: { external_user_id: string }) => r.external_user_id)).size
      : 0

    const context: RiskEngineContext = {
      user_events_last_10min:    userEventsRes.count     ?? 0,
      ip_distinct_users_last_24h: ipDistinctUsers,
      ip_signup_count_last_1h:   'count' in ipSignupsRes ? (ipSignupsRes.count ?? 0) : 0,
      device_distinct_users:     deviceDistinctUsers,
      device_has_prior_block:    'count' in deviceBlockRes ? (deviceBlockRes.count ?? 0) > 0 : false,
      email_account_count:       'count' in emailCountRes ? (emailCountRes.count ?? 0) : 0,
    }

    // ── Executa o engine ──────────────────────────────────────────────────────
    const result = analyze({ ...input, context })

    // ── Persiste em risk_events ───────────────────────────────────────────────
    const { error: insertError } = await supabase.from('risk_events').insert({
      organization_id:  orgId,
      external_user_id: input.external_user_id,
      event_type:       input.event_type,
      ip_address:       input.ip_address   ?? null,
      device_id:        input.device_id    ?? null,
      email:            input.email        ?? null,
      user_agent:       input.user_agent   ?? null,
      country:          input.country      ?? null,
      trust_score:      result.trust_score,
      fraud_score:      result.fraud_score,
      risk_level:       result.risk_level,
      decision:         result.decision,
      signals_json:     result.signals,
      ai_summary:       result.ai_summary,
    })

    if (insertError) {
      console.error('risk_events insert error:', insertError.message)
      // Não falha a request — retorna resultado mesmo sem persistir
    }

    // ── Cria entrada no review_queue se decision === review ───────────────────
    if (result.decision === 'review') {
      const { data: event } = await supabase
        .from('risk_events')
        .select('id')
        .eq('organization_id', orgId)
        .eq('external_user_id', input.external_user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (event?.id) {
        await supabase.from('review_queue').insert({
          organization_id: orgId,
          risk_event_id:   event.id,
          status:          'pending',
        })
      }
    }

    return res.status(200).json(result)
  } catch (err) {
    console.error('analyze error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
