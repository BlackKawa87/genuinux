import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, Play, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, XCircle, Zap, ArrowRight,
  Activity, Globe, Monitor, Mail, Cpu, Clock,
} from 'lucide-react'
import { analyze } from '../lib/riskEngine'
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
  id:          string
  label:       string
  tag:         string
  description: string
  color:       string
  tagBg:       string
  form:        Partial<DemoForm>
  context:     Partial<RiskEngineContext>
  metadata?:   Record<string, unknown>
}

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
  {
    id: 'genuine', label: 'Genuine User', tag: 'Low risk', color: '#16C784', tagBg: 'rgba(22,199,132,0.12)',
    description: 'Clean signup from a trusted user with normal signals.',
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
    id: 'suspicious', label: 'Suspicious Signup', tag: 'Review', color: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
    description: 'Disposable email linked to multiple accounts.',
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
    id: 'multiAccount', label: 'Multi-Account Abuse', tag: 'High risk', color: '#F97316', tagBg: 'rgba(249,115,22,0.12)',
    description: 'Device shared across many accounts with IP abuse.',
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
    id: 'withdrawal', label: 'High-Risk Withdrawal', tag: 'Blocked', color: '#EF4444', tagBg: 'rgba(239,68,68,0.12)',
    description: 'Automated $75K withdrawal with multiple critical signals.',
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
    id: 'bot', label: 'Bot Behavior', tag: 'Blocked', color: '#EF4444', tagBg: 'rgba(239,68,68,0.12)',
    description: 'Headless Chrome automation with velocity abuse.',
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
]

const EVENT_TYPES = ['signup', 'login', 'transaction', 'withdrawal', 'referral', 'checkout', 'custom']

const EMPTY_FORM: DemoForm = {
  event_type: 'signup', email: '', ip_address: '', device_id: '', country: '', user_agent: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trustColor(s: number) { return s >= 70 ? '#16C784' : s >= 45 ? '#F59E0B' : '#EF4444' }
function fraudColor(s: number) { return s >= 70 ? '#EF4444' : s >= 40 ? '#F59E0B' : '#16C784' }

const DECISION_META = {
  allow:  { label: 'Approved',     icon: CheckCircle2, color: '#16C784', bg: 'rgba(22,199,132,0.08)',  border: 'rgba(22,199,132,0.25)'  },
  review: { label: 'Review',       icon: AlertTriangle, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)'  },
  block:  { label: 'Blocked',      icon: XCircle,       color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
} as const

const RISK_COLORS = { low: '#16C784', medium: '#F59E0B', high: '#F97316', critical: '#EF4444' }

const SEV_COLORS: Record<string, string> = {
  low: '#16C784', medium: '#F59E0B', high: '#F97316', critical: '#EF4444',
}

// ─── Score display ─────────────────────────────────────────────────────────────

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: '#475569' }}>{label}</span>
        <span className="text-4xl font-black mono" style={{ color }}>{score}</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 5, background: '#1E2D3D' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, background: color, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </div>
      <p className="text-[10px] mt-1 text-right mono" style={{ color: '#2D4057' }}>/ 100</p>
    </div>
  )
}

// ─── Results panel ────────────────────────────────────────────────────────────

function ResultsPanel({ result, ms }: { result: RiskEngineOutput; ms: number }) {
  const dec    = DECISION_META[result.decision]
  const DecIcon = dec.icon
  const riskColor = RISK_COLORS[result.risk_level] ?? '#94A3B8'
  const [showApi, setShowApi] = useState(false)

  const requestJson = JSON.stringify({
    external_user_id: 'usr_demo',
    event_type:       result.signals.length > 0 ? '...' : 'signup',
    email:            '...',
    ip_address:       '...',
  }, null, 2)

  const responseJson = JSON.stringify({
    event_id:           'evt_' + Math.random().toString(36).slice(2, 10),
    trust_score:        result.trust_score,
    fraud_score:        result.fraud_score,
    risk_level:         result.risk_level,
    decision:           result.decision === 'allow' ? 'approve' : result.decision,
    signals:            result.signals.slice(0, 2).map(s => ({ code: s.code, severity: s.severity })),
    summary:            result.ai_summary.slice(0, 60) + '...',
    processing_time_ms: ms,
  }, null, 2)

  return (
    <div className="flex flex-col gap-0 rounded-xl overflow-hidden" style={{ border: '1px solid #1E2D3D' }}>

      {/* Score bars */}
      <div className="grid grid-cols-2 gap-6 p-6" style={{ background: '#07111F' }}>
        <ScoreBar label="Trust Score" score={result.trust_score} color={trustColor(result.trust_score)} />
        <ScoreBar label="Fraud Score" score={result.fraud_score} color={fraudColor(result.fraud_score)} />
      </div>

      {/* Decision banner */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ background: dec.bg, borderTop: `1px solid ${dec.border}`, borderBottom: `1px solid ${dec.border}` }}
      >
        <div className="flex items-center gap-3">
          <DecIcon size={18} style={{ color: dec.color }} />
          <div>
            <p className="text-xs font-semibold" style={{ color: '#475569' }}>Decision</p>
            <p className="text-lg font-black" style={{ color: dec.color }}>{dec.label}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold" style={{ color: '#475569' }}>Risk Level</p>
          <p className="text-lg font-black capitalize" style={{ color: riskColor }}>{result.risk_level}</p>
        </div>
      </div>

      {/* AI Summary */}
      <div className="px-6 py-4" style={{ background: '#07111F', borderBottom: '1px solid #1E2D3D' }}>
        <div className="flex items-center gap-2 mb-2">
          <Zap size={11} style={{ color: '#16C784' }} />
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
            AI Summary
          </p>
          <span className="text-[10px] px-1.5 py-0.5 rounded mono" style={{ background: '#050B14', color: '#2D4057', border: '1px solid #1E2D3D' }}>
            {ms}ms
          </span>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: '#94A3B8' }}>{result.ai_summary}</p>
      </div>

      {/* Signals */}
      <div className="px-6 py-4" style={{ background: '#07111F', borderBottom: '1px solid #1E2D3D' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#475569' }}>
          Detected Signals
          <span className="ml-2 mono" style={{ color: '#2D4057' }}>({result.signals.length})</span>
        </p>
        {result.signals.length === 0 ? (
          <div className="flex items-center gap-2 py-1">
            <CheckCircle2 size={12} style={{ color: '#16C784' }} />
            <p className="text-xs" style={{ color: '#475569' }}>No suspicious signals detected — event appears clean.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {result.signals.map(sig => {
              const sevColor = SEV_COLORS[sig.severity] ?? '#475569'
              return (
                <div
                  key={sig.code}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: '#050B14', border: '1px solid #1E2D3D' }}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: '#E2E8F0' }}>{sig.label}</p>
                    <p className="text-[10px] mono mt-0.5" style={{ color: '#2D4057' }}>{sig.code}</p>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 mono"
                    style={{
                      background: `${sevColor}15`,
                      color:  sevColor,
                      border: `1px solid ${sevColor}30`,
                    }}
                  >
                    {sig.severity}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* API equivalent toggle */}
      <div style={{ background: '#050B14' }}>
        <button
          onClick={() => setShowApi(p => !p)}
          className="w-full flex items-center justify-between px-6 py-3.5 text-xs transition-colors"
          style={{ color: '#475569' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
        >
          <span className="flex items-center gap-2 font-semibold">
            <Cpu size={11} />
            API equivalent
          </span>
          {showApi ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {showApi && (
          <div className="grid grid-cols-2 gap-0 px-6 pb-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#2D4057' }}>
                POST /api/risk/check
              </p>
              <pre
                className="text-[10px] mono leading-relaxed rounded-l-lg p-3 overflow-x-auto h-full"
                style={{ background: '#07111F', color: '#475569', border: '1px solid #1E2D3D', borderRight: 'none' }}
              >
                {requestJson}
              </pre>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#16C784' }}>
                200 OK
              </p>
              <pre
                className="text-[10px] mono leading-relaxed rounded-r-lg p-3 overflow-x-auto h-full"
                style={{ background: '#07111F', color: '#16C784', border: '1px solid #1E2D3D' }}
              >
                {responseJson}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyResults() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl h-full min-h-[420px]"
      style={{ background: '#07111F', border: '1px dashed #1E2D3D' }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.15)' }}
      >
        <Activity size={20} style={{ color: '#16C784' }} />
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: '#475569' }}>Results appear here</p>
      <p className="text-xs text-center px-8" style={{ color: '#2D4057' }}>
        Select a scenario from the presets above or fill in the form, then click Run Risk Check.
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Demo() {
  const [form,       setForm]       = useState<DemoForm>(EMPTY_FORM)
  const [preset,     setPreset]     = useState<string | null>(null)
  const [presetCtx,  setPresetCtx]  = useState<Partial<RiskEngineContext>>({})
  const [presetMeta, setPresetMeta] = useState<Record<string, unknown> | undefined>(undefined)
  const [result,     setResult]     = useState<RiskEngineOutput | null>(null)
  const [running,    setRunning]    = useState(false)
  const [ms,         setMs]         = useState(0)

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p.id)
    setForm({ ...EMPTY_FORM, ...p.form })
    setPresetCtx(p.context)
    setPresetMeta(p.metadata)
    setResult(null)
  }, [])

  const handleRun = useCallback(async () => {
    setRunning(true)
    setResult(null)

    // Brief pause to make the processing feel real
    await new Promise(r => setTimeout(r, 380))

    const input: RiskEngineInput = {
      external_user_id: 'usr_demo',
      event_type:       form.event_type as RiskEngineInput['event_type'],
      email:            form.email      || undefined,
      ip_address:       form.ip_address || undefined,
      device_id:        form.device_id  || undefined,
      country:          form.country    || undefined,
      user_agent:       form.user_agent || undefined,
      metadata:         presetMeta,
      context:          presetCtx as RiskEngineContext,
    }

    const t0  = performance.now()
    const out = analyze(input)
    const elapsed = Math.round(performance.now() - t0)

    setMs(elapsed)
    setResult(out)
    setRunning(false)
  }, [form, presetCtx, presetMeta])

  const handleReset = () => {
    setForm(EMPTY_FORM)
    setPreset(null)
    setPresetCtx({})
    setPresetMeta(undefined)
    setResult(null)
  }

  const setField = <K extends keyof DemoForm>(k: K, v: DemoForm[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setPreset(null)
  }

  return (
    <div style={{ background: '#050B14', minHeight: '100vh', color: '#E2E8F0' }}>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-30 flex items-center justify-between px-8"
        style={{
          height: 56,
          background: 'rgba(5,11,20,0.92)',
          borderBottom: '1px solid #1E2D3D',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Link to="/" className="flex items-center no-underline">
          <img src="/logo-full.png" alt="Genuinux" style={{ height: '80px', display: 'block', filter: 'brightness(0) invert(1)' }} />
          <span
            className="text-[10px] px-2 py-0.5 rounded-full mono"
            style={{ background: 'rgba(22,199,132,0.1)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)' }}
          >
            Live Demo
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-xs font-medium no-underline transition-colors"
            style={{ color: '#475569' }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = '#94A3B8')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = '#475569')}
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold no-underline"
            style={{ background: '#16C784', color: '#050B14' }}
          >
            Get API Key
            <ArrowRight size={11} />
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-8 py-12">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{ background: 'rgba(22,199,132,0.08)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Engine running locally in your browser — no API key required
          </div>
          <h1 className="text-4xl font-black mb-4 leading-tight" style={{ color: '#E2E8F0' }}>
            See fraud detection in action
          </h1>
          <p className="text-base max-w-xl mx-auto" style={{ color: '#475569' }}>
            Run the Genuinux risk engine against real scenarios. Inspect every signal,
            score, and decision — exactly as your integration would receive them.
          </p>
        </div>

        {/* ── Presets ───────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3 mb-8">
          {PRESETS.map(p => {
            const active = preset === p.id
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                className="text-left rounded-xl p-4 transition-all duration-150"
                style={{
                  background: active ? '#0B1220' : '#07111F',
                  border: active ? `1px solid ${p.color}50` : '1px solid #1E2D3D',
                  outline: 'none',
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.borderColor = '#2D4057'
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.borderColor = '#1E2D3D'
                }}
              >
                <span
                  className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mb-2"
                  style={{ background: p.tagBg, color: p.color }}
                >
                  {p.tag}
                </span>
                <p className="text-xs font-bold mb-1" style={{ color: active ? '#E2E8F0' : '#94A3B8' }}>
                  {p.label}
                </p>
                <p className="text-[10px] leading-relaxed" style={{ color: '#2D4057' }}>
                  {p.description}
                </p>
              </button>
            )
          })}
        </div>

        {/* ── Demo area ─────────────────────────────────────────── */}
        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1.2fr' }}>

          {/* Form */}
          <div
            className="rounded-xl p-6 flex flex-col gap-4"
            style={{ background: '#07111F', border: '1px solid #1E2D3D' }}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold" style={{ color: '#E2E8F0' }}>Check parameters</p>
              <button
                onClick={handleReset}
                className="text-[10px] flex items-center gap-1 transition-colors"
                style={{ color: '#2D4057' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
                onMouseLeave={e => (e.currentTarget.style.color = '#2D4057')}
              >
                <RefreshCw size={9} />
                Reset
              </button>
            </div>

            {/* event_type */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                style={{ color: '#475569' }}>
                <Activity size={10} /> Event type
              </label>
              <select
                value={form.event_type}
                onChange={e => setField('event_type', e.target.value)}
                className="g-input text-sm w-full"
              >
                {EVENT_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* email */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                style={{ color: '#475569' }}>
                <Mail size={10} /> Email address
              </label>
              <input
                value={form.email}
                onChange={e => setField('email', e.target.value)}
                placeholder="user@example.com"
                className="g-input text-sm w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* ip */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                  style={{ color: '#475569' }}>
                  <Globe size={10} /> IP address
                </label>
                <input
                  value={form.ip_address}
                  onChange={e => setField('ip_address', e.target.value)}
                  placeholder="104.18.45.12"
                  className="g-input text-sm w-full mono"
                />
              </div>
              {/* country */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: '#475569' }}>
                  Country (ISO)
                </label>
                <input
                  value={form.country}
                  onChange={e => setField('country', e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="US"
                  className="g-input text-sm w-full mono"
                  maxLength={2}
                />
              </div>
            </div>

            {/* device_id */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                style={{ color: '#475569' }}>
                <Monitor size={10} /> Device ID
              </label>
              <input
                value={form.device_id}
                onChange={e => setField('device_id', e.target.value)}
                placeholder="dev_a1b2c3d4"
                className="g-input text-sm w-full mono"
              />
            </div>

            {/* user_agent */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                style={{ color: '#475569' }}>
                <Cpu size={10} /> User agent
              </label>
              <textarea
                value={form.user_agent}
                onChange={e => setField('user_agent', e.target.value)}
                placeholder="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)…"
                rows={2}
                className="g-input text-xs w-full mono resize-none"
                style={{ lineHeight: 1.6 }}
              />
            </div>

            {/* Context note */}
            {preset && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
                style={{ background: 'rgba(22,199,132,0.05)', border: '1px solid rgba(22,199,132,0.12)' }}
              >
                <Clock size={10} style={{ color: '#16C784', flexShrink: 0, marginTop: 2 }} />
                <p className="text-[10px]" style={{ color: '#475569' }}>
                  Historical context loaded from preset (IP velocity, device history, email duplicates).
                </p>
              </div>
            )}

            {/* Run button */}
            <button
              onClick={() => void handleRun()}
              disabled={running}
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold transition-all mt-1"
              style={{
                background: running ? 'rgba(22,199,132,0.15)' : '#16C784',
                color: running ? '#16C784' : '#050B14',
                border: running ? '1px solid rgba(22,199,132,0.3)' : 'none',
                cursor: running ? 'wait' : 'pointer',
              }}
            >
              {running ? (
                <><RefreshCw size={14} className="animate-spin" /> Analyzing…</>
              ) : (
                <><Play size={14} /> Run Risk Check</>
              )}
            </button>
          </div>

          {/* Results */}
          <div>
            {result ? (
              <ResultsPanel result={result} ms={ms} />
            ) : (
              <EmptyResults />
            )}
          </div>
        </div>

        {/* ── Signal legend ──────────────────────────────────────── */}
        <div className="mt-8 grid grid-cols-4 gap-3">
          {[
            { icon: <Mail size={13} />, title: 'Email signals', desc: 'Disposable domains, duplicate accounts, missing email.' },
            { icon: <Globe size={13} />, title: 'IP & geo signals', desc: 'High-user IP, velocity, high-risk country of origin.' },
            { icon: <Monitor size={13} />, title: 'Device signals', desc: 'Multi-account devices, prior blocks, missing fingerprint.' },
            { icon: <Cpu size={13} />, title: 'Behavioral signals', desc: 'Automation UA, headless browser, request velocity.' },
          ].map(({ icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl px-4 py-3.5 flex items-start gap-3"
              style={{ background: '#07111F', border: '1px solid #1E2D3D' }}
            >
              <span style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: '#94A3B8' }}>{title}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: '#2D4057' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #1E2D3D', marginTop: 64 }}>
        <div className="max-w-3xl mx-auto px-8 py-20 text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
            style={{ background: 'rgba(22,199,132,0.08)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)' }}
          >
            <Shield size={11} />
            Free tier available — no credit card required
          </div>
          <h2 className="text-3xl font-black mb-4" style={{ color: '#E2E8F0' }}>
            Ready to protect your platform?
          </h2>
          <p className="text-base mb-8 max-w-lg mx-auto" style={{ color: '#475569' }}>
            Integrate in minutes with a single API call. Get trust scores, fraud signals,
            and actionable decisions on every user event.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/register"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold no-underline"
              style={{ background: '#16C784', color: '#050B14' }}
            >
              Start for free
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold no-underline"
              style={{ background: '#07111F', color: '#94A3B8', border: '1px solid #1E2D3D' }}
            >
              Open dashboard
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 mt-10">
            {[
              '&lt; 50ms average latency',
              '99.9% uptime SLA',
              'GDPR compliant',
              'No data stored in demo',
            ].map(t => (
              <span key={t} className="text-[11px] flex items-center gap-1.5" style={{ color: '#2D4057' }}>
                <CheckCircle2 size={10} style={{ color: '#16C784' }} />
                <span dangerouslySetInnerHTML={{ __html: t }} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
