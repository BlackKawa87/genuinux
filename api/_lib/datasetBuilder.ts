/**
 * Dataset Builder — Phase 3.6 Module 2.
 *
 * Joins risk_events + fraud_features into a structured training_dataset row
 * every time a ground-truth label is submitted via POST /api/risk/label.
 *
 * Called fire-and-forget from label.ts after the label is committed.
 * Gated by DATASET_BUILDER_ENABLED=true — safe to deploy without it
 * while migrations are being applied.
 *
 * Fail-open — errors are swallowed, never propagate to the caller.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureException } from './monitoring.js'

export const DATASET_VERSION = 1

export async function buildTrainingDataset(
  supabase:       SupabaseClient,
  orgId:          string,
  eventId:        string,
  label:          string,
  labelCreatedAt: string,
): Promise<void> {
  if (process.env.DATASET_BUILDER_ENABLED !== 'true') return

  try {
    // Fetch risk_event fields needed to enrich the dataset row.
    // Cross-partition scan by id — acceptable for a background write.
    const { data: event } = await supabase
      .from('risk_events')
      .select('decision, fraud_score, trust_score, gnx_score, created_at')
      .eq('id', eventId)
      .maybeSingle()

    // Count features extracted for this event (0 = FEATURE_STORE_ENABLED was off)
    const { count: featureCount } = await supabase
      .from('fraud_features')
      .select('id', { count: 'exact', head: true })
      .eq('risk_event_id', eventId)

    const ev = event as {
      decision: string | null
      fraud_score: number | null
      trust_score: number | null
      gnx_score: number | null
      created_at: string | null
    } | null

    await supabase.from('training_dataset').upsert({
      organization_id:  orgId,
      risk_event_id:    eventId,
      label,
      decision:         ev?.decision         ?? null,
      fraud_score:      ev?.fraud_score       ?? null,
      trust_score:      ev?.trust_score       ?? null,
      gnx_score:        ev?.gnx_score         ?? null,
      feature_count:    featureCount           ?? 0,
      label_created_at: labelCreatedAt,
      event_created_at: ev?.created_at        ?? null,
      dataset_version:  DATASET_VERSION,
    }, { onConflict: 'organization_id,risk_event_id' })
  } catch (err) {
    captureException(err, {
      source:          'dataset_builder',
      operation:       'build_training_dataset',
      organization_id: orgId,
      risk_event_id:   eventId,
    })
  }
}
