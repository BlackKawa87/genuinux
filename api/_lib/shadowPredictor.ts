/**
 * Shadow Predictor — Phase 3.7 Module 2.
 *
 * Pure function — no DB calls, no side effects.
 * Takes an extracted feature vector and returns a shadow prediction
 * in the same decision space as the Risk Engine (block / review / allow).
 *
 * Model: shadow-v1 (deterministic heuristic, not trained ML).
 * Weights must match the seed in supabase/migrations/v22_ml_predictions.sql.
 *
 * The predictor NEVER influences the live decision returned to the client.
 * It exists solely to validate the shadow pipeline before Phase 3.8.
 */

export const SHADOW_MODEL_NAME    = 'shadow-v1'
export const SHADOW_MODEL_VERSION = 1

// ─── Weights ─────────────────────────────────────────────────────────────────
// Must match feature_importance seed in v22_ml_predictions.sql.
const WEIGHTS = {
  fraud_score:       0.35,
  trust_score:       0.20,  // inverted: higher trust → lower fraud prob
  gnx_score:         0.15,
  user_velocity:     0.08,
  ip_velocity:       0.06,
  device_reputation: 0.05,  // inverted: 1 = trustworthy device
  ip_reputation:     0.04,  // inverted: 1 = clean IP
  country_risk:      0.04,
  event_type_risk:   0.03,
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedFeature {
  feature_name:  string
  feature_value: number
}

export interface ShadowPrediction {
  prediction:       'block' | 'review' | 'allow'
  prediction_score: number  // fraud probability [0..1], stored as NUMERIC(5,4)
  confidence:       number  // distance from nearest decision boundary [0..1]
  model_name:       string
  model_version:    number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get(features: ExtractedFeature[], name: string): number {
  return features.find(f => f.feature_name === name)?.feature_value ?? 0
}

// ─── Predictor ────────────────────────────────────────────────────────────────

export function predictShadow(features: ExtractedFeature[]): ShadowPrediction {
  // Normalize each signal to [0, 1]
  const fraudScore  = get(features, 'fraud_score')    / 100
  const trustInv    = 1 - get(features, 'trust_score') / 100
  const gnxNorm     = get(features, 'gnx_score')      / 1000
  const userVelNorm = Math.min(get(features, 'user_velocity') / 10, 1)
  const ipVelNorm   = Math.min(get(features, 'ip_velocity')   / 20, 1)
  const devRepInv   = 1 - get(features, 'device_reputation')
  const ipRepInv    = 1 - get(features, 'ip_reputation')
  const countryRisk = get(features, 'country_risk')
  const eventRisk   = get(features, 'event_type_risk')

  const raw = (
    fraudScore  * WEIGHTS.fraud_score       +
    trustInv    * WEIGHTS.trust_score       +
    gnxNorm     * WEIGHTS.gnx_score         +
    userVelNorm * WEIGHTS.user_velocity     +
    ipVelNorm   * WEIGHTS.ip_velocity       +
    devRepInv   * WEIGHTS.device_reputation +
    ipRepInv    * WEIGHTS.ip_reputation     +
    countryRisk * WEIGHTS.country_risk      +
    eventRisk   * WEIGHTS.event_type_risk
  )

  const prob            = Math.min(Math.max(raw, 0), 1)
  const prediction_score = Math.round(prob * 10000) / 10000  // NUMERIC(5,4)

  let prediction: 'block' | 'review' | 'allow'
  if      (prob >= 0.70) prediction = 'block'
  else if (prob >= 0.35) prediction = 'review'
  else                   prediction = 'allow'

  // Confidence = how far the probability is from the nearest decision boundary.
  // Scaled by 3.5 so that a midpoint prediction (0.175, 0.525) gives ~0.61 confidence.
  const BOUNDARIES = [0, 0.35, 0.70, 1]
  const nearest    = BOUNDARIES.reduce((a, b) =>
    Math.abs(b - prob) < Math.abs(a - prob) ? b : a)
  const confidence = Math.round(Math.min(Math.abs(prob - nearest) * 3.5, 1) * 100) / 100

  return {
    prediction,
    prediction_score,
    confidence,
    model_name:    SHADOW_MODEL_NAME,
    model_version: SHADOW_MODEL_VERSION,
  }
}
