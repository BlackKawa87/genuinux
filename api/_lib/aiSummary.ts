/**
 * AI Summary — generates human-readable risk explanations for the dashboard.
 *
 * Template engine is used by default (MVP — no external dependencies).
 * Set OPENAI_API_KEY in environment to upgrade to GPT-4o-mini automatically.
 * The public API is async so switching providers requires no call-site changes.
 *
 * Usage:
 *   import { generateSummary } from './aiSummary'
 *   const text = await generateSummary({ event_type, trust_score, ... })
 *
 * To enable OpenAI: add OPENAI_API_KEY to Vercel environment variables.
 * The template engine remains the fallback on any OpenAI error.
 */

export interface SummaryInput {
  event_type:  string
  trust_score: number
  fraud_score: number
  risk_level:  'low' | 'medium' | 'high' | 'critical'
  decision:    'allow' | 'review' | 'block'
  signals:     Array<{ code: string; label: string; severity: string }>
  metadata?:   Record<string, unknown>
}

// ─── Signal severity ranking ───────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
}

// ─── Base phrases per signal code ─────────────────────────────────────────
// Lowercase, no trailing period — designed to work as mid-sentence clauses.

const PHRASE: Record<string, string> = {
  // Email
  IP_ABSENT:            'no IP address was provided with this request',
  IP_MULTI_USER:        'multiple users were detected sharing the same IP address',
  IP_HIGH_RISK_COUNTRY: 'the request originated from a high-risk geographic location',
  // Device
  DEVICE_ABSENT:        'no device fingerprint was included in this request',
  DEVICE_PRIOR_BLOCK:   'this device was previously linked to a blocked event',
  DEVICE_MULTI_ACCOUNT: 'this device is associated with multiple user accounts',
  // Email
  EMAIL_ABSENT:         'no email address was provided',
  EMAIL_DISPOSABLE:     'a temporary or disposable email address was detected',
  EMAIL_DUPLICATE:      'the email address is linked to multiple accounts',
  // Velocity
  VELOCITY_USER:        'an unusually high request volume was observed from this user in a short window',
  VELOCITY_SIGNUP_IP:   'multiple account creation attempts were detected from the same IP address',
  VELOCITY_DEVICE:      'rapid account-switching activity was detected on this device',
  // Behavioral
  UA_ABSENT:            'no browser identifier was detected in the request',
  UA_AUTOMATION:        'request patterns are consistent with automated tooling',
  METADATA_SUSPICIOUS:  'the request contains indicators associated with proxy or VPN usage',
  METADATA_HIGH_VALUE:  'this is a high-value financial transaction requiring elevated scrutiny',
  EVENT_SENSITIVE:      'this event type carries elevated financial exposure',
}

/**
 * Enriches base phrases with quantitative data extracted from the signal label.
 * e.g. label "15 distinct users from this IP in the last 24h"
 *   → "15 users were detected sharing the same IP address"
 */
function buildPhrase(code: string, label: string): string {
  const base = PHRASE[code]
  const n    = label.match(/\d+/)?.[0]

  if (!base) {
    // Unknown signal — lowercase the raw label and use it as-is
    return label.charAt(0).toLowerCase() + label.slice(1)
  }
  if (!n) return base

  switch (code) {
    case 'IP_MULTI_USER':
      return `${n} users were detected sharing the same IP address`
    case 'DEVICE_MULTI_ACCOUNT':
      return `this device is linked to ${n} user accounts`
    case 'EMAIL_DUPLICATE':
      return `the email address is linked to ${n} accounts`
    case 'VELOCITY_USER':
      return `${n} requests were submitted by this user in a short timeframe`
    case 'VELOCITY_SIGNUP_IP':
      return `${n} account creation attempts were detected from the same IP address`
    default:
      return base
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Template engine ───────────────────────────────────────────────────────

/**
 * Synchronous, deterministic summary — no external calls, no side effects.
 * Used directly by the risk engine and as fallback when OpenAI is unavailable.
 */
export function templateSummary(input: SummaryInput): string {
  const { event_type, trust_score, fraud_score, risk_level, decision, signals } = input

  // Sort by severity descending, keep top 3 most impactful signals
  const sorted = [...signals].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3),
  )
  const top   = sorted.slice(0, 3)
  const clean = top.length === 0

  // ── Sentence 1: Overall assessment ──────────────────────────
  let intro: string
  if (clean) {
    intro = `This ${event_type} appears legitimate with a trust score of ${trust_score}/100.`
  } else {
    const tone: Record<string, string> = {
      low:      `This ${event_type} shows low risk`,
      medium:   `This ${event_type} shows medium risk`,
      high:     `This ${event_type} presents significant risk indicators`,
      critical: `This ${event_type} exhibits multiple critical risk factors`,
    }
    intro = `${tone[risk_level] ?? `This ${event_type} shows ${risk_level} risk`} (fraud score: ${fraud_score}/100).`
  }

  // ── Sentence 2: Signal details (up to 3 signals as prose) ───
  let body = ''
  if (top.length > 0) {
    const phrases = top.map(s => buildPhrase(s.code, s.label))
    if (phrases.length === 1) {
      body = `${cap(phrases[0])}.`
    } else if (phrases.length === 2) {
      body = `${cap(phrases[0])} and ${phrases[1]}.`
    } else {
      body = `${cap(phrases[0])}, ${phrases[1]}, and ${phrases[2]}.`
    }
  }

  // ── Sentence 3: Recommendation ──────────────────────────────
  let conclusion: string
  if (decision === 'allow') {
    conclusion = clean
      ? 'No further action is required.'
      : 'No action is required at this time, though continued monitoring is advised.'
  } else if (decision === 'review') {
    conclusion = 'Manual review is recommended before proceeding.'
  } else {
    conclusion = risk_level === 'critical'
      ? 'This event has been automatically blocked pending investigation.'
      : 'This event has been blocked and requires manual review before approval.'
  }

  return [intro, body, conclusion].filter(Boolean).join(' ')
}

// ─── OpenAI integration (plug-in ready) ───────────────────────────────────

async function generateWithOpenAI(input: SummaryInput): Promise<string> {
  const { event_type, trust_score, fraud_score, risk_level, decision, signals } = input

  const signalBlock = signals.length > 0
    ? signals.map(s => `- [${s.severity}] ${s.label}`).join('\n')
    : 'None'

  const system = [
    'You are a fraud analysis assistant for a SaaS risk platform.',
    'Write a clear, professional 2-3 sentence summary of the risk assessment.',
    'Rules: do not accuse the user directly of fraud; use terms like "suspicious",',
    '"potential risk", "requires review"; do not invent data; be concise and objective.',
    'Output plain text only — no markdown, no bullet points.',
  ].join(' ')

  const user = [
    `Event type: ${event_type}`,
    `Trust score: ${trust_score}/100`,
    `Fraud score: ${fraud_score}/100`,
    `Risk level: ${risk_level}`,
    `Decision: ${decision}`,
    `\nDetected signals:\n${signalBlock}`,
  ].join('\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      max_tokens:  180,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
    }),
    signal: AbortSignal.timeout(8_000),
  })

  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`)

  const json = await res.json() as {
    choices: Array<{ message: { content: string } }>
  }
  const text = json.choices[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty OpenAI response')
  return text
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Generates a human-readable risk assessment summary.
 *
 * - OPENAI_API_KEY set   → GPT-4o-mini; falls back to template on any error
 * - OPENAI_API_KEY unset → template engine (default MVP behaviour)
 *
 * The function is always async so enabling OpenAI requires no call-site changes.
 */
export async function generateSummary(input: SummaryInput): Promise<string> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateWithOpenAI(input)
    } catch {
      // Fall through to template on network error, quota exceeded, etc.
    }
  }
  return templateSummary(input)
}
