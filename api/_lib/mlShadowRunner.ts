/**
 * ML Shadow Runner — Phase 3.7 Module 2.
 *
 * Generates ML predictions in shadow mode: runs alongside the Risk Engine
 * on every event, stores predictions in ml_predictions, but NEVER influences
 * the live decision returned to the client.
 *
 * Model: shadow-v1 (mock predictor)
 *   Uses a weighted combination of extracted features, with weights that
 *   deliberately differ from the Risk Engine to simulate a separate model.
 *   This produces a meaningful agreement rate (~75-85%) and real disagreements
 *   to analyze — without any random noise that would confuse analytics.
 *
 * Activation: ML_SHADOW_ENABLED=true env var.
 * Fail-open — errors are swallowed, never propagate to the API response.
 *
 * Next step: Phase 3.8 — Hybrid Decision Engine, where shadow-v1 accuracy
 * gates whether ML participates in the GNX Fraud Score™ calculation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RiskEngineContext } from './riskEngine.js'
import { extractFeatures } from './featureExtractor.js'

// ─── Constants ────────────────────────────────────────────────────────────────

export const ML_MODEL_VERSION = 'shadow-v1'

// shadow-v1 feature weights — must match feature_importance seed in v22 migration.
// Deliberately differ from Risk Engine weights to simulate a separate ML model.
const WEIGHTS = {
  fraud_score:       0.35,
  trust_score:       0.20,  // uses inverted: 1 - (trust_score / 100)
  gnx_score:         0.15,
  user_velocity:     0.08,
  ip_velocity:       0.06,
  device_reputation: 0.05,  // uses inverted: 1 - device_reputation (0=block=bad)
  ip_reputation:     0.04,  // uses inverted: 1 - ip_reputation
  country_risk:      0.04,
  event_type_risk:   0.03,
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

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

type PredictedLabel = 'confirmed_fraud' | 'suspected_fraud' | 'legitimate'

interface Prediction {
  fraud_probability: number
  predicted_label:   PredictedLabel
  confidence:        number
}

// ─── Mock predictor ───────────────────────────────────────────────────────────

function get(features: Array<{ feature_name: string; feature_value: number }>, name: string): number {
  return features.find(f => f.feature_name === name)?.feature_value ?? 0
}

function mockPredict(
  result:   EngineOutput,
  context:  RiskEngineContext,
  meta:     EventMeta,
  gnxScore: number,
): Prediction {
  // Re-use in-memory feature extraction — pure function, zero I/O cost
  const features = extractFeatures(
    result, context,
    { ...meta, decision: result.decision },
    gnxScore,
  )

  // Normalize each signal to [0, 1]
  const fraudScore   = get(features, 'fraud_score')    / 100
  const trustInv     = 1 - get(features, 'trust_score') / 100
  const gnxNorm      = get(features, 'gnx_score')      / 1000
  const userVelNorm  = Math.min(get(features, 'user_velocity') / 10, 1)
  const ipVelNorm    = Math.min(get(features, 'ip_velocity')   / 20, 1)
  const devRepInv    = 1 - get(features, 'device_reputation')
  const ipRepInv     = 1 - get(features, 'ip_reputation')
  const countryRisk  = get(features, 'country_risk')
  const eventRisk    = get(features, 'event_type_risk')

  // Weighted linear combination
  const raw = (
    fraudScore  * WEIGHTS.fraud_score +
    trustInv    * WEIGHTS.trust_score +
    gnxNorm     * WEIGHTS.gnx_score +
    userVelNorm * WEIGHTS.user_velocity +
    ipVelNorm   * WEIGHTS.ip_velocity +
    devRepInv   * WEIGHTS.device_reputation +
    ipRepInv    * WEIGHTS.ip_reputation +
    countryRisk * WEIGHTS.country_risk +
    eventRisk   * WEIGHTS.event_type_risk
  )

  const prob = Math.min(Math.max(raw, 0), 1)
  const fraud_probability = Math.round(prob * 1000) / 1000

  let predicted_label: PredictedLabel
  if      (prob >= 0.70) predicted_label = 'confirmed_fraud'
  else if (prob >= 0.35) predicted_label = 'suspected_fraud'
  else                   predicted_label = 'legitimate'

  // Confidence: distance from the nearest decision boundary, scaled to [0, 1]
  const BOUNDARIES = [0, 0.35, 0.70, 1]
  const nearest = BOUNDARIES.reduce((a, b) => Math.abs(b - prob) < Math.abs(a - prob) ? b : a)
  const confidence = Math.min(Math.abs(prob - nearest) * 3.5, 1)

  return {
    fraud_probability,
    predicted_label,
    confidence: Math.round(confidence * 100) / 100,
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runMlShadow(
  supabase:  SupabaseClient,
  orgId:     string,
  eventId:   string,
  result:    EngineOutput,
  context:   RiskEngineContext,
  gnxScore:  number,
  meta?:     EventMeta,
): Promise<void> {
  if (process.env.ML_SHADOW_ENABLED !== 'true') return

  try {
    const prediction = mockPredict(
      result, context,
      meta ?? { event_type: 'custom' },
      gnxScore,
    )

    await supabase.from('ml_predictions').insert({
      organization_id:   orgId,
      risk_event_id:     eventId,
      model_version:     ML_MODEL_VERSION,
      fraud_probability: prediction.fraud_probability,
      predicted_label:   prediction.predicted_label,
      confidence:        prediction.confidence,
      engine_decision:   result.decision,  // stored for agreement calc without joins
    })
  } catch {
    // Fail-open — never propagate to API response
  }
}
