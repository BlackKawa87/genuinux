import type { FeedbackType, Decision } from '../types'

export interface FeedbackContext {
  organization_id:   string
  risk_event_id:     string
  external_user_id:  string
  feedback_type:     FeedbackType
  original_decision: Decision
  fraud_score:       number
  trust_score:       number
}

/**
 * applyFeedbackSignals — Adaptive intelligence foundation.
 *
 * Phase 1 (current): No-op. Feedback is persisted in `event_feedback`.
 * The function signature and context model are the contract for future phases.
 *
 * Roadmap:
 *   Phase 2 — User reputation:
 *     confirmed_fraud / chargeback_received  → flag external_user_id as high-risk per org
 *     genuine_user                           → boost user trust signals
 *
 *   Phase 3 — Signal weight calibration:
 *     false_positive with high fraud_score   → evidence that a signal is over-weighted for this org
 *     confirmed_fraud with low fraud_score   → evidence of blind spot in current signal coverage
 *
 *   Phase 4 — Per-org threshold tuning:
 *     Aggregate false_positive / confirmed_fraud ratio → auto-adjust review/block thresholds
 *
 *   Phase 5 — Network intelligence (opt-in):
 *     Anonymized fraud patterns shared across organizations at the email-domain / IP level
 */
export async function applyFeedbackSignals(_ctx: FeedbackContext): Promise<void> {
  // Phase 1: foundation only — data stored, no real-time adaptation yet.
  //
  // To implement Phase 2, uncomment and complete:
  //
  // if (
  //   _ctx.feedback_type === 'confirmed_fraud' ||
  //   _ctx.feedback_type === 'chargeback_received' ||
  //   _ctx.feedback_type === 'account_abuse_confirmed'
  // ) {
  //   await supabase.from('user_reputation').upsert({
  //     organization_id:  _ctx.organization_id,
  //     external_user_id: _ctx.external_user_id,
  //     risk_flag:        'confirmed_fraud',
  //     flagged_at:       new Date().toISOString(),
  //   }, { onConflict: 'organization_id,external_user_id' })
  // }
}
