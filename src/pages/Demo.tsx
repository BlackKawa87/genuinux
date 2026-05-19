import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, Play, RefreshCw, CheckCircle2, AlertTriangle,
  XCircle, ArrowRight, Activity, Globe, Monitor, Mail,
  Cpu, Clock, Copy, Check, Eye, ChevronDown, ChevronUp,
  Zap,
} from 'lucide-react'
import { analyze, SIGNAL_CATEGORY } from '../lib/riskEngine'
import type { RiskEngineInput, RiskEngineOutput, RiskEngineContext } from '../lib/riskEngine'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DemoForm {
  event_type: string
  email:      string
  ip_address: string
  device_id:  string
  country:    string
  user_agent: string
}

interface Preset {
  id:           string
  label:        string
  tag:          string
  tagColor:     string
  tagBg:        string
  description:  string
  form:         Partial<DemoForm>
  context:      Partial<RiskEngineContext>
  metadata?:    Record<string, unknown>
  isShadowMode?: boolean
}

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
  {
    id: 'genuine', label: 'Genuine User', tag: 'Approve',
    tagColor: '#16C784', tagBg: 'rgba(22,199,132,0.12)',
    description: 'Clean signup from a known device, stable IP, reputable email.',
    form: {
      event_type: 'signup',
      email:      'john.doe@gmail.com',
      ip_address: '104.18.45.12',
      device_id:  'dev_a1b2c3d4e5f6',
      country:    'US',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    },
    context: {
      user_events_last_10min:     1,
      ip_distinct_users_last_24h: 2,
      ip_signup_count_last_1h:    1,
      device_distinct_users:      1,
      device_has_prior_block:     false,
      email_account_count:        1,
    },
  },
  {
    id: 'suspicious', label: 'Suspicious Signup', tag: 'Review',
    tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
    description: 'Multiple mild anomalies — not conclusive but worth flagging.',
    form: {
      event_type: 'signup',
      email:      'temp4829@guerrillamail.com',
      ip_address: '45.33.32.156',
      device_id:  'dev_b7c8d9e0',
      country:    'BR',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    context: {
      user_events_last_10min:     2,
      ip_distinct_users_last_24h: 4,
      ip_signup_count_last_1h:    3,
      device_distinct_users:      2,
      device_has_prior_block:     false,
      email_account_count:        3,
    },
  },
  {
    id: 'multiAccount', label: 'Multi-Account Abuse', tag: 'Block',
    tagColor: '#EF4444', tagBg: 'rgba(239,68,68,0.12)',
    description: 'Device shared across 6 accounts. IP used by 7+ users today.',
    form: {
      event_type: 'login',
      email:      'newaccount@outlook.com',
      ip_address: '198.51.100.42',
      device_id:  'dev_shared_device_001',
      country:    'PK',
      user_agent: 'Mozilla/5.0 (Linux; Android 13; SM-G998B) Chrome/120.0.0.0',
    },
    context: {
      user_events_last_10min:     3,
      ip_distinct_users_last_24h: 7,
      ip_signup_count_last_1h:    2,
      device_distinct_users:      6,
      device_has_prior_block:     false,
      email_account_count:        2,
    },
  },
  {
    id: 'disposable', label: 'Disposable Email', tag: 'Review',
    tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
    description: 'Throwaway email domain linked to 4 prior accounts in the org.',
    form: {
      event_type: 'signup',
      email:      'throwaway4829@mailtemp.org',
      ip_address: '172.16.45.23',
      device_id:  'dev_f1e2d3c4',
      country:    'FR',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/119.0.0.0',
    },
    context: {
      user_events_last_10min:     1,
      ip_distinct_users_last_24h: 3,
      ip_signup_count_last_1h:    2,
      device_distinct_users:      2,
      device_has_prior_block:     false,
      email_account_count:        4,
    },
  },
  {
    id: 'withdrawal', label: 'High-Risk Withdrawal', tag: 'Block',
    tagColor: '#EF4444', tagBg: 'rgba(239,68,68,0.12)',
    description: 'Automated $75K withdrawal request. No device. Scripted UA.',
    form: {
      event_type: 'withdrawal',
      email:      'account@trashmail.com',
      ip_address: '91.108.4.56',
      device_id:  '',
      country:    'NG',
      user_agent: 'python-requests/2.28.1',
    },
    context: {
      user_events_last_10min:     14,
      ip_distinct_users_last_24h: 25,
      ip_signup_count_last_1h:    0,
      device_distinct_users:      0,
      device_has_prior_block:     false,
      email_account_count:        1,
    },
    metadata: { amount_usd: 75000 },
  },
  {
    id: 'bot', label: 'Bot-Like Behavior', tag: 'Block',
    tagColor: '#EF4444', tagBg: 'rgba(239,68,68,0.12)',
    description: 'Headless Chrome. 22 events in 10 min. 30 distinct IP users.',
    form: {
      event_type: 'signup',
      email:      '',
      ip_address: '185.220.101.47',
      device_id:  'dev_headless_x001',
      country:    'DE',
      user_agent: 'HeadlessChrome/120.0.6099.109',
    },
    context: {
      user_events_last_10min:     22,
      ip_distinct_users_last_24h: 30,
      ip_signup_count_last_1h:    18,
      device_distinct_users:      3,
      device_has_prior_block:     false,
      email_account_count:        0,
    },
  },
  {
    id: 'sharedDevice', label: 'Shared Device Cluster', tag: 'Block',
    tagColor: '#EF4444', tagBg: 'rgba(239,68,68,0.12)',
    description: 'One device fingerprint shared by 8 users. Prior block on record.',
    form: {
      event_type: 'login',
      email:      'user_new_session@gmail.com',
      ip_address: '203.0.113.10',
      device_id:  'dev_shared_cluster_x99',
      country:    'ID',
      user_agent: 'Mozilla/5.0 (Linux; Android 12; SM-A515F) Chrome/120.0.0.0',
    },
    context: {
      user_events_last_10min:     1,
      ip_distinct_users_last_24h: 5,
      ip_signup_count_last_1h:    0,
      device_distinct_users:      8,
      device_has_prior_block:     true,
      email_account_count:        1,
    },
  },
  {
    id: 'shadowMode', label: 'Shadow Mode', tag: 'Shadow',
    tagColor: '#38BDF8', tagBg: 'rgba(56,189,248,0.12)',
    description: 'Engine flags as block. Shadow Mode lets it through for observation.',
    isShadowMode: true,
    form: {
      event_type: 'signup',
      email:      'test_obs@mailtemp.net',
      ip_address: '45.33.100.12',
      device_id:  'dev_shadow_abc',
      country:    'RU',
      user_agent: 'python-requests/2.31.0',
    },
    context: {
      user_events_last_10min:     8,
      ip_distinct_users_last_24h: 12,
      ip_signup_count_last_1h:    7,
      device_distinct_users:      4,
      device_has_prior_block:     true,
      email_account_count:        2,
    },
  },
]

const EVENT_TYPES = ['signup', 'login', 'transaction', 'withdrawal', 'referral', 'checkout', 'custom']

const EMPTY_FORM: DemoForm = {
  event_type: 'signup', email: '', ip_address: '', device_id: '', country: '', user_agent: '',
}

// ─── Visual helpers ───────────────────────────────────────────────────────────

const DECISION_META = {
  allow:  { label: 'Approved',  icon: CheckCircle2,  color: '#16C784', bg: 'rgba(22,199,132,0.08)',  border: 'rgba(22,199,132,0.25)'  },
  review: { label: 'Review',    icon: AlertTriangle,  color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)'  },
  block:  { label: 'Blocked',   icon: XCircle,        color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
} as const

const RISK_COLORS: Record<string, string> = {
  low: '#16C784', medium: '#F59E0B', high: '#F97316', critical: '#EF4444',
}
const SEV_COLORS: Record<string, string> = {
  low: '#16C784', medium: '#F59E0B', high: '#F97316', critical: '#EF4444',
}
const CATEGORY_COLORS: Record<string, string> = {
  email: '#F59E0B', ip: '#38BDF8', device: '#A78BFA', velocity: '#F97316', behavioral: '#94A3B8',
}

function trustColor(s: number) { return s >= 70 ? '#16C784' : s >= 45 ? '#F59E0B' : '#EF4444' }
function fraudColor(s: number) { return s >= 70 ? '#EF4444' : s >= 40 ? '#F59E0B' : '#16C784' }

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 36, fontWeight: 900, color, fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1 }}>{score}</span>
      </div>
      <div style={{ height: 4, background: '#1E2D3D', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 4, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
      <p style={{ fontSize: 10, marginTop: 4, textAlign: 'right', color: '#2D4057', fontFamily: '"IBM Plex Mono", monospace' }}>/ 100</p>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 6, border: '1px solid #1E2D3D',
        background: copied ? 'rgba(22,199,132,0.1)' : '#07111F',
        color: copied ? '#16C784' : '#475569',
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied!' : 'Copy JSON'}
    </button>
  )
}

// ─── Results panel ────────────────────────────────────────────────────────────

function ResultsPanel({
  result, ms, isShadow, eventId,
}: {
  result: RiskEngineOutput
  ms: number
  isShadow: boolean
  eventId: string
}) {
  const [showSignals, setShowSignals] = useState(true)
  const [showJson,    setShowJson]    = useState(false)

  const effectiveDecision = isShadow ? 'allow' : result.decision
  const dec = DECISION_META[effectiveDecision]
  const DecIcon = dec.icon
  const riskColor = RISK_COLORS[result.risk_level] ?? '#94A3B8'

  const apiJson = JSON.stringify({
    event_id:           eventId,
    external_user_id:   'usr_demo',
    decision:           isShadow ? 'approve' : (result.decision === 'allow' ? 'approve' : result.decision),
    risk_level:         result.risk_level,
    trust_score:        result.trust_score,
    fraud_score:        result.fraud_score,
    confidence_level:   result.confidence_level,
    shadow_mode:        isShadow,
    signals:            result.signals.map(s => ({
      key:      s.code,
      category: SIGNAL_CATEGORY[s.code] ?? 'behavioral',
      severity: s.severity,
      label:    s.label,
    })),
    risk_reasons:       result.risk_reasons,
    recommended_action: result.recommended_action,
    applied_rules:      [],
    summary:            result.ai_summary,
    metadata: {
      engine_version:     'risk-engine-v1',
      processed_at:       new Date().toISOString(),
      processing_time_ms: ms,
    },
    ...(isShadow && {
      suggested_decision: result.decision === 'allow' ? 'approve' : result.decision,
      live_decision:      'approve',
      message:            result.decision === 'block'
        ? 'This event would have been blocked in Live Mode.'
        : 'This event would have been flagged for review in Live Mode.',
    }),
  }, null, 2)

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #1E2D3D', display: 'flex', flexDirection: 'column' }}>

      {/* Shadow Mode banner */}
      {isShadow && (
        <div style={{ background: 'rgba(56,189,248,0.08)', borderBottom: '1px solid rgba(56,189,248,0.2)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={13} style={{ color: '#38BDF8', flexShrink: 0 }} />
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#38BDF8' }}>Shadow Mode Active</span>
            <span style={{ fontSize: 11, color: '#475569', marginLeft: 8 }}>
              Engine decision: <span style={{ color: '#EF4444', fontWeight: 600 }}>{result.decision}</span>
              {' → '}
              Live decision: <span style={{ color: '#16C784', fontWeight: 600 }}>approve</span>
              {' — user sees no impact while you observe.'}
            </span>
          </div>
        </div>
      )}

      {/* Decision + scores */}
      <div style={{ background: '#07111F', padding: '20px 20px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <ScoreBar label="Trust Score" score={result.trust_score} color={trustColor(result.trust_score)} />
          <ScoreBar label="Fraud Score" score={result.fraud_score} color={fraudColor(result.fraud_score)} />
        </div>

        {/* Decision + meta row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 8,
          background: dec.bg, border: `1px solid ${dec.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DecIcon size={18} style={{ color: dec.color }} />
            <div>
              <p style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Decision</p>
              <p style={{ fontSize: 18, fontWeight: 900, color: dec.color }}>
                {dec.label}
                {isShadow && <span style={{ fontSize: 11, fontWeight: 500, color: '#38BDF8', marginLeft: 8 }}>(shadow)</span>}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, textAlign: 'right' }}>
            <div>
              <p style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Level</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: riskColor, textTransform: 'capitalize' }}>{result.risk_level}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidence</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#94A3B8', textTransform: 'capitalize' }}>{result.confidence_level}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Latency</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#475569', fontFamily: '"IBM Plex Mono", monospace' }}>{ms}ms</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Action */}
      <div style={{ background: '#0B1220', borderTop: '1px solid #1E2D3D', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Zap size={10} style={{ color: '#16C784' }} />
          <p style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommended Action</p>
        </div>
        <p style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.6, fontWeight: 500 }}>
          {result.recommended_action}
        </p>
      </div>

      {/* Risk Reasons */}
      {result.risk_reasons.length > 0 && (
        <div style={{ background: '#07111F', borderTop: '1px solid #1E2D3D', padding: '14px 20px' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Risk Reasons
            <span style={{ marginLeft: 6, color: '#2D4057', fontFamily: '"IBM Plex Mono", monospace' }}>
              ({result.risk_reasons.length})
            </span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.risk_reasons.map((r, i) => {
              const catColor = CATEGORY_COLORS[r.category] ?? '#94A3B8'
              const sevColor = SEV_COLORS[r.severity] ?? '#94A3B8'
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#050B14', border: '1px solid #1E2D3D', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${catColor}15`, color: catColor, border: `1px solid ${catColor}30`, flexShrink: 0, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {r.category}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${sevColor}15`, color: sevColor, border: `1px solid ${sevColor}30`, flexShrink: 0, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {r.severity}
                  </span>
                  <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5, margin: 0 }}>{r.reason}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Detected Signals */}
      <div style={{ background: '#0B1220', borderTop: '1px solid #1E2D3D' }}>
        <button
          onClick={() => setShowSignals(p => !p)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Detected Signals
            <span style={{ marginLeft: 6, color: result.signals.length > 0 ? '#EF4444' : '#16C784', fontFamily: '"IBM Plex Mono", monospace' }}>
              ({result.signals.length})
            </span>
          </p>
          {showSignals ? <ChevronUp size={12} style={{ color: '#475569' }} /> : <ChevronDown size={12} style={{ color: '#475569' }} />}
        </button>

        {showSignals && (
          <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {result.signals.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: '#050B14', border: '1px solid #1E2D3D' }}>
                <CheckCircle2 size={12} style={{ color: '#16C784' }} />
                <p style={{ fontSize: 12, color: '#475569' }}>No suspicious signals detected — event appears clean.</p>
              </div>
            ) : (
              result.signals.map(sig => {
                const sevColor = SEV_COLORS[sig.severity] ?? '#475569'
                const catColor = CATEGORY_COLORS[SIGNAL_CATEGORY[sig.code] ?? 'behavioral'] ?? '#94A3B8'
                return (
                  <div key={sig.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#050B14', border: '1px solid #1E2D3D' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#E2E8F0', marginBottom: 2 }}>{sig.label}</p>
                      <p style={{ fontSize: 10, color: '#2D4057', fontFamily: '"IBM Plex Mono", monospace' }}>{sig.code}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: `${catColor}15`, color: catColor, border: `1px solid ${catColor}30`, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {SIGNAL_CATEGORY[sig.code] ?? 'behavioral'}
                      </span>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: `${sevColor}15`, color: sevColor, border: `1px solid ${sevColor}30`, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {sig.severity}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* API Response JSON */}
      <div style={{ background: '#050B14', borderTop: '1px solid #1E2D3D' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <button
            onClick={() => setShowJson(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            {showJson ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            API Response JSON
          </button>
          <CopyButton text={apiJson} />
        </div>
        {showJson && (
          <pre style={{ margin: 0, padding: '0 16px 16px', fontSize: 11, lineHeight: 1.7, fontFamily: '"IBM Plex Mono", monospace', color: '#16C784', overflowX: 'auto', whiteSpace: 'pre' }}>
            {apiJson}
          </pre>
        )}
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12, minHeight: 440, background: '#07111F', border: '1px dashed #1E2D3D' }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.15)', marginBottom: 16 }}>
        <Activity size={20} style={{ color: '#16C784' }} />
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Select a scenario to begin</p>
      <p style={{ fontSize: 12, color: '#2D4057', textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
        Choose one of the 8 scenarios above — the risk engine will run instantly and show a full decision breakdown.
      </p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Demo() {
  const [form,        setForm]        = useState<DemoForm>(EMPTY_FORM)
  const [preset,      setPreset]      = useState<string | null>(null)
  const [presetCtx,   setPresetCtx]   = useState<Partial<RiskEngineContext>>({})
  const [presetMeta,  setPresetMeta]  = useState<Record<string, unknown> | undefined>(undefined)
  const [result,      setResult]      = useState<RiskEngineOutput | null>(null)
  const [running,     setRunning]     = useState(false)
  const [ms,          setMs]          = useState(0)
  const [isShadow,    setIsShadow]    = useState(false)
  const [eventId,     setEventId]     = useState('')

  const runEngine = useCallback(async (
    f: DemoForm,
    ctx: Partial<RiskEngineContext>,
    meta: Record<string, unknown> | undefined,
    shadow: boolean,
  ) => {
    setRunning(true)
    setResult(null)
    setIsShadow(shadow)
    setEventId('evt_' + Math.random().toString(36).slice(2, 10))

    await new Promise(r => setTimeout(r, 320))

    const input: RiskEngineInput = {
      external_user_id: 'usr_demo',
      event_type:       f.event_type as RiskEngineInput['event_type'],
      email:            f.email      || undefined,
      ip_address:       f.ip_address || undefined,
      device_id:        f.device_id  || undefined,
      country:          f.country    || undefined,
      user_agent:       f.user_agent || undefined,
      metadata:         meta,
      context:          ctx as RiskEngineContext,
    }

    const t0  = performance.now()
    const out = analyze(input)
    const elapsed = Math.round(performance.now() - t0)

    setMs(elapsed)
    setResult(out)
    setRunning(false)
  }, [])

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p.id)
    const newForm = { ...EMPTY_FORM, ...p.form }
    setForm(newForm)
    setPresetCtx(p.context)
    setPresetMeta(p.metadata)
    setResult(null)
    void runEngine(newForm, p.context, p.metadata, p.isShadowMode ?? false)
  }, [runEngine])

  const handleRun = useCallback(() => {
    void runEngine(form, presetCtx, presetMeta, isShadow && preset === 'shadowMode')
  }, [form, presetCtx, presetMeta, isShadow, preset, runEngine])

  const handleReset = () => {
    setForm(EMPTY_FORM)
    setPreset(null)
    setPresetCtx({})
    setPresetMeta(undefined)
    setResult(null)
    setIsShadow(false)
  }

  const setField = <K extends keyof DemoForm>(k: K, v: DemoForm[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setPreset(null)
  }

  return (
    <div style={{ background: '#050B14', minHeight: '100vh', color: '#E2E8F0' }}>

      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 30, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: 'rgba(5,11,20,0.92)', borderBottom: '1px solid #1E2D3D', backdropFilter: 'blur(8px)' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo-full.png" alt="Genuinux" style={{ height: 80, display: 'block', filter: 'brightness(0) invert(1)' }} />
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(22,199,132,0.1)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)', fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600 }}>
            Live Demo
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/docs" style={{ fontSize: 12, color: '#475569', textDecoration: 'none' }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = '#94A3B8')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = '#475569')}>
            API Docs
          </Link>
          <Link to="/login" style={{ fontSize: 12, color: '#475569', textDecoration: 'none' }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = '#94A3B8')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = '#475569')}>
            Sign in
          </Link>
          <Link to="/register" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: '#16C784', color: '#050B14', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
            Get API Key <ArrowRight size={11} />
          </Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 32px 80px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, background: 'rgba(22,199,132,0.08)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)', fontSize: 11, fontWeight: 600, marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16C784', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Risk engine running locally — no API key required
          </div>
          <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 900, color: '#E2E8F0', marginBottom: 10, lineHeight: 1.2, fontFamily: '"Inter", sans-serif' }}>
            See fraud detection in action
          </h1>
          <p style={{ fontSize: 14, color: '#475569', maxWidth: 520, margin: '0 auto' }}>
            Select a scenario — the engine runs instantly and returns a full risk decision, every signal, and the exact API response your integration would receive.
          </p>
        </div>

        {/* Scenario cards (8) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 28 }}>
          {PRESETS.map(p => {
            const active = preset === p.id
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                style={{
                  textAlign: 'left', padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                  background: active ? '#0B1220' : '#07111F',
                  border: active ? `1px solid ${p.tagColor}40` : '1px solid #1E2D3D',
                  outline: 'none', transition: 'all 0.15s',
                  boxShadow: active ? `0 0 0 1px ${p.tagColor}20` : 'none',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = '#2D4057' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = '#1E2D3D' }}
              >
                <span style={{ display: 'inline-block', fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700, marginBottom: 8, background: p.tagBg, color: p.tagColor }}>
                  {p.tag}
                </span>
                <p style={{ fontSize: 12, fontWeight: 700, color: active ? '#E2E8F0' : '#94A3B8', marginBottom: 4, lineHeight: 1.3 }}>{p.label}</p>
                <p style={{ fontSize: 10, color: '#2D4057', lineHeight: 1.5 }}>{p.description}</p>
              </button>
            )
          })}
        </div>

        {/* Main demo area */}
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>

          {/* Left: Form */}
          <div style={{ background: '#07111F', border: '1px solid #1E2D3D', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#E2E8F0' }}>Check parameters</p>
              <button onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#2D4057', fontSize: 10 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
                onMouseLeave={e => (e.currentTarget.style.color = '#2D4057')}>
                <RefreshCw size={9} /> Reset
              </button>
            </div>

            {/* event_type */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                <Activity size={10} /> Event type
              </label>
              <select value={form.event_type} onChange={e => setField('event_type', e.target.value)} className="g-input" style={{ width: '100%', fontSize: 13 }}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>

            {/* email */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                <Mail size={10} /> Email
              </label>
              <input value={form.email} onChange={e => setField('email', e.target.value)} placeholder="user@example.com" className="g-input" style={{ width: '100%', fontSize: 13 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  <Globe size={10} /> IP
                </label>
                <input value={form.ip_address} onChange={e => setField('ip_address', e.target.value)} placeholder="1.2.3.4" className="g-input mono" style={{ width: '100%', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Country</label>
                <input value={form.country} onChange={e => setField('country', e.target.value.toUpperCase().slice(0, 2))} placeholder="US" className="g-input mono" style={{ width: '100%', fontSize: 13 }} maxLength={2} />
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                <Monitor size={10} /> Device ID
              </label>
              <input value={form.device_id} onChange={e => setField('device_id', e.target.value)} placeholder="dev_a1b2c3" className="g-input mono" style={{ width: '100%', fontSize: 12 }} />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                <Cpu size={10} /> User Agent
              </label>
              <textarea value={form.user_agent} onChange={e => setField('user_agent', e.target.value)} placeholder="Mozilla/5.0…" rows={2} className="g-input mono" style={{ width: '100%', fontSize: 11, resize: 'none', lineHeight: 1.6 }} />
            </div>

            {preset && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(22,199,132,0.05)', border: '1px solid rgba(22,199,132,0.12)' }}>
                <Clock size={10} style={{ color: '#16C784', flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 10, color: '#475569', lineHeight: 1.5 }}>
                  Historical context loaded (IP velocity, device history, email count). Edit any field to test your own scenario.
                </p>
              </div>
            )}

            <button
              onClick={handleRun}
              disabled={running}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '11px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: running ? 'rgba(22,199,132,0.15)' : '#16C784',
                color: running ? '#16C784' : '#050B14',
                border: running ? '1px solid rgba(22,199,132,0.3)' : 'none',
                cursor: running ? 'wait' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {running ? <><RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Analyzing…</> : <><Play size={13} /> Run Risk Check</>}
            </button>
          </div>

          {/* Right: Results */}
          <div>
            {result
              ? <ResultsPanel result={result} ms={ms} isShadow={isShadow} eventId={eventId} />
              : running
                ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12, minHeight: 440, background: '#07111F', border: '1px solid #1E2D3D', gap: 12 }}>
                    <RefreshCw size={22} style={{ color: '#16C784', animation: 'spin 0.8s linear infinite' }} />
                    <p style={{ fontSize: 13, color: '#475569' }}>Analyzing signals…</p>
                  </div>
                )
                : <EmptyState />
            }
          </div>
        </div>

        {/* Signal categories legend */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 20 }}>
          {[
            { icon: <Mail size={13} />,    cat: 'Email',      desc: 'Disposable domains, duplicate accounts, missing email.', color: '#F59E0B' },
            { icon: <Globe size={13} />,   cat: 'IP & Geo',   desc: 'Multi-user IP, signup surge, high-risk country.', color: '#38BDF8' },
            { icon: <Monitor size={13} />, cat: 'Device',     desc: 'Multi-account devices, prior blocks, missing fingerprint.', color: '#A78BFA' },
            { icon: <Cpu size={13} />,     cat: 'Behavioral', desc: 'Headless browser, automation UA, request velocity.', color: '#F97316' },
          ].map(({ icon, cat, desc, color }) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 10, background: '#07111F', border: '1px solid #1E2D3D' }}>
              <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 3 }}>{cat} signals</p>
                <p style={{ fontSize: 10, color: '#2D4057', lineHeight: 1.5 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ borderTop: '1px solid #1E2D3D' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '72px 32px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, background: 'rgba(22,199,132,0.08)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)', fontSize: 11, fontWeight: 600, marginBottom: 20 }}>
            <Shield size={11} />
            Free tier · No credit card required
          </div>
          <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 900, color: '#E2E8F0', marginBottom: 12, lineHeight: 1.2, fontFamily: '"Inter", sans-serif' }}>
            Ready to protect your platform?
          </h2>
          <p style={{ fontSize: 14, color: '#475569', marginBottom: 32, maxWidth: 480, margin: '0 auto 32px', lineHeight: 1.7 }}>
            What you just ran lives in a single API call. Send user events and get back trust scores, fraud signals,
            and actionable decisions — in under 200ms.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 10, background: '#16C784', color: '#050B14', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Get started — it's free
              <ArrowRight size={15} />
            </Link>
            <Link to="/docs" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, background: 'transparent', color: '#94A3B8', border: '1px solid #1E2D3D', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              Read the docs
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 28, flexWrap: 'wrap' }}>
            {[
              '< 50ms average latency',
              'Webhook signing with HMAC-SHA256',
              'Designed for GDPR-aware teams',
              'No data stored in demo',
            ].map(t => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#2D4057' }}>
                <CheckCircle2 size={10} style={{ color: '#16C784' }} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
