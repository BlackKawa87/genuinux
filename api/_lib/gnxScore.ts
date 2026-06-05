/**
 * Genuinux Fraud Score™ — proprietary 0–1000 fraud score.
 *
 * Scale:
 *   0–300   Low risk
 *   301–700 Review / medium risk
 *   701–1000 High fraud probability
 *
 * v1 is deterministic — derived from the existing risk engine output.
 * ML probability output (Module 7) will replace or weight alongside this
 * formula once the data requirements are met (100k events, 10k labels).
 *
 * Pure function — no I/O, no side effects.
 * Called synchronously on the hot path before res.status(200).json().
 */

import type { RiskEngineContext } from './riskEngine.js'

interface EngineSignal { severity: string }

interface EngineOutput {
  fraud_score: number
  trust_score: number
  signals:     EngineSignal[]
}

export function computeGnxScore(
  result:  EngineOutput,
  context: RiskEngineContext,
): number {
  // ── Base (0–1000 linear from fraud_score 0–100) ───────────────────────────
  let score = result.fraud_score * 10

  // ── Signal severity amplifier (max +130) ─────────────────────────────────
  // Critical signals are rare but strong fraud indicators.
  const criticalN = result.signals.filter(s => s.severity === 'critical').length
  const highN     = result.signals.filter(s => s.severity === 'high').length
  const medN      = result.signals.filter(s => s.severity === 'medium').length

  score += Math.min(criticalN, 4) * 20   // max +80
  score += Math.min(highN,     3) * 12   // max +36
  score += Math.min(medN,      7) * 2    // max +14

  // ── Velocity / context amplifier (max +80) ────────────────────────────────
  if (context.device_has_prior_block) score += 40

  const ipUsers = context.ip_distinct_users_last_24h ?? 0
  if      (ipUsers > 25) score += 30
  else if (ipUsers > 10) score += 15

  const devUsers = context.device_distinct_users ?? 0
  if      (devUsers > 10) score += 20
  else if (devUsers > 4)  score += 10

  const ipSignups = context.ip_signup_count_last_1h ?? 0
  if      (ipSignups > 15) score += 15
  else if (ipSignups > 5)  score += 7

  // ── Trust dampener (high trust slightly reduces score) ────────────────────
  // trust_score 100 → -10; trust_score 0 → 0
  score -= Math.floor(result.trust_score / 10)

  return Math.min(1000, Math.max(0, Math.round(score)))
}

/** Textual risk band for a gnx_score */
export function gnxScoreBand(score: number): 'low' | 'review' | 'high' {
  if (score >= 701) return 'high'
  if (score >= 301) return 'review'
  return 'low'
}
