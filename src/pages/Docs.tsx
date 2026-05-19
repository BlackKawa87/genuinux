import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, ChevronRight, ExternalLink, Menu, X } from 'lucide-react'

const NAV = [
  { id: 'introduction',     label: 'Introduction' },
  { id: 'authentication',   label: 'Authentication' },
  { id: 'endpoint',         label: 'Endpoint' },
  { id: 'request-payload',  label: 'Request Payload' },
  { id: 'response-payload', label: 'Response Payload' },
  { id: 'decisions',        label: 'Decisions' },
  { id: 'risk-levels',      label: 'Risk Levels' },
  { id: 'shadow-mode',      label: 'Shadow Mode' },
  { id: 'webhooks',         label: 'Webhooks' },
  { id: 'error-codes',      label: 'Error Codes' },
  { id: 'sdk-examples',     label: 'SDK Examples' },
  { id: 'best-practices',   label: 'Best Practices' },
]

// ─── Shared components ────────────────────────────────────────────────────────

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #1E2D3D', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#07111F', borderBottom: '1px solid #1E2D3D' }}>
        <span style={{ fontSize: 11, color: '#475569', fontFamily: '"IBM Plex Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lang}</span>
        <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#16C784' : '#475569', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '16px', background: '#050B14', overflowX: 'auto', fontSize: 13, lineHeight: 1.7, fontFamily: '"IBM Plex Mono", monospace', color: '#CBD5E1', whiteSpace: 'pre' }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ paddingBottom: 56, borderBottom: '1px solid #1E2D3D', marginBottom: 56 }}>
      <h2 style={{ fontFamily: '"Syne", sans-serif', fontSize: 22, fontWeight: 700, color: '#F1F5F9', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'inline-block', width: 3, height: 22, background: '#16C784', borderRadius: 2, flexShrink: 0 }} />
        {title}
      </h2>
      {children}
    </section>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9', marginTop: 28, marginBottom: 4 }}>{children}</div>
  )
}

function ParamRow({ name, type, required, desc }: { name: string; type: string; required?: boolean; desc: string }) {
  return (
    <tr>
      <td style={{ padding: '10px 12px', verticalAlign: 'top', borderBottom: '1px solid #1E2D3D' }}>
        <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: '#94A3B8', background: '#07111F', padding: '2px 6px', borderRadius: 4 }}>{name}</code>
        {required && <span style={{ marginLeft: 6, fontSize: 10, color: '#F87171', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>required</span>}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top', borderBottom: '1px solid #1E2D3D' }}>
        <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: '#60A5FA' }}>{type}</code>
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top', borderBottom: '1px solid #1E2D3D', color: '#94A3B8', fontSize: 13, lineHeight: 1.6 }}>{desc}</td>
    </tr>
  )
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #1E2D3D', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#07111F' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>Field</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>Type</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>Description</th>
          </tr>
        </thead>
        <tbody style={{ background: '#0B1220' }}>{children}</tbody>
      </table>
    </div>
  )
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: '"IBM Plex Mono", monospace', background: color + '20', color, border: `1px solid ${color}40` }}>{children}</span>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: '#94A3B8', fontSize: 14, lineHeight: 1.8, marginBottom: 14 }}>{children}</p>
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: '#94A3B8', background: '#07111F', padding: '1px 5px', borderRadius: 3, border: '1px solid #1E2D3D' }}>{children}</code>
}

function InfoBox({ color = '#16C784', icon, title, children }: { color?: string; icon?: string; title?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, background: '#0B1220', border: `1px solid ${color}30`, borderRadius: 8, padding: '14px 18px', display: 'flex', gap: 12 }}>
      {icon && <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>}
      <div>
        {title && <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 6 }}>{title}</div>}
        <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Code constants ───────────────────────────────────────────────────────────

const REQUEST_EXAMPLE = `{
  "external_user_id": "user_456",
  "event_type": "withdrawal",
  "email": "alice@tempmail.io",
  "ip_address": "203.0.113.42",
  "device_id": "fp_5a8b3c2d1e",
  "country": "BR",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
  "metadata": {
    "amount_usd": 12000,
    "account_age_days": 3,
    "payment_method": "crypto"
  }
}`

const RESPONSE_EXAMPLE = `{
  "event_id": "9f4e2a1b-c3d7-4e8f-a2b1-3c4d5e6f7a8b",
  "external_user_id": "user_123",
  "decision": "approve",
  "risk_level": "low",
  "trust_score": 78,
  "fraud_score": 22,
  "confidence_level": "high",
  "shadow_mode": false,
  "signals": [
    {
      "key": "DEVICE_ABSENT",
      "category": "device",
      "severity": "low",
      "label": "No device fingerprint provided"
    }
  ],
  "risk_reasons": [],
  "recommended_action": "Allow this user to continue. No significant risk signals detected.",
  "applied_rules": [],
  "summary": "This signup appears legitimate. Trust score is strong at 78/100. No action required.",
  "metadata": {
    "engine_version": "risk-engine-v1",
    "processed_at": "2026-05-19T14:22:03.412Z",
    "processing_time_ms": 142
  }
}`

const BLOCK_RESPONSE_EXAMPLE = `{
  "event_id": "7c3b1a2e-f4d5-4e6f-b7c8-9d0e1f2a3b4c",
  "external_user_id": "user_789",
  "decision": "block",
  "risk_level": "critical",
  "trust_score": 12,
  "fraud_score": 88,
  "confidence_level": "high",
  "shadow_mode": false,
  "signals": [
    { "key": "IP_MULTI_USER",        "category": "ip",       "severity": "high",     "label": "IP shared across many accounts" },
    { "key": "DEVICE_PRIOR_BLOCK",   "category": "device",   "severity": "critical", "label": "Device previously blocked" },
    { "key": "VELOCITY_SIGNUP_IP",   "category": "velocity", "severity": "high",     "label": "Signup surge from this IP" }
  ],
  "risk_reasons": [
    { "category": "ip",       "severity": "high",     "reason": "An unusually high number of distinct users have been detected from this IP address." },
    { "category": "device",   "severity": "critical", "reason": "This device was previously associated with an event that resulted in a block decision." },
    { "category": "velocity", "severity": "high",     "reason": "Multiple account registrations were detected from the same IP address in a short period." }
  ],
  "recommended_action": "Block this user. Strong fraud indicators detected across IP, device, and velocity signals.",
  "applied_rules": [
    { "id": "rule_8f2a1b3c", "name": "Block high-volume IPs" }
  ],
  "summary": "High-risk withdrawal detected. Device has prior blocks. IP shared by 14 accounts in the last 24h.",
  "metadata": {
    "engine_version": "risk-engine-v1",
    "processed_at": "2026-05-19T14:23:11.084Z",
    "processing_time_ms": 187
  }
}`

const SHADOW_RESPONSE_EXAMPLE = `{
  "event_id": "3a8f2b1c-d4e5-4f6a-b7c8-9d0e1f2a3b4c",
  "external_user_id": "user_456",
  "decision": "approve",
  "risk_level": "high",
  "trust_score": 34,
  "fraud_score": 66,
  "confidence_level": "high",
  "shadow_mode": true,
  "suggested_decision": "block",
  "live_decision": "approve",
  "message": "This event would have been blocked in Live Mode.",
  "signals": [
    { "key": "IP_MULTI_USER",      "category": "ip",       "severity": "high", "label": "IP shared across many accounts" },
    { "key": "EMAIL_DISPOSABLE",   "category": "email",    "severity": "medium", "label": "Disposable email domain" }
  ],
  "risk_reasons": [
    { "category": "ip",    "severity": "high",   "reason": "An unusually high number of distinct users have been detected from this IP address." },
    { "category": "email", "severity": "medium", "reason": "The email domain is associated with temporary or disposable addresses." }
  ],
  "recommended_action": "Block this user. Strong fraud indicators detected.",
  "applied_rules": [],
  "summary": "High-risk signup. IP associated with 9 accounts. Disposable email domain detected.",
  "metadata": {
    "engine_version": "risk-engine-v1",
    "processed_at": "2026-05-19T14:22:03.412Z",
    "processing_time_ms": 118
  }
}`

const WEBHOOK_PAYLOAD = `{
  "event": "risk.event.blocked",
  "event_id": "9f4e2a1b-c3d7-4e8f-a2b1-3c4d5e6f7a8b",
  "external_user_id": "user_789",
  "event_type": "withdrawal",
  "decision": "block",
  "risk_level": "critical",
  "trust_score": 12,
  "fraud_score": 88,
  "confidence_level": "high",
  "signals": [
    { "key": "DEVICE_PRIOR_BLOCK", "category": "device", "severity": "critical", "label": "Device previously blocked" }
  ],
  "risk_reasons": [
    { "category": "device", "severity": "critical", "reason": "This device was previously associated with a block decision." }
  ],
  "recommended_action": "Block this user. Strong fraud indicators detected.",
  "applied_rules": [],
  "summary": "High-risk withdrawal detected. Device has prior blocks.",
  "shadow_mode": false,
  "created_at": "2026-05-19T14:22:03.412Z"
}`

const WEBHOOK_EVENTS = [
  ['risk.check.completed', 'Fires on every check, regardless of decision.'],
  ['risk.event.approved',  'Decision is approve.'],
  ['risk.event.blocked',   'Decision is block.'],
  ['risk.review.required', 'Decision is review. Event added to queue.'],
  ['rule.triggered',       'A custom rule overrode the base engine decision.'],
]

const CURL_EXAMPLE = `# Minimal request
curl -X POST https://genuinux.vercel.app/api/risk/check \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_user_id": "user_123",
    "event_type": "signup",
    "email": "john@example.com",
    "ip_address": "185.10.10.10",
    "device_id": "fp_5a8b3c2d1e",
    "country": "US"
  }'

# Full request with metadata
curl -X POST https://genuinux.vercel.app/api/risk/check \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_user_id": "user_456",
    "event_type": "withdrawal",
    "email": "alice@tempmail.io",
    "ip_address": "203.0.113.42",
    "device_id": "fp_9z8y7x6w",
    "country": "BR",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    "metadata": {
      "amount_usd": 12000,
      "account_age_days": 3
    }
  }'`

const JS_EXAMPLE = `// No dependencies required — uses the standard Fetch API.
// Call this from your server-side code only. Never expose your API key in the browser.

const GENUINUX_API_KEY = process.env.GENUINUX_API_KEY

async function checkRisk(userId, eventType, data = {}) {
  const res = await fetch('https://genuinux.vercel.app/api/risk/check', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${GENUINUX_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_user_id: userId,
      event_type: eventType,
      email:      data.email,
      ip_address: data.ip,
      device_id:  data.deviceId,
      country:    data.country,
      user_agent: data.userAgent,
      metadata:   data.metadata,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(\`Genuinux [\${res.status}]: \${err.error}\`)
  }

  const result = await res.json()

  switch (result.decision) {
    case 'block':
      return { allowed: false, reason: result.recommended_action }
    case 'review':
      // Allow the action but flag for manual review
      return { allowed: true, flagged: true, reason: result.recommended_action }
    case 'approve':
    default:
      return { allowed: true }
  }
}

// Example usage
const risk = await checkRisk('user_456', 'withdrawal', {
  email:    req.body.email,
  ip:       req.ip,
  deviceId: req.headers['x-device-id'],
  country:  req.body.country,
  metadata: { amount_usd: req.body.amount },
})

if (!risk.allowed) {
  return res.status(403).json({ error: risk.reason })
}`

const NODE_WEBHOOK_EXAMPLE = `const crypto  = require('crypto')
const express = require('express')
const app     = express()

function verifySignature(rawBody, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
  // Use timingSafeEqual to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature ?? ''),
    Buffer.from(expected)
  )
}

app.post(
  '/webhooks/genuinux',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['x-genuinux-signature']
    const raw = req.body.toString()

    if (!verifySignature(raw, sig, process.env.GENUINUX_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const event = JSON.parse(raw)

    switch (event.event) {
      case 'risk.event.blocked':
        // Lock the account, deny the transaction, alert the security team
        await blockUser(event.external_user_id, {
          reason: event.recommended_action,
          signals: event.signals,
        })
        break

      case 'risk.review.required':
        // Allow the action but add to manual review queue
        await flagForReview(event.external_user_id, {
          fraudScore: event.fraud_score,
          riskLevel:  event.risk_level,
        })
        break

      case 'risk.event.approved':
        // No action needed — log for audit if required
        break
    }

    res.status(200).json({ received: true })
  }
)`

const PYTHON_EXAMPLE = `import os
import hmac
import hashlib
import requests

GENUINUX_API_KEY = os.environ["GENUINUX_API_KEY"]
BASE_URL = "https://genuinux.vercel.app"

def check_risk(user_id: str, event_type: str, **kwargs) -> dict:
    """Send a risk check and return the parsed response."""
    payload = {"external_user_id": user_id, "event_type": event_type, **kwargs}
    response = requests.post(
        f"{BASE_URL}/api/risk/check",
        json=payload,
        headers={
            "Authorization": f"Bearer {GENUINUX_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Verify the X-Genuinux-Signature header on incoming webhooks."""
    expected = "sha256=" + hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


# Usage example
result = check_risk(
    user_id="user_456",
    event_type="signup",
    email="alice@example.com",
    ip_address="203.0.113.42",
    device_id="fp_5a8b3c2d1e",
    country="US",
    metadata={"plan": "premium"},
)

decision = result["decision"]
if decision == "block":
    raise PermissionError(result["recommended_action"])
elif decision == "review":
    queue_for_review(result["external_user_id"], result["fraud_score"])
# else: approve — allow the action`

export default function Docs() {
  const [active, setActive] = useState('introduction')
  const [mobileOpen, setMobileOpen] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const options = { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    observerRef.current = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(entry.target.id)
      }
    }, options)
    NAV.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observerRef.current?.observe(el)
    })
    return () => observerRef.current?.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMobileOpen(false)
  }

  const Sidebar = () => (
    <nav style={{ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #1E2D3D', marginBottom: 12 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/logo-full.png" alt="Genuinux" style={{ height: '88px', display: 'block', filter: 'brightness(0) invert(1)' }} />
        </Link>
        <div style={{ marginTop: 6, fontSize: 11, color: '#475569', fontFamily: '"IBM Plex Mono", monospace' }}>API Reference v1</div>
      </div>
      {NAV.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => scrollTo(id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 20px',
            background: active === id ? '#16C78412' : 'none',
            borderLeft: `2px solid ${active === id ? '#16C784' : 'transparent'}`,
            border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
            color: active === id ? '#16C784' : '#475569',
            fontSize: 13, fontWeight: active === id ? 600 : 400,
            transition: 'all 0.15s',
          }}
        >
          {active === id && <ChevronRight size={12} style={{ flexShrink: 0 }} />}
          {active !== id && <span style={{ width: 12 }} />}
          {label}
        </button>
      ))}
      <div style={{ marginTop: 'auto', padding: '20px 20px 0', borderTop: '1px solid #1E2D3D' }}>
        <Link to="/demo" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', textDecoration: 'none' }}>
          <ExternalLink size={12} />
          Live Demo
        </Link>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', textDecoration: 'none', marginTop: 8 }}>
          <ExternalLink size={12} />
          Dashboard
        </Link>
      </div>
    </nav>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#050B14', color: '#F1F5F9' }}>
      {/* Mobile header */}
      <div style={{ display: 'none', position: 'sticky', top: 0, zIndex: 50, background: '#07111F', borderBottom: '1px solid #1E2D3D', padding: '12px 20px', alignItems: 'center', justifyContent: 'space-between' }} className="mobile-header">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/logo-full.png" alt="Genuinux" style={{ height: '72px', display: 'block', filter: 'brightness(0) invert(1)' }} />
        </Link>
        <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto' }}>
        {/* Sidebar */}
        <aside style={{ width: 240, flexShrink: 0, background: '#07111F', borderRight: '1px solid #1E2D3D', minHeight: '100vh' }}>
          <Sidebar />
        </aside>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0, padding: '56px 60px 80px' }}>

          {/* Page header */}
          <div style={{ marginBottom: 56, paddingBottom: 32, borderBottom: '1px solid #1E2D3D' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: '#16C784', fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>API Reference</span>
              <span style={{ color: '#1E2D3D' }}>·</span>
              <span style={{ fontSize: 11, color: '#475569', fontFamily: '"IBM Plex Mono", monospace' }}>v1.0</span>
            </div>
            <h1 style={{ fontFamily: '"Syne", sans-serif', fontSize: 36, fontWeight: 800, color: '#F1F5F9', marginBottom: 12, lineHeight: 1.2 }}>
              Genuinux API Documentation
            </h1>
            <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.7, maxWidth: 600 }}>
              Real-time fraud detection and risk scoring for every user event. One POST request — decision returned in under 200ms.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#16C784', background: '#16C78412', border: '1px solid #16C78430', borderRadius: 6, padding: '4px 10px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16C784', display: 'inline-block' }} />
                All systems operational
              </span>
              <span style={{ fontSize: 12, color: '#475569' }}>
                Base URL: <InlineCode>https://genuinux.vercel.app</InlineCode>
              </span>
            </div>
          </div>

          {/* ── 1. Introduction ─────────────────────────────────────── */}
          <Section id="introduction" title="Introduction">
            <P>
              Genuinux returns real-time risk decisions for your users. Send a user event — signup, login, transaction,
              withdrawal — and receive a trust score, fraud score, and an actionable decision (<InlineCode>approve</InlineCode>,{' '}
              <InlineCode>review</InlineCode>, or <InlineCode>block</InlineCode>) in a single synchronous API call.
            </P>
            <P>
              The engine analyzes over 300 signals: email quality, IP velocity, device fingerprinting, behavioral patterns,
              and geo-risk — all without storing PII beyond what you send. Decisions are explainable: every response includes
              the signals that triggered it and a plain-English recommendation.
            </P>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
              {[
                { label: 'Trust Score', desc: '0–100. Higher means more trustworthy. Used to gauge overall legitimacy.' },
                { label: 'Fraud Score', desc: '0–100. Higher means more suspicious. Drives the final decision.' },
                { label: 'Decision',    desc: 'approve, review, or block. Act on this in your application logic.' },
              ].map(c => (
                <div key={c.label} style={{ background: '#0B1220', border: '1px solid #1E2D3D', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.6 }}>{c.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 16 }}>
              {[
                { n: '< 200ms', l: 'Avg latency' },
                { n: '300+',    l: 'Signals analyzed' },
                { n: '7',       l: 'Event types' },
                { n: '1',       l: 'API call needed' },
              ].map(({ n, l }) => (
                <div key={l} style={{ background: '#07111F', border: '1px solid #1E2D3D', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 18, fontWeight: 700, color: '#16C784' }}>{n}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── 2. Authentication ────────────────────────────────────── */}
          <Section id="authentication" title="Authentication">
            <P>
              Every request must include your API key in the <InlineCode>Authorization</InlineCode> header using the
              Bearer scheme. Generate keys from <strong style={{ color: '#F1F5F9' }}>Dashboard → API Keys</strong>.
            </P>
            <CodeBlock lang="http" code={`Authorization: Bearer YOUR_API_KEY`} />
            <InfoBox color="#F59E0B" icon="⚠️">
              Never expose your API key in client-side code. All calls to <InlineCode>/api/risk/check</InlineCode> must
              originate from your backend. Keys are SHA-256 hashed on creation and cannot be retrieved afterward — if
              lost, revoke and generate a new one.
            </InfoBox>
          </Section>

          {/* ── 3. Endpoint ──────────────────────────────────────────── */}
          <Section id="endpoint" title="Endpoint">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0B1220', border: '1px solid #1E2D3D', borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
              <span style={{ background: '#3B82F620', color: '#60A5FA', border: '1px solid #3B82F640', borderRadius: 4, padding: '3px 8px', fontSize: 12, fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace' }}>POST</span>
              <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 14, color: '#F1F5F9' }}>/api/risk/check</code>
            </div>
            <P>
              The risk check endpoint is synchronous — you receive the decision before replying to your user.
              Each call also persists the event to your dashboard, upserts the user profile, adds to your review
              queue (when decision is <InlineCode>review</InlineCode>), and fires any configured webhooks.
            </P>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
              {[
                { label: 'Content-Type', value: 'application/json' },
                { label: 'Accept',       value: 'application/json' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#0B1220', border: '1px solid #1E2D3D', borderRadius: 6, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: '#475569' }}>{label}:</code>
                  <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: '#94A3B8' }}>{value}</code>
                </div>
              ))}
            </div>
          </Section>

          {/* ── 4. Request Payload ───────────────────────────────────── */}
          <Section id="request-payload" title="Request Payload">
            <P>
              Send a JSON body. Only <InlineCode>external_user_id</InlineCode> and <InlineCode>event_type</InlineCode> are
              required — every additional field improves detection accuracy.
            </P>
            <Table>
              <ParamRow name="external_user_id" type="string" required desc="Your internal user ID. Must be stable across events — do not use email or session tokens." />
              <ParamRow name="event_type"        type="string" required desc="One of: signup, login, transaction, withdrawal, referral, checkout, custom." />
              <ParamRow name="email"             type="string"          desc="User's email address. Enables disposable domain detection and email-based velocity checks." />
              <ParamRow name="ip_address"        type="string"          desc="IPv4 or IPv6 address. Drives IP velocity, multi-user clustering, and geo-risk signals." />
              <ParamRow name="device_id"         type="string"          desc="Your device fingerprint ID. Enables multi-account device detection and device reputation." />
              <ParamRow name="country"           type="string"          desc="ISO 3166-1 alpha-2 country code (e.g. US, BR, NG). Used for geo-based rules and anomaly detection." />
              <ParamRow name="user_agent"        type="string"          desc="Browser or client User-Agent. Detects headless browsers, automation frameworks, and missing UAs." />
              <ParamRow name="phone"             type="string"          desc="User's phone number. Stored in the user profile for cross-referencing." />
              <ParamRow name="metadata"          type="object"          desc="Arbitrary key-value pairs. Use for business context: amount_usd, account_age_days, payment_method. Passed through to webhooks." />
            </Table>
            <SubHeading>Valid event_type values</SubHeading>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {['signup', 'login', 'transaction', 'withdrawal', 'referral', 'checkout', 'custom'].map(t => (
                <Badge key={t} color="#60A5FA">{t}</Badge>
              ))}
            </div>
            <SubHeading>Example request body</SubHeading>
            <CodeBlock lang="json" code={REQUEST_EXAMPLE} />
          </Section>

          {/* ── 5. Response Payload ──────────────────────────────────── */}
          <Section id="response-payload" title="Response Payload">
            <P>
              A successful call returns HTTP <InlineCode>200</InlineCode>. The structure is the same regardless of
              decision — <InlineCode>risk_reasons</InlineCode> and <InlineCode>applied_rules</InlineCode> are always
              present (empty arrays for clean events).
            </P>
            <SubHeading>Clean event (approve)</SubHeading>
            <CodeBlock lang="json" code={RESPONSE_EXAMPLE} />
            <SubHeading>High-risk event with custom rule (block)</SubHeading>
            <CodeBlock lang="json" code={BLOCK_RESPONSE_EXAMPLE} />
            <SubHeading>Response fields</SubHeading>
            <Table>
              <ParamRow name="event_id"               type="string"  desc="UUID of the stored risk event. Use this to reference it in your dashboard or for support." />
              <ParamRow name="external_user_id"        type="string"  desc="The user ID you provided in the request." />
              <ParamRow name="decision"                type="string"  desc="approve, review, or block. This is the primary signal — map it directly to your application logic." />
              <ParamRow name="risk_level"              type="string"  desc="low · medium · high · critical. Derived from fraud_score thresholds." />
              <ParamRow name="trust_score"             type="number"  desc="0–100. Higher means more trustworthy." />
              <ParamRow name="fraud_score"             type="number"  desc="0–100. Higher means more suspicious." />
              <ParamRow name="confidence_level"        type="string"  desc="low · medium · high. How certain the engine is. Low = borderline case; high = clear evidence in one direction." />
              <ParamRow name="shadow_mode"             type="boolean" desc="Always present. true when your org runs in Shadow Mode — live_decision is always approve." />
              <ParamRow name="signals"                 type="array"   desc="Detected signals. Each has: key (machine-readable code), category (email/ip/device/velocity/behavioral), severity (low/medium/high/critical), label (human-readable)." />
              <ParamRow name="risk_reasons"            type="array"   desc="Plain-English explanations for each signal. Empty for approve decisions with no signals. Always populated on review and block." />
              <ParamRow name="recommended_action"      type="string"  desc="A one-sentence action recommendation based on the decision. Safe to log or surface to your ops team." />
              <ParamRow name="applied_rules"           type="array"   desc="Custom rules that overrode the base engine decision. Empty if no rule fired. Each entry has id and name." />
              <ParamRow name="summary"                 type="string"  desc="Narrative explanation of the risk assessment. AI-generated when OpenAI is configured, template-based otherwise." />
              <ParamRow name="metadata.engine_version" type="string"  desc="Risk engine version that processed this event." />
              <ParamRow name="metadata.processed_at"   type="string"  desc="ISO 8601 timestamp of when the engine ran." />
              <ParamRow name="metadata.processing_time_ms" type="number" desc="End-to-end engine execution time in milliseconds." />
            </Table>
          </Section>

          {/* ── 6. Decisions ─────────────────────────────────────────── */}
          <Section id="decisions" title="Decisions">
            <P>
              The <InlineCode>decision</InlineCode> field is your integration point. Map each value to your application
              logic directly — the engine handles the scoring, you handle the action.
            </P>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {[
                {
                  decision: 'approve', color: '#16C784', action: 'Allow',
                  desc: 'The event shows no significant risk signals. Let the user proceed. No further action required.',
                  code: "if (result.decision === 'approve') proceed()",
                },
                {
                  decision: 'review', color: '#F59E0B', action: 'Flag',
                  desc: 'Anomalies detected but not conclusive enough to block. Allow the action, add the event to your manual review queue, and investigate when staffed. You may also choose to add friction (e.g. 2FA challenge).',
                  code: "if (result.decision === 'review') flagForReview(userId)",
                },
                {
                  decision: 'block', color: '#EF4444', action: 'Deny',
                  desc: 'Strong fraud indicators. Deny the action, do not provide a specific reason to the end user (to avoid signal leakage), and log the attempt for your records.',
                  code: "if (result.decision === 'block') denyAccess()",
                },
              ].map(({ decision, color, action, desc, code }) => (
                <div key={decision} style={{ background: '#0B1220', border: `1px solid ${color}25`, borderRadius: 8, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <Badge color={color}>{decision}</Badge>
                    <span style={{ fontSize: 12, color: '#475569' }}>→ {action}</span>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>{desc}</p>
                  <code style={{ display: 'block', fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: '#475569', background: '#07111F', padding: '6px 10px', borderRadius: 4 }}>{code}</code>
                </div>
              ))}
            </div>
            <InfoBox color="#60A5FA" title="Custom Rules Override">
              Rules configured in <strong style={{ color: '#F1F5F9' }}>Dashboard → Rules</strong> run after the base engine
              and can override the default decision. Rules are evaluated by priority, then age. When a rule fires, its{' '}
              <InlineCode>id</InlineCode> and <InlineCode>name</InlineCode> appear in <InlineCode>applied_rules</InlineCode>.
            </InfoBox>
          </Section>

          {/* ── 7. Risk Levels ───────────────────────────────────────── */}
          <Section id="risk-levels" title="Risk Levels">
            <P>
              <InlineCode>risk_level</InlineCode> is a human-readable label derived from <InlineCode>fraud_score</InlineCode>.
              Use <InlineCode>decision</InlineCode> for application logic — <InlineCode>risk_level</InlineCode> is best
              suited for dashboards, logging, and alerting thresholds.
            </P>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {[
                { level: 'low',      color: '#16C784', range: 'fraud_score 0–39',   desc: 'Normal user behavior. No meaningful signals detected. Allow the action.' },
                { level: 'medium',   color: '#F59E0B', range: 'fraud_score 40–59',  desc: 'Mild anomalies. Worth monitoring. Engine may return review depending on signal pattern.' },
                { level: 'high',     color: '#F97316', range: 'fraud_score 60–79',  desc: 'Multiple risk signals. Likely fraudulent. Review or block strongly recommended.' },
                { level: 'critical', color: '#EF4444', range: 'fraud_score 80–100', desc: 'Strong fraud indicators. Automated abuse or account takeover pattern. Block immediately.' },
              ].map(({ level, color, range, desc }) => (
                <div key={level} style={{ background: '#0B1220', border: `1px solid ${color}30`, borderRadius: 8, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, flexShrink: 0, minWidth: 88 }}>
                    <Badge color={color}>{level}</Badge>
                    <span style={{ fontSize: 10, color: '#475569', fontFamily: '"IBM Plex Mono", monospace' }}>{range}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', lineHeight: 1.6, paddingTop: 2 }}>{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── 8. Shadow Mode ───────────────────────────────────────── */}
          <Section id="shadow-mode" title="Shadow Mode">
            <P>
              Shadow Mode lets you run Genuinux in observation mode before committing to live decisions. The engine
              runs at full capacity — scoring, rule evaluation, signal detection — but the <InlineCode>decision</InlineCode>{' '}
              returned to your system is always <InlineCode>approve</InlineCode>. No user is ever blocked or flagged.
            </P>
            <P>
              This lets you measure false positive and false negative rates against your real traffic before enabling
              Live Mode. Enable it from <strong style={{ color: '#F1F5F9' }}>Dashboard → Settings → Risk Preferences</strong>.
            </P>
            <SubHeading>How to read a Shadow Mode response</SubHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, marginBottom: 4 }}>
              {[
                { field: 'shadow_mode',       val: 'true',    desc: 'Indicates your org is in Shadow Mode.' },
                { field: 'decision',          val: '"approve"', desc: 'Always approve — this is the live outcome your system acts on.' },
                { field: 'suggested_decision',val: '"block"',  desc: 'What the engine would have decided in Live Mode.' },
                { field: 'live_decision',     val: '"approve"', desc: 'Mirrors decision — explicit confirmation of what was applied.' },
                { field: 'message',           val: 'string',  desc: 'Plain-English explanation of the gap between suggested and live decision.' },
              ].map(({ field, val, desc }) => (
                <div key={field} style={{ background: '#07111F', border: '1px solid #1E2D3D', borderRadius: 6, padding: '8px 12px', display: 'grid', gridTemplateColumns: '180px 90px 1fr', gap: 10, alignItems: 'center' }}>
                  <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: '#94A3B8' }}>{field}</code>
                  <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: '#60A5FA' }}>{val}</code>
                  <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{desc}</span>
                </div>
              ))}
            </div>
            <SubHeading>Shadow Mode response example</SubHeading>
            <CodeBlock lang="json" code={SHADOW_RESPONSE_EXAMPLE} />
            <InfoBox color="#16C784" title="Recommended onboarding flow">
              Start in Shadow Mode. Monitor your dashboard for false positives (legitimate users flagged as block/review)
              and false negatives (blocked users who slipped through). Tune your custom rules. Switch to Live Mode once
              you are confident the engine matches your expectations.
            </InfoBox>
          </Section>

          {/* ── 9. Webhooks ──────────────────────────────────────────── */}
          <Section id="webhooks" title="Webhooks">
            <P>
              Configure endpoints in <strong style={{ color: '#F1F5F9' }}>Dashboard → Webhooks</strong> to receive
              real-time push notifications after each risk check. Genuinux signs every delivery with HMAC-SHA256 so
              you can verify authenticity before processing.
            </P>

            <SubHeading>Event types</SubHeading>
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #1E2D3D', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#07111F' }}>
                    {['Event', 'When it fires'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ background: '#0B1220' }}>
                  {WEBHOOK_EVENTS.map(([event, desc]) => (
                    <tr key={event}>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D' }}><InlineCode>{event}</InlineCode></td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', color: '#94A3B8' }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SubHeading>Signature headers</SubHeading>
            <CodeBlock lang="http" code={`X-Genuinux-Signature: sha256=<hmac_hex>   # HMAC-SHA256 of the raw body using your webhook secret
X-Genuinux-Event:     risk.event.blocked  # Event type that fired
X-Genuinux-Timestamp: 1716127323          # Unix timestamp of delivery`} />

            <SubHeading>Webhook payload</SubHeading>
            <CodeBlock lang="json" code={WEBHOOK_PAYLOAD} />

            <InfoBox color="#16C784" title="Delivery behavior">
              Webhooks are fire-and-forget — if your endpoint is unreachable, the delivery is not retried automatically.
              Every attempt (success or failure) is logged in the dashboard under each webhook's delivery history.
              Always return HTTP <InlineCode>200</InlineCode> to acknowledge receipt.
            </InfoBox>
          </Section>

          {/* ── 10. Error Codes ──────────────────────────────────────── */}
          <Section id="error-codes" title="Error Codes">
            <P>
              All errors return JSON with an <InlineCode>error</InlineCode> field describing the problem.
              Rate limit errors also include <InlineCode>code</InlineCode>, <InlineCode>plan</InlineCode>,
              and <InlineCode>limit</InlineCode>.
            </P>
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #1E2D3D', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#07111F' }}>
                    {['Status', 'Code', 'Cause', 'Resolution'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ background: '#0B1220' }}>
                  {[
                    ['400', 'invalid_payload',      'Missing required field or invalid event_type.',           'Check that external_user_id and event_type are present and valid. Ensure JSON is well-formed.'],
                    ['401', 'invalid_api_key',       'Missing or malformed Authorization header.',              'Include Authorization: Bearer YOUR_API_KEY. Verify the key is active.'],
                    ['403', 'organization_disabled', 'API key is revoked, or the organization account is disabled.', 'Generate a new key from the dashboard. Contact support if the org is unexpectedly disabled.'],
                    ['429', 'rate_limited',          'Monthly event limit exceeded (free plan: 10,000/month).', 'Upgrade your plan or reduce call frequency. Free plan limit resets monthly.'],
                    ['500', 'internal_error',        'Unexpected server error.',                                'Retry with exponential backoff. If persistent, contact support.'],
                  ].map(([status, code, cause, fix], i) => (
                    <tr key={i}>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', fontFamily: '"IBM Plex Mono", monospace', color: Number(status) >= 500 ? '#EF4444' : Number(status) >= 400 ? '#F59E0B' : '#16C784', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{status}</td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', whiteSpace: 'nowrap' }}><InlineCode>{code}</InlineCode></td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', color: '#94A3B8', lineHeight: 1.5 }}>{cause}</td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', color: '#94A3B8', lineHeight: 1.5 }}>{fix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SubHeading>Error response shape</SubHeading>
            <CodeBlock lang="json" code={`{
  "error": "external_user_id is required and must be a string"
}

// Rate limit error also includes:
{
  "error": "Monthly event limit reached. Upgrade to Growth for more.",
  "code": "PLAN_LIMIT_EXCEEDED",
  "plan": "free",
  "limit": 10000
}`} />
          </Section>

          {/* ── 11. SDK Examples ─────────────────────────────────────── */}
          <Section id="sdk-examples" title="SDK Examples">
            <P>
              No official SDK is required. The API is plain JSON over HTTPS. Below are minimal, production-ready
              patterns for the most common runtimes.
            </P>

            <SubHeading>cURL</SubHeading>
            <CodeBlock lang="bash" code={CURL_EXAMPLE} />

            <SubHeading>JavaScript / TypeScript (server-side)</SubHeading>
            <P>
              Use from any Node.js, Deno, or Bun server. Never call this endpoint from the browser — your API key
              would be exposed.
            </P>
            <CodeBlock lang="javascript" code={JS_EXAMPLE} />

            <SubHeading>Node.js — Webhook verification (Express)</SubHeading>
            <CodeBlock lang="javascript" code={NODE_WEBHOOK_EXAMPLE} />

            <SubHeading>Python</SubHeading>
            <CodeBlock lang="python" code={PYTHON_EXAMPLE} />

            <InfoBox color="#475569" title="Official SDKs">
              Native SDKs for Python, Go, and Ruby are on the roadmap. Until then, the patterns above cover
              the full integration surface. The API contract is stable — these snippets will not need changes
              when SDKs ship.
            </InfoBox>
          </Section>

          {/* ── 12. Best Practices ───────────────────────────────────── */}
          <Section id="best-practices" title="Best Practices">
            <P>Follow these guidelines to get the most accurate decisions and the smoothest integration.</P>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                {
                  n: '01', title: 'Use a stable external_user_id',
                  body: 'Pass your permanent user ID — not an email, session token, or temporary ID. If the same user logs in from a new device, Genuinux can correlate events only if the ID is consistent. Avoid UUIDs generated per-request.',
                },
                {
                  n: '02', title: 'Include device_id when possible',
                  body: 'Device fingerprinting is one of the highest-signal inputs. Use a client-side fingerprinting library (e.g. FingerprintJS) and pass the result as device_id. This enables multi-account device detection, device reputation, and velocity signals that are impossible to spoof.',
                },
                {
                  n: '03', title: 'Map event_type accurately',
                  body: 'Use the most specific type available. A withdrawal scored differently than a login — the engine applies different signal weights per event type. Use "custom" only as a last resort; it disables event-specific scoring.',
                },
                {
                  n: '04', title: 'Send metadata for business context',
                  body: 'Fields like amount_usd, account_age_days, and payment_method let custom rules apply business-specific logic. For example: block withdrawals over $10,000 from accounts under 7 days old. Metadata is stored with the event and passed to webhooks.',
                },
                {
                  n: '05', title: 'Start in Shadow Mode before going live',
                  body: 'Enable Shadow Mode in Settings before your first production deployment. Monitor your dashboard for a week. Tune custom rules to reduce false positives. Switch to Live Mode once the block rate matches your expectations. This avoids blocking legitimate users on day one.',
                },
                {
                  n: '06', title: 'Handle all three decisions explicitly',
                  body: 'Do not treat review the same as approve. Review events go to your manual queue — your ops team needs to act on them. Build the UI and workflow for review before enabling Live Mode, otherwise events will pile up unreviewed.',
                },
              ].map(({ n, title, body }) => (
                <div key={n} style={{ background: '#0B1220', border: '1px solid #1E2D3D', borderRadius: 8, padding: '16px 18px', display: 'flex', gap: 16 }}>
                  <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: '#16C784', fontWeight: 700, flexShrink: 0, paddingTop: 2 }}>{n}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 6 }}>{title}</div>
                    <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', lineHeight: 1.7 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div style={{ marginTop: 40, background: '#0B1220', border: '1px solid #16C78430', borderRadius: 10, padding: '24px 28px' }}>
              <div style={{ fontFamily: '"Syne", sans-serif', fontWeight: 700, fontSize: 18, color: '#F1F5F9', marginBottom: 8 }}>
                Ready to integrate?
              </div>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94A3B8', lineHeight: 1.6, maxWidth: 480 }}>
                Create your account, generate an API key, and send your first risk check in under 15 minutes.
                Start on the free plan — no credit card required.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: '#16C784', color: '#050B14', borderRadius: 6, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  Get API Key
                  <ChevronRight size={14} />
                </Link>
                <Link to="/demo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'transparent', color: '#94A3B8', border: '1px solid #1E2D3D', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                  Try Live Demo
                </Link>
              </div>
            </div>
          </Section>

        </main>
      </div>
    </div>
  )
}
