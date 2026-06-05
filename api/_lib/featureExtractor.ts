/**
 * Feature Extractor — Phase 3.3 Module 2.
 *
 * Derives structured feature vectors from a risk check result.
 * Features are grouped into 5 categories for ML training and analytics:
 *   velocity | reputation | behavior | risk | context
 *
 * All values are stored as REAL in Postgres — raw counts and scores, not normalized.
 * Normalization is the Dataset Builder's responsibility (Phase 3.6).
 *
 * Feature versioning: bump FEATURE_VERSION when the extraction logic changes
 * so old and new rows can coexist in fraud_features without ambiguity.
 */

import type { RiskEngineContext } from './riskEngine.js'

export const FEATURE_VERSION = 1
export const FEATURE_SOURCE  = 'risk-engine-v1'

// ─── High-risk country set ────────────────────────────────────────────────────
// Well-known fraud-heavy origins — used for context features.
const HIGH_RISK_COUNTRIES = new Set([
  'NG', 'RO', 'VN', 'PH', 'PK', 'BD', 'CM', 'GH', 'IN', 'ID',
  'UA', 'RU', 'KP', 'IR', 'SY', 'IQ', 'LY', 'SD', 'SO', 'YE',
])

// ─── Event type risk scores ───────────────────────────────────────────────────
const EVENT_TYPE_RISK: Record<string, number> = {
  withdrawal:  0.9,
  transaction: 0.7,
  signup:      0.6,
  checkout:    0.5,
  referral:    0.4,
  login:       0.3,
  custom:      0.2,
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngineSignal { severity: string }

interface EngineOutput {
  fraud_score: number
  trust_score: number
  signals:     EngineSignal[]
}

interface EventMeta {
  event_type: string
  country?:   string
  decision:   'allow' | 'review' | 'block'
}

export interface ExtractedFeature {
  feature_name:    string
  feature_value:   number
  feature_group:   'velocity' | 'reputation' | 'behavior' | 'risk' | 'context'
  feature_version: number
  source:          string
}

// ─── Extraction ───────────────────────────────────────────────────────────────

export function extractFeatures(
  result:  EngineOutput,
  context: RiskEngineContext,
  meta:    EventMeta,
  gnxScore: number,
): ExtractedFeature[] {
  const feat = (
    name:    string,
    value:   number,
    group:   ExtractedFeature['feature_group'],
  ): ExtractedFeature => ({
    feature_name:    name,
    feature_value:   value,
    feature_group:   group,
    feature_version: FEATURE_VERSION,
    source:          FEATURE_SOURCE,
  })

  const criticalN = result.signals.filter(s => s.severity === 'critical').length
  const highN     = result.signals.filter(s => s.severity === 'high').length

  // ── Velocity ─────────────────────────────────────────────────────────────────
  const velocityFeatures: ExtractedFeature[] = [
    feat('user_velocity',    context.user_events_last_10min     ?? 0, 'velocity'),
    feat('ip_velocity',      context.ip_distinct_users_last_24h ?? 0, 'velocity'),
    feat('device_velocity',  context.device_distinct_users      ?? 0, 'velocity'),
  ]

  // ── Reputation ────────────────────────────────────────────────────────────────
  // device_reputation: 1 = has prior block (bad), 0 = clean
  // email_reputation: inverse of account count (more accounts = lower reputation)
  //   clamped to [0, 1], higher = cleaner
  const emailReputation = context.email_account_count === 0
    ? 1.0
    : Math.max(0, 1 - (context.email_account_count - 1) / 10)
  // ip_reputation: inverse of signup surge (0 = no signups, 1 = clean)
  const ipReputation = context.ip_signup_count_last_1h === 0
    ? 1.0
    : Math.max(0, 1 - context.ip_signup_count_last_1h / 20)

  const reputationFeatures: ExtractedFeature[] = [
    feat('device_reputation', context.device_has_prior_block ? 0 : 1, 'reputation'),
    feat('email_reputation',  emailReputation,                         'reputation'),
    feat('ip_reputation',     ipReputation,                            'reputation'),
  ]

  // ── Behavior ──────────────────────────────────────────────────────────────────
  // signup_rate: raw signup count last 1h from this IP
  // account_age: not available in real-time context — stored as 0 (future enrichment)
  // repeated_device_count: how many distinct users share this device
  // repeated_email_count: how many accounts share this email
  const behaviorFeatures: ExtractedFeature[] = [
    feat('signup_rate',             context.ip_signup_count_last_1h ?? 0, 'behavior'),
    feat('account_age',             0,                                     'behavior'),
    feat('repeated_device_count',   context.device_distinct_users   ?? 0, 'behavior'),
    feat('repeated_email_count',    context.email_account_count     ?? 0, 'behavior'),
    feat('critical_signal_count',   criticalN,                             'behavior'),
    feat('high_signal_count',       highN,                                 'behavior'),
    feat('total_signal_count',      result.signals.length,                 'behavior'),
  ]

  // ── Risk ──────────────────────────────────────────────────────────────────────
  const riskFeatures: ExtractedFeature[] = [
    feat('fraud_score', result.fraud_score, 'risk'),
    feat('trust_score', result.trust_score, 'risk'),
    feat('gnx_score',   gnxScore,           'risk'),
  ]

  // ── Context ───────────────────────────────────────────────────────────────────
  const countryRisk = meta.country
    ? (HIGH_RISK_COUNTRIES.has(meta.country.toUpperCase()) ? 1 : 0)
    : 0
  const eventTypeRisk = EVENT_TYPE_RISK[meta.event_type] ?? 0.2
  // decision_numeric: allow=0, review=0.5, block=1
  const decisionNumeric = meta.decision === 'block' ? 1 : meta.decision === 'review' ? 0.5 : 0
  // historical_block_rate: proxy — whether any prior block exists on this device
  const historicalBlockRate = context.device_has_prior_block ? 1 : 0

  const contextFeatures: ExtractedFeature[] = [
    feat('country_risk',          countryRisk,      'context'),
    feat('event_type_risk',       eventTypeRisk,    'context'),
    feat('historical_block_rate', historicalBlockRate, 'context'),
    feat('decision_numeric',      decisionNumeric,  'context'),
  ]

  return [
    ...velocityFeatures,
    ...reputationFeatures,
    ...behaviorFeatures,
    ...riskFeatures,
    ...contextFeatures,
  ]
}
