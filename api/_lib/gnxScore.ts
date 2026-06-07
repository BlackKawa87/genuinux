/**
 * Genuinux Fraud Score™ — proprietary 0–1000 fraud score.
 *
 * Scale:
 *   0–300   Low risk
 *   301–700 Review / medium risk
 *   701–1000 High fraud probability
 *
 * v1 is deterministic — derived from risk engine output + historical context.
 * All weights are exported in GNX_WEIGHTS and configurable without touching logic.
 * Bump GNX_VERSION when changing weights or formula.
 *
 * Pure function — no I/O, no side effects.
 */

import type { RiskEngineContext } from './riskEngine.js'

export const GNX_VERSION = 'v1' as const

export interface GnxFactor {
  feature: string  // snake_case factor identifier
  impact:  number  // points contributed (positive = fraud risk, negative = trust reduction)
}

export interface GnxResult {
  score:       number
  top_factors: GnxFactor[]  // top 5 contributors, sorted by |impact| desc
  version:     typeof GNX_VERSION
}

/**
 * Configurable weights for GNX v1.
 * All values are additive point contributions to the 0–1000 score.
 * Never hardcode these in compute logic — always reference GNX_WEIGHTS.
 */
export const GNX_WEIGHTS = {
  // Signal severity cluster bonuses — non-linear amplification for extreme clusters
  // (fraud_score captures linear signal sum; these penalize extreme concentrations)
  critical_signal:    { per: 25, cap: 4 },   // max +100
  high_signal:        { per: 10, cap: 3 },   // max +30
  medium_signal:      { per:  2, cap: 6 },   // max +12

  // Context / velocity bonuses (orthogonal to fraud_score linear base)
  device_prior_block: 50,   // strongest single indicator — blocked device seen again
  ip_users_tier3:     30,   // >25 distinct users from same IP in 24h
  ip_users_tier2:     15,   // >10 distinct users from same IP in 24h
  ip_users_tier1:      5,   // >5 distinct users from same IP in 24h
  device_users_tier2: 20,   // >10 distinct users on same device
  device_users_tier1:  8,   // >4 distinct users on same device
  ip_signup_high:     15,   // >15 signups from same IP in 1h
  ip_signup_med:       6,   // >5 signups from same IP in 1h

  // Trust reduction — high trust legitimately lowers score
  // Applied as: reduction = trust_score × trust_factor (max 15 at trust=100)
  trust_factor:       0.15,
} as const

interface EngineSignal { severity: string }

interface EngineOutput {
  fraud_score: number
  trust_score: number
  signals:     EngineSignal[]
}

export function computeGnxScore(
  result:  EngineOutput,
  context: RiskEngineContext,
): GnxResult {
  const factors: GnxFactor[] = []

  // ── Base: linear fraud_score → 0–1000 ─────────────────────────────────────
  const base = result.fraud_score * 10
  factors.push({ feature: 'fraud_score_base', impact: base })

  // ── Signal severity cluster bonuses ───────────────────────────────────────
  const criticalN = result.signals.filter(s => s.severity === 'critical').length
  const highN     = result.signals.filter(s => s.severity === 'high').length
  const medN      = result.signals.filter(s => s.severity === 'medium').length

  const w = GNX_WEIGHTS
  const criticalBonus = Math.min(criticalN, w.critical_signal.cap) * w.critical_signal.per
  const highBonus     = Math.min(highN,     w.high_signal.cap)     * w.high_signal.per
  const medBonus      = Math.min(medN,      w.medium_signal.cap)   * w.medium_signal.per

  if (criticalBonus > 0) factors.push({ feature: 'critical_signal_cluster', impact: criticalBonus })
  if (highBonus     > 0) factors.push({ feature: 'high_signal_cluster',     impact: highBonus })
  if (medBonus      > 0) factors.push({ feature: 'medium_signal_cluster',   impact: medBonus })

  // ── Context / velocity bonuses ─────────────────────────────────────────────
  if (context.device_has_prior_block) {
    factors.push({ feature: 'device_prior_block', impact: w.device_prior_block })
  }

  const ipUsers = context.ip_distinct_users_last_24h ?? 0
  if      (ipUsers > 25) factors.push({ feature: 'ip_user_velocity', impact: w.ip_users_tier3 })
  else if (ipUsers > 10) factors.push({ feature: 'ip_user_velocity', impact: w.ip_users_tier2 })
  else if (ipUsers > 5)  factors.push({ feature: 'ip_user_velocity', impact: w.ip_users_tier1 })

  const devUsers = context.device_distinct_users ?? 0
  if      (devUsers > 10) factors.push({ feature: 'device_user_velocity', impact: w.device_users_tier2 })
  else if (devUsers > 4)  factors.push({ feature: 'device_user_velocity', impact: w.device_users_tier1 })

  const ipSignups = context.ip_signup_count_last_1h ?? 0
  if      (ipSignups > 15) factors.push({ feature: 'ip_signup_surge', impact: w.ip_signup_high })
  else if (ipSignups > 5)  factors.push({ feature: 'ip_signup_surge', impact: w.ip_signup_med })

  // ── Trust reduction ────────────────────────────────────────────────────────
  const trustReduction = Math.round(result.trust_score * w.trust_factor)
  if (trustReduction > 0) {
    factors.push({ feature: 'trust_dampener', impact: -trustReduction })
  }

  // ── Final score ────────────────────────────────────────────────────────────
  const raw   = factors.reduce((sum, f) => sum + f.impact, 0)
  const score = Math.min(1000, Math.max(0, Math.round(raw)))

  // Top 5 factors by absolute impact
  const top_factors = [...factors]
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 5)

  return { score, top_factors, version: GNX_VERSION }
}

/** Textual risk band for a gnx_score */
export function gnxScoreBand(score: number): 'low' | 'review' | 'high' {
  if (score >= 701) return 'high'
  if (score >= 301) return 'review'
  return 'low'
}
