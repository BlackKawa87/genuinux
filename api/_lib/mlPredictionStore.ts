/**
 * ML Prediction Store — Phase 3.7 Module 4.
 *
 * Handles all persistence for the ML shadow pipeline:
 *   savePrediction()        — write one ml_predictions row
 *   getPredictions()        — paginated fetch (Module 7 backing)
 *   getAgreementStats()     — agreement_rate / disagreement_rate
 *   getModelStats()         — per-model performance summary
 *   runShadowPrediction()   — orchestrator called from api/risk/check.ts
 *
 * All writes are fire-and-forget resilient: errors are logged, never thrown.
 * Gated by ML_SHADOW_ENABLED=true (Module 10).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RiskEngineContext } from './riskEngine.js'
import { extractFeatures }                     from './featureExtractor.js'
import { predictShadow, SHADOW_MODEL_NAME }    from './shadowPredictor.js'
import type { ShadowPrediction }               from './shadowPredictor.js'
import { captureException }                    from './monitoring.js'

// ─── Feature / dataset version constants ─────────────────────────────────────
const FEATURE_VERSION = 1
const DATASET_VERSION = 1

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngineResult {
  fraud_score: number
  trust_score: number
  signals:     Array<{ severity: string }>
  decision:    'allow' | 'review' | 'block'
}

interface EventMeta {
  event_type: string
  country?:   string
}

export interface PredictionRow {
  id:               string
  organization_id:  string
  risk_event_id:    string
  model_name:       string
  model_version:    number
  prediction:       'block' | 'review' | 'allow'
  prediction_score: number | null
  actual_decision:  'block' | 'review' | 'allow' | null
  agreement:        boolean | null
  feature_version:  number | null
  dataset_version:  number | null
  created_at:       string
}

export interface AgreementStats {
  total_predictions: number
  agreement_count:   number
  disagreement_count: number
  agreement_rate:    number
  disagreement_rate: number
}

export interface ModelStats {
  model_name:        string
  model_version:     number
  total_predictions: number
  agreement_rate:    number
  block_predictions: number
  review_predictions: number
  allow_predictions:  number
}

// ─── savePrediction ───────────────────────────────────────────────────────────

export async function savePrediction(
  supabase:        SupabaseClient,
  orgId:           string,
  eventId:         string,
  prediction:      ShadowPrediction,
  actualDecision:  'allow' | 'review' | 'block',
): Promise<void> {
  const agreement = prediction.prediction === actualDecision

  const { error } = await supabase.from('ml_predictions').insert({
    organization_id:  orgId,
    risk_event_id:    eventId,
    model_name:       prediction.model_name,
    model_version:    prediction.model_version,
    prediction:       prediction.prediction,
    prediction_score: prediction.prediction_score,
    actual_decision:  actualDecision,
    agreement,
    feature_version:  FEATURE_VERSION,
    dataset_version:  DATASET_VERSION,
  })

  if (error) {
    captureException(new Error(`ml_predictions insert: ${error.message}`), {
      orgId, eventId, prediction: prediction.prediction,
    })
  }
}

// ─── getPredictions ───────────────────────────────────────────────────────────

export async function getPredictions(
  supabase: SupabaseClient,
  orgId:    string,
  limit  = 50,
  offset = 0,
): Promise<PredictionRow[]> {
  const { data, error } = await supabase
    .from('ml_predictions')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return []
  return (data ?? []) as PredictionRow[]
}

// ─── getAgreementStats ────────────────────────────────────────────────────────

export async function getAgreementStats(
  supabase: SupabaseClient,
  orgId:    string,
  since?:   string,
): Promise<AgreementStats> {
  let query = supabase
    .from('ml_predictions')
    .select('agreement', { count: 'exact' })
    .eq('organization_id', orgId)

  if (since) query = query.gte('created_at', since)

  const { data, count: total } = await query
  const rows = (data ?? []) as Array<{ agreement: boolean | null }>
  const agreeCount = rows.filter(r => r.agreement === true).length
  const totalCount = total ?? rows.length

  return {
    total_predictions:  totalCount,
    agreement_count:    agreeCount,
    disagreement_count: totalCount - agreeCount,
    agreement_rate:     totalCount === 0 ? 0 : Math.round((agreeCount / totalCount) * 1000) / 10,
    disagreement_rate:  totalCount === 0 ? 0 : Math.round(((totalCount - agreeCount) / totalCount) * 1000) / 10,
  }
}

// ─── getModelStats ────────────────────────────────────────────────────────────

export async function getModelStats(
  supabase:   SupabaseClient,
  orgId:      string,
  modelName = SHADOW_MODEL_NAME,
  since?:     string,
): Promise<ModelStats> {
  let query = supabase
    .from('ml_predictions')
    .select('model_version, prediction, agreement')
    .eq('organization_id', orgId)
    .eq('model_name', modelName)

  if (since) query = query.gte('created_at', since)

  const { data } = await query
  const rows = (data ?? []) as Array<{ model_version: number; prediction: string; agreement: boolean | null }>

  const total     = rows.length
  const agreeCount = rows.filter(r => r.agreement === true).length
  const version    = rows[0]?.model_version ?? 1

  return {
    model_name:        modelName,
    model_version:     version,
    total_predictions: total,
    agreement_rate:    total === 0 ? 0 : Math.round((agreeCount / total) * 1000) / 10,
    block_predictions:  rows.filter(r => r.prediction === 'block').length,
    review_predictions: rows.filter(r => r.prediction === 'review').length,
    allow_predictions:  rows.filter(r => r.prediction === 'allow').length,
  }
}

// ─── runShadowPrediction ─────────────────────────────────────────────────────
//
// Orchestrator — called fire-and-forget from api/risk/check.ts after the
// response is sent to the client.
//
// Flow: extractFeatures() → predictShadow() → savePrediction()
// engineDecision = suggestedDecision (what the engine intended, before shadow
// mode forces 'allow') — this is the meaningful comparison target.

export async function runShadowPrediction(
  supabase:       SupabaseClient,
  orgId:          string,
  eventId:        string,
  result:         EngineResult,
  engineDecision: 'allow' | 'review' | 'block',
  context:        RiskEngineContext,
  gnxScore:       number,
  meta?:          EventMeta,
): Promise<void> {
  if (process.env.ML_SHADOW_ENABLED !== 'true') return

  try {
    const features   = extractFeatures(
      result, context,
      { ...(meta ?? { event_type: 'custom' }), decision: result.decision },
      gnxScore,
    )
    const prediction = predictShadow(features)
    await savePrediction(supabase, orgId, eventId, prediction, engineDecision)
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      context: 'runShadowPrediction', orgId, eventId,
    })
    // Fail-open — never propagate to the API response
  }
}
