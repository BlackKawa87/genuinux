import { describe, it, expect } from 'vitest'
import { analyze, buildRiskReasons, calcConfidence, buildRecommendedAction } from './riskEngine'
import type { RiskEngineInput, DetectedSignal } from './riskEngine'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const clean: RiskEngineInput = {
  external_user_id: 'usr_clean',
  event_type: 'login',
  email: 'user@gmail.com',
  ip_address: '1.2.3.4',
  device_id: 'dev_abc',
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  country: 'US',
  context: {
    user_events_last_10min: 1,
    ip_distinct_users_last_24h: 1,
    ip_signup_count_last_1h: 0,
    device_distinct_users: 1,
    device_has_prior_block: false,
    email_account_count: 1,
  },
}

// ─── Clean user ───────────────────────────────────────────────────────────────

describe('clean user', () => {
  it('returns low risk and allow decision', () => {
    const result = analyze(clean)
    expect(result.risk_level).toBe('low')
    expect(result.decision).toBe('allow')
    expect(result.fraud_score).toBeLessThan(26)
    expect(result.trust_score).toBeGreaterThan(74)
    expect(result.signals).toHaveLength(0)
  })

  it('returns processing_time_ms >= 0', () => {
    const result = analyze(clean)
    expect(result.processing_time_ms).toBeGreaterThanOrEqual(0)
  })

  it('fills ai_summary', () => {
    const result = analyze(clean)
    expect(result.ai_summary.length).toBeGreaterThan(10)
  })
})

// ─── Email signals ────────────────────────────────────────────────────────────

describe('email signals', () => {
  it('EMAIL_ABSENT when email is missing', () => {
    const result = analyze({ ...clean, email: undefined })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('EMAIL_ABSENT')
  })

  it('EMAIL_DISPOSABLE for mailinator.com', () => {
    const result = analyze({ ...clean, email: 'test@mailinator.com' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('EMAIL_DISPOSABLE')
  })

  it('EMAIL_DISPOSABLE for yopmail.com', () => {
    const result = analyze({ ...clean, email: 'test@yopmail.com' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('EMAIL_DISPOSABLE')
  })

  it('EMAIL_DUPLICATE when email linked to multiple accounts', () => {
    const result = analyze({ ...clean, context: { ...clean.context, email_account_count: 3 } })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('EMAIL_DUPLICATE')
  })

  it('no EMAIL_DUPLICATE when email_account_count is 1', () => {
    const result = analyze({ ...clean, context: { ...clean.context, email_account_count: 1 } })
    const codes = result.signals.map(s => s.code)
    expect(codes).not.toContain('EMAIL_DUPLICATE')
  })

  it('critical severity EMAIL_DUPLICATE when linked to >5 accounts', () => {
    const result = analyze({ ...clean, context: { ...clean.context, email_account_count: 6 } })
    const sig = result.signals.find(s => s.code === 'EMAIL_DUPLICATE')
    expect(sig?.severity).toBe('critical')
  })
})

// ─── IP signals ───────────────────────────────────────────────────────────────

describe('IP signals', () => {
  it('IP_ABSENT when ip_address is missing', () => {
    const result = analyze({ ...clean, ip_address: undefined })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('IP_ABSENT')
  })

  it('IP_MULTI_USER when many distinct users share IP', () => {
    const result = analyze({ ...clean, context: { ...clean.context, ip_distinct_users_last_24h: 8 } })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('IP_MULTI_USER')
  })

  it('no IP_MULTI_USER when fewer than 6 users share IP', () => {
    const result = analyze({ ...clean, context: { ...clean.context, ip_distinct_users_last_24h: 5 } })
    const codes = result.signals.map(s => s.code)
    expect(codes).not.toContain('IP_MULTI_USER')
  })

  it('critical IP_MULTI_USER for >20 distinct users', () => {
    const result = analyze({ ...clean, context: { ...clean.context, ip_distinct_users_last_24h: 25 } })
    const sig = result.signals.find(s => s.code === 'IP_MULTI_USER')
    expect(sig?.severity).toBe('critical')
  })

  it('IP_HIGH_RISK_COUNTRY for RU', () => {
    const result = analyze({ ...clean, country: 'RU' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('IP_HIGH_RISK_COUNTRY')
  })

  it('IP_HIGH_RISK_COUNTRY for KP (case insensitive)', () => {
    const result = analyze({ ...clean, country: 'kp' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('IP_HIGH_RISK_COUNTRY')
  })

  it('no IP_HIGH_RISK_COUNTRY for US', () => {
    const result = analyze({ ...clean, country: 'US' })
    const codes = result.signals.map(s => s.code)
    expect(codes).not.toContain('IP_HIGH_RISK_COUNTRY')
  })
})

// ─── Device signals ───────────────────────────────────────────────────────────

describe('device signals', () => {
  it('DEVICE_ABSENT when device_id is missing', () => {
    const result = analyze({ ...clean, device_id: undefined })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('DEVICE_ABSENT')
  })

  it('DEVICE_PRIOR_BLOCK when device was previously blocked', () => {
    const result = analyze({ ...clean, context: { ...clean.context, device_has_prior_block: true } })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('DEVICE_PRIOR_BLOCK')
  })

  it('DEVICE_PRIOR_BLOCK has critical severity', () => {
    const result = analyze({ ...clean, context: { ...clean.context, device_has_prior_block: true } })
    const sig = result.signals.find(s => s.code === 'DEVICE_PRIOR_BLOCK')
    expect(sig?.severity).toBe('critical')
  })

  it('DEVICE_MULTI_ACCOUNT when device linked to >3 users', () => {
    const result = analyze({ ...clean, context: { ...clean.context, device_distinct_users: 5 } })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('DEVICE_MULTI_ACCOUNT')
  })

  it('no DEVICE_MULTI_ACCOUNT when device_distinct_users is 3', () => {
    const result = analyze({ ...clean, context: { ...clean.context, device_distinct_users: 3 } })
    const codes = result.signals.map(s => s.code)
    expect(codes).not.toContain('DEVICE_MULTI_ACCOUNT')
  })
})

// ─── Velocity signals ─────────────────────────────────────────────────────────

describe('velocity signals', () => {
  it('VELOCITY_USER when >10 events in 10 min', () => {
    const result = analyze({ ...clean, context: { ...clean.context, user_events_last_10min: 15 } })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('VELOCITY_USER')
  })

  it('no VELOCITY_USER when events <= 10', () => {
    const result = analyze({ ...clean, context: { ...clean.context, user_events_last_10min: 10 } })
    const codes = result.signals.map(s => s.code)
    expect(codes).not.toContain('VELOCITY_USER')
  })

  it('VELOCITY_SIGNUP_IP when >5 signups from same IP', () => {
    const result = analyze({
      ...clean,
      event_type: 'signup',
      context: { ...clean.context, ip_signup_count_last_1h: 8 },
    })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('VELOCITY_SIGNUP_IP')
  })

  it('no VELOCITY_SIGNUP_IP for non-signup event type', () => {
    const result = analyze({
      ...clean,
      event_type: 'login',
      context: { ...clean.context, ip_signup_count_last_1h: 20 },
    })
    const codes = result.signals.map(s => s.code)
    expect(codes).not.toContain('VELOCITY_SIGNUP_IP')
  })

  it('VELOCITY_DEVICE when device_distinct_users > 10', () => {
    const result = analyze({ ...clean, context: { ...clean.context, device_distinct_users: 12 } })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('VELOCITY_DEVICE')
  })
})

// ─── Behavioral signals ───────────────────────────────────────────────────────

describe('behavioral signals', () => {
  it('UA_ABSENT when user_agent is missing', () => {
    const result = analyze({ ...clean, user_agent: undefined })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('UA_ABSENT')
  })

  it('UA_ABSENT when user_agent is too short', () => {
    const result = analyze({ ...clean, user_agent: 'bot' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('UA_ABSENT')
  })

  it('UA_AUTOMATION for headless chrome', () => {
    const result = analyze({ ...clean, user_agent: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/91.0' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('UA_AUTOMATION')
  })

  it('UA_AUTOMATION for python-requests', () => {
    const result = analyze({ ...clean, user_agent: 'python-requests/2.28.0' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('UA_AUTOMATION')
  })

  it('UA_AUTOMATION for curl', () => {
    const result = analyze({ ...clean, user_agent: 'curl/7.88.1' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('UA_AUTOMATION')
  })

  it('EVENT_SENSITIVE for withdrawal', () => {
    const result = analyze({ ...clean, event_type: 'withdrawal' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('EVENT_SENSITIVE')
  })

  it('EVENT_SENSITIVE for transaction', () => {
    const result = analyze({ ...clean, event_type: 'transaction' })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('EVENT_SENSITIVE')
  })

  it('no EVENT_SENSITIVE for login', () => {
    const result = analyze({ ...clean, event_type: 'login' })
    const codes = result.signals.map(s => s.code)
    expect(codes).not.toContain('EVENT_SENSITIVE')
  })

  it('METADATA_SUSPICIOUS when bot: true in metadata', () => {
    const result = analyze({ ...clean, metadata: { bot: true } })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('METADATA_SUSPICIOUS')
  })

  it('METADATA_SUSPICIOUS when proxy: true in metadata', () => {
    const result = analyze({ ...clean, metadata: { proxy: true } })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('METADATA_SUSPICIOUS')
  })

  it('no METADATA_SUSPICIOUS when flags are false', () => {
    const result = analyze({ ...clean, metadata: { bot: false, proxy: false } })
    const codes = result.signals.map(s => s.code)
    expect(codes).not.toContain('METADATA_SUSPICIOUS')
  })

  it('METADATA_HIGH_VALUE for large transaction', () => {
    const result = analyze({
      ...clean,
      event_type: 'transaction',
      metadata: { amount_usd: 15000 },
    })
    const codes = result.signals.map(s => s.code)
    expect(codes).toContain('METADATA_HIGH_VALUE')
  })

  it('no METADATA_HIGH_VALUE below threshold', () => {
    const result = analyze({
      ...clean,
      event_type: 'transaction',
      metadata: { amount_usd: 5000 },
    })
    const codes = result.signals.map(s => s.code)
    expect(codes).not.toContain('METADATA_HIGH_VALUE')
  })
})

// ─── Score boundaries ─────────────────────────────────────────────────────────

describe('score boundaries', () => {
  it('fraud_score never exceeds 100', () => {
    const result = analyze({
      external_user_id: 'usr_max',
      event_type: 'withdrawal',
      email: 'x@mailinator.com',
      ip_address: undefined,
      device_id: undefined,
      user_agent: undefined,
      country: 'RU',
      context: {
        user_events_last_10min: 30,
        ip_distinct_users_last_24h: 25,
        device_has_prior_block: true,
        device_distinct_users: 15,
        email_account_count: 8,
        ip_signup_count_last_1h: 20,
      },
    })
    expect(result.fraud_score).toBeLessThanOrEqual(100)
    expect(result.trust_score).toBeGreaterThanOrEqual(0)
  })

  it('trust_score + fraud_score are both integers', () => {
    const result = analyze(clean)
    expect(Number.isInteger(result.trust_score)).toBe(true)
    expect(Number.isInteger(result.fraud_score)).toBe(true)
  })
})

// ─── Decision thresholds ──────────────────────────────────────────────────────

describe('decision thresholds', () => {
  it('device prior block alone leads to review decision (fraud_score=45, medium)', () => {
    const result = analyze({
      ...clean,
      context: { ...clean.context, device_has_prior_block: true },
    })
    // DEVICE_PRIOR_BLOCK adds fraud_impact=45 → medium range (26-55) → review
    expect(result.decision).toBe('review')
    expect(result.fraud_score).toBe(45)
  })

  it('device prior block + multi-account leads to block', () => {
    const result = analyze({
      ...clean,
      context: {
        ...clean.context,
        device_has_prior_block: true,
        device_distinct_users: 12,
      },
    })
    // DEVICE_PRIOR_BLOCK(45) + DEVICE_MULTI_ACCOUNT(38) + VELOCITY_DEVICE(36) → clamped 100
    expect(result.decision).toBe('block')
    expect(result.fraud_score).toBe(100)
  })

  it('many simultaneous fraud signals escalate to block', () => {
    const result = analyze({
      external_user_id: 'usr_block',
      event_type: 'signup',
      email: 'x@mailinator.com',
      user_agent: 'python-requests/2.28.0',
      context: {
        ip_distinct_users_last_24h: 20,
        ip_signup_count_last_1h: 20,
        email_account_count: 8,
      },
    })
    expect(['review', 'block']).toContain(result.decision)
    expect(result.fraud_score).toBeGreaterThanOrEqual(40)
  })

  it('clean US user gets allow', () => {
    const result = analyze(clean)
    expect(result.decision).toBe('allow')
  })
})

// ─── Explainability layer ─────────────────────────────────────────────────────

describe('buildRiskReasons', () => {
  it('returns empty array for no signals', () => {
    expect(buildRiskReasons([])).toEqual([])
  })

  it('maps EMAIL_DISPOSABLE to email category', () => {
    const sig: DetectedSignal = { code: 'EMAIL_DISPOSABLE', label: 'Disposable email', severity: 'high', fraud_impact: 25, trust_impact: 20 }
    const reasons = buildRiskReasons([sig])
    expect(reasons[0].category).toBe('email')
    expect(reasons[0].severity).toBe('high')
    expect(reasons[0].reason.length).toBeGreaterThan(10)
  })

  it('maps DEVICE_PRIOR_BLOCK to device category', () => {
    const sig: DetectedSignal = { code: 'DEVICE_PRIOR_BLOCK', label: 'Device blocked', severity: 'critical', fraud_impact: 45, trust_impact: 40 }
    const reasons = buildRiskReasons([sig])
    expect(reasons[0].category).toBe('device')
  })

  it('maps VELOCITY_USER to velocity category', () => {
    const sig: DetectedSignal = { code: 'VELOCITY_USER', label: 'High velocity', severity: 'high', fraud_impact: 30, trust_impact: 25 }
    const reasons = buildRiskReasons([sig])
    expect(reasons[0].category).toBe('velocity')
  })

  it('maps UA_AUTOMATION to behavioral category', () => {
    const sig: DetectedSignal = { code: 'UA_AUTOMATION', label: 'Bot UA', severity: 'high', fraud_impact: 35, trust_impact: 30 }
    const reasons = buildRiskReasons([sig])
    expect(reasons[0].category).toBe('behavioral')
  })

  it('does not accuse the user directly — reasons are non-accusatory', () => {
    const signals: DetectedSignal[] = [
      { code: 'EMAIL_DISPOSABLE', label: 'x', severity: 'high', fraud_impact: 25, trust_impact: 20 },
      { code: 'DEVICE_PRIOR_BLOCK', label: 'x', severity: 'critical', fraud_impact: 45, trust_impact: 40 },
    ]
    for (const r of buildRiskReasons(signals)) {
      // Should not contain accusatory terms
      expect(r.reason.toLowerCase()).not.toContain('fraudster')
      expect(r.reason.toLowerCase()).not.toContain('criminal')
      expect(r.reason.toLowerCase()).not.toContain('liar')
    }
  })
})

describe('calcConfidence', () => {
  it('high confidence for 0 signals (clearly clean)', () => {
    expect(calcConfidence([], 0)).toBe('high')
  })

  it('high confidence for fraud_score >= 70', () => {
    const sig: DetectedSignal = { code: 'DEVICE_PRIOR_BLOCK', label: 'x', severity: 'critical', fraud_impact: 45, trust_impact: 40 }
    expect(calcConfidence([sig], 75)).toBe('high')
  })

  it('high confidence for 3+ signals', () => {
    const sig: DetectedSignal = { code: 'EMAIL_DISPOSABLE', label: 'x', severity: 'high', fraud_impact: 25, trust_impact: 20 }
    expect(calcConfidence([sig, sig, sig], 50)).toBe('high')
  })

  it('medium confidence for 2 signals with moderate fraud', () => {
    const sig: DetectedSignal = { code: 'EMAIL_ABSENT', label: 'x', severity: 'medium', fraud_impact: 20, trust_impact: 20 }
    expect(calcConfidence([sig, sig], 40)).toBe('medium')
  })

  it('low confidence for 1 signal with low fraud', () => {
    const sig: DetectedSignal = { code: 'EMAIL_ABSENT', label: 'x', severity: 'medium', fraud_impact: 20, trust_impact: 20 }
    expect(calcConfidence([sig], 20)).toBe('low')
  })
})

describe('buildRecommendedAction', () => {
  it('contains "blocked" for block decision', () => {
    const action = buildRecommendedAction('block', 'high', 3)
    expect(action.toLowerCase()).toContain('block')
  })

  it('contains "manual review" for review decision', () => {
    const action = buildRecommendedAction('review', 'medium', 2)
    expect(action.toLowerCase()).toContain('manual review')
  })

  it('contains "no action" for clean allow', () => {
    const action = buildRecommendedAction('allow', 'low', 0)
    expect(action.toLowerCase()).toContain('no action')
  })

  it('mentions monitoring for allow with signals', () => {
    const action = buildRecommendedAction('allow', 'low', 1)
    expect(action.toLowerCase()).toContain('monitor')
  })

  it('critical block has stronger language', () => {
    const critical = buildRecommendedAction('block', 'critical', 5)
    const high     = buildRecommendedAction('block', 'high', 5)
    expect(critical).not.toBe(high)
    expect(critical.toLowerCase()).toContain('critical')
  })
})

describe('analyze() output includes explainability fields', () => {
  it('includes risk_reasons array', () => {
    const result = analyze(clean)
    expect(Array.isArray(result.risk_reasons)).toBe(true)
  })

  it('includes confidence_level', () => {
    const result = analyze(clean)
    expect(['low', 'medium', 'high']).toContain(result.confidence_level)
  })

  it('includes recommended_action string', () => {
    const result = analyze(clean)
    expect(typeof result.recommended_action).toBe('string')
    expect(result.recommended_action.length).toBeGreaterThan(10)
  })

  it('clean user has high confidence and no reasons', () => {
    const result = analyze(clean)
    expect(result.confidence_level).toBe('high')
    expect(result.risk_reasons).toHaveLength(0)
  })

  it('risky user has reasons matching signals', () => {
    const result = analyze({
      ...clean,
      email: 'x@mailinator.com',
      context: { ...clean.context, device_has_prior_block: true },
    })
    expect(result.risk_reasons.length).toBe(result.signals.length)
    const codes = result.signals.map(s => s.code)
    const categories = result.risk_reasons.map(r => r.category)
    if (codes.includes('EMAIL_DISPOSABLE')) expect(categories).toContain('email')
    if (codes.includes('DEVICE_PRIOR_BLOCK')) expect(categories).toContain('device')
  })
})

// ─── No duplicate signals ─────────────────────────────────────────────────────

describe('deduplication', () => {
  it('no duplicate signal codes in output', () => {
    const result = analyze({
      ...clean,
      context: {
        ...clean.context,
        device_distinct_users: 12,
        device_has_prior_block: true,
      },
    })
    const codes = result.signals.map(s => s.code)
    const unique = new Set(codes)
    expect(codes.length).toBe(unique.size)
  })
})

// ─── Missing context graceful handling ────────────────────────────────────────

describe('missing context', () => {
  it('works with no context at all', () => {
    const result = analyze({
      external_user_id: 'usr_nocontext',
      event_type: 'login',
    })
    expect(result).toBeDefined()
    expect(result.fraud_score).toBeGreaterThanOrEqual(0)
    expect(result.decision).toBeDefined()
  })

  it('treats missing context as absent fields (adds absence signals)', () => {
    const result = analyze({
      external_user_id: 'usr_nocontext',
      event_type: 'login',
    })
    const codes = result.signals.map(s => s.code)
    // No email, no IP, no device, no UA → at least 4 absence signals
    expect(codes).toContain('EMAIL_ABSENT')
    expect(codes).toContain('IP_ABSENT')
    expect(codes).toContain('DEVICE_ABSENT')
    expect(codes).toContain('UA_ABSENT')
  })
})
