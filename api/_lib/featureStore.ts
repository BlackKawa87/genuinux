/**
 * Feature Store — Phase 3.3 Module 5.
 *
 * Writes extracted features to fraud_features fire-and-forget after insertRiskEvent.
 * Uses extractFeatures() from featureExtractor.ts — see that module for feature
 * definitions, groupings, and versioning rationale.
 *
 * Gated by FEATURE_STORE_ENABLED=true. Deploy without it first; enable after the
 * v19 + v20 migrations are applied.
 *
 * Fail-open — errors are swallowed, never propagate to the API response.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RiskEngineContext } from './riskEngine.js'
import { extractFeatures } from './featureExtractor.js'
import { captureException } from './monitoring.js'

interface EngineSignal { severity: string }

interface EngineOutput {
  fraud_score: number
  trust_score: number
  signals:     EngineSignal[]
  decision:    'allow' | 'review' | 'block'
}

interface EventMeta {
  event_type: string
  country?:   string
}

export async function persistFeatures(
  supabase:  SupabaseClient,
  orgId:     string,
  eventId:   string,
  result:    EngineOutput,
  context:   RiskEngineContext,
  gnxScore:  number,
  meta?:     EventMeta,
): Promise<void> {
  if (process.env.FEATURE_STORE_ENABLED !== 'true') return

  try {
    const features = extractFeatures(
      result,
      context,
      {
        event_type: meta?.event_type ?? 'custom',
        country:    meta?.country,
        decision:   result.decision,
      },
      gnxScore,
    )

    const rows = features.map(f => ({
      organization_id: orgId,
      risk_event_id:   eventId,
      feature_name:    f.feature_name,
      feature_value:   f.feature_value,
      feature_group:   f.feature_group,
      feature_version: f.feature_version,
      source:          f.source,
    }))

    await supabase.from('fraud_features').insert(rows)
  } catch (err) {
    captureException(err, {
      source:          'feature_store',
      operation:       'persist_features',
      organization_id: orgId,
      risk_event_id:   eventId,
    })
  }
}
