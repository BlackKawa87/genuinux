/**
 * Feature Store — Phase 3 Module 3.
 *
 * Extracts structured feature vectors from the risk engine output and
 * persists them to the fraud_features table.
 *
 * Writes fire-and-forget after insertRiskEvent in check.ts.
 * Gated by FEATURE_STORE_ENABLED=true env var — deploy writes off by default,
 * enable after v19 migration is applied.
 *
 * Feature rows form the training dataset foundation:
 *   Once 100k events + 10k fraud_labels are collected, this data
 *   feeds Module 7 (ML training pipeline).
 *
 * Fail-open — any error is swallowed, never propagates to the API response.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RiskEngineContext } from './riskEngine.js'

interface EngineSignal { severity: string }

interface EngineOutput {
  fraud_score: number
  trust_score: number
  signals:     EngineSignal[]
}

interface FeatureRow {
  risk_event_id:   string
  organization_id: string
  feature_name:    string
  feature_value:   number
}

function buildFeatures(
  orgId:     string,
  eventId:   string,
  result:    EngineOutput,
  context:   RiskEngineContext,
  gnxScore:  number,
): FeatureRow[] {
  const row = (name: string, value: number): FeatureRow => ({
    risk_event_id:   eventId,
    organization_id: orgId,
    feature_name:    name,
    feature_value:   value,
  })

  const criticalN = result.signals.filter(s => s.severity === 'critical').length
  const highN     = result.signals.filter(s => s.severity === 'high').length

  return [
    row('user_velocity',            context.user_events_last_10min         ?? 0),
    row('ip_velocity',              context.ip_distinct_users_last_24h     ?? 0),
    row('ip_signup_rate_1h',        context.ip_signup_count_last_1h        ?? 0),
    row('device_velocity',          context.device_distinct_users          ?? 0),
    row('device_reputation',        context.device_has_prior_block ? 1 : 0    ),
    row('email_account_count',      context.email_account_count            ?? 0),
    row('signal_count',             result.signals.length                     ),
    row('critical_signal_count',    criticalN                                 ),
    row('high_signal_count',        highN                                     ),
    row('fraud_score_normalized',   result.fraud_score / 100                  ),
    row('trust_score_normalized',   result.trust_score / 100                  ),
    row('gnx_score_normalized',     gnxScore / 1000                           ),
  ]
}

export async function persistFeatures(
  supabase:  SupabaseClient,
  orgId:     string,
  eventId:   string,
  result:    EngineOutput,
  context:   RiskEngineContext,
  gnxScore:  number,
): Promise<void> {
  if (process.env.FEATURE_STORE_ENABLED !== 'true') return

  try {
    const rows = buildFeatures(orgId, eventId, result, context, gnxScore)
    await supabase.from('fraud_features').insert(rows)
  } catch {
    // Never rethrow — fire-and-forget
  }
}
