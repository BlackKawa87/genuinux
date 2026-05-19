import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Shield, Copy, Check, ChevronRight, ExternalLink, Menu, X } from 'lucide-react'

const NAV = [
  { id: 'introduction',    label: 'Introduction' },
  { id: 'authentication',  label: 'Authentication' },
  { id: 'risk-check',      label: 'Risk Check Endpoint' },
  { id: 'request-payload', label: 'Request Payload' },
  { id: 'response-payload',label: 'Response Payload' },
  { id: 'risk-levels',     label: 'Risk Levels' },
  { id: 'decisions',       label: 'Decisions' },
  { id: 'webhooks',        label: 'Webhooks' },
  { id: 'error-codes',     label: 'Error Codes' },
  { id: 'curl-examples',   label: 'cURL Examples' },
  { id: 'js-example',      label: 'JavaScript Example' },
  { id: 'node-example',    label: 'Node.js Example' },
]

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
        <span style={{ display: 'inline-block', width: 3, height: 22, background: '#16C784', borderRadius: 2 }} />
        {title}
      </h2>
      {children}
    </section>
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

const CURL_BASIC = `curl -X POST https://genuinux.vercel.app/api/risk/check \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_user_id": "user_123",
    "event_type": "signup",
    "email": "john@example.com",
    "ip_address": "185.10.10.10",
    "device_id": "device_abc123",
    "country": "GB"
  }'`

const CURL_FULL = `curl -X POST https://genuinux.vercel.app/api/risk/check \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_user_id": "user_456",
    "event_type": "withdrawal",
    "email": "alice@example.com",
    "ip_address": "203.0.113.42",
    "device_id": "device_xyz789",
    "country": "US",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    "metadata": {
      "amount_usd": 12000,
      "account_age_days": 3
    }
  }'`

const RESPONSE_EXAMPLE = `{
  "event_id": "9f4e2a1b-c3d7-4e8f-a2b1-3c4d5e6f7a8b",
  "external_user_id": "user_123",
  "trust_score": 78,
  "fraud_score": 22,
  "risk_level": "low",
  "decision": "approve",
  "signals": [
    {
      "code": "IP_NEW_USER",
      "label": "First event from this IP",
      "severity": "info",
      "fraud_impact": 5
    }
  ],
  "summary": "This signup appears legitimate. The user's trust score is strong at 78/100. No action required.",
  "created_at": "2026-05-19T14:22:03.000Z"
}`

const JS_EXAMPLE = `async function checkRisk(userId, eventType, userData) {
  const response = await fetch("https://genuinux.vercel.app/api/risk/check", {
    method: "POST",
    headers: {
      "Authorization": "Bearer YOUR_API_KEY",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      external_user_id: userId,
      event_type: eventType,
      email: userData.email,
      ip_address: userData.ip,
      device_id: userData.deviceId,
      country: userData.country,
      user_agent: navigator.userAgent
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message)
  }

  const result = await response.json()

  if (result.decision === "block") {
    // Deny the action
    return { allowed: false, reason: result.summary }
  }

  if (result.decision === "review") {
    // Allow but flag for manual review
    return { allowed: true, flagged: true, reason: result.summary }
  }

  return { allowed: true }
}`

const NODE_EXAMPLE = `const crypto = require("crypto")

// Verify incoming webhook signatures
function verifyWebhookSignature(payload, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
  return signature === \`sha256=\${expected}\`
}

// Express webhook handler
app.post("/webhooks/genuinux", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["x-genuinux-signature"]
  const raw = req.body.toString()

  if (!verifyWebhookSignature(raw, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: "Invalid signature" })
  }

  const event = JSON.parse(raw)

  switch (event.decision) {
    case "block":
      // Lock the user account or deny the transaction
      await blockUser(event.external_user_id, event.summary)
      break
    case "review":
      // Queue for manual review
      await flagForReview(event.external_user_id, event.fraud_score)
      break
    case "approve":
      // No action needed
      break
  }

  res.status(200).json({ received: true })
})`

const WEBHOOK_PAYLOAD = `{
  "event": "risk.check.completed",
  "event_id": "9f4e2a1b-c3d7-4e8f-a2b1-3c4d5e6f7a8b",
  "external_user_id": "user_123",
  "trust_score": 78,
  "fraud_score": 22,
  "risk_level": "low",
  "decision": "approve",
  "signals": [...],
  "summary": "This signup appears legitimate...",
  "created_at": "2026-05-19T14:22:03.000Z"
}`

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
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Shield size={18} color="#16C784" />
          <span style={{ fontFamily: '"Syne", sans-serif', fontWeight: 700, fontSize: 15, color: '#F1F5F9' }}>Genuinux</span>
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
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Shield size={16} color="#16C784" />
          <span style={{ fontFamily: '"Syne", sans-serif', fontWeight: 700, fontSize: 14, color: '#F1F5F9' }}>Genuinux Docs</span>
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
            <h1 style={{ fontFamily: '"Syne", sans-serif', fontSize: 36, fontWeight: 800, color: '#F1F5F9', marginBottom: 12, lineHeight: 1.2 }}>Genuinux API Documentation</h1>
            <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.7, maxWidth: 600 }}>
              Real-time fraud detection and risk scoring for your users. Integrate in under 15 minutes with a single POST request.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#16C784', background: '#16C78412', border: '1px solid #16C78430', borderRadius: 6, padding: '4px 10px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16C784', display: 'inline-block' }} />
                All systems operational
              </span>
              <span style={{ fontSize: 12, color: '#475569' }}>Base URL: <InlineCode>https://genuinux.vercel.app</InlineCode></span>
            </div>
          </div>

          {/* 1. Introduction */}
          <Section id="introduction" title="Introduction">
            <P>
              Genuinux is a real-time fraud detection API. Send us a user event — signup, login, transaction, withdrawal —
              and we return a risk score, decision, and explanation within milliseconds.
            </P>
            <P>
              The API is built around a single endpoint: <InlineCode>POST /api/risk/check</InlineCode>. Every call analyzes
              behavioral signals, velocity patterns, email quality, device fingerprints, and IP reputation to produce a
              trust score, fraud score, and actionable decision.
            </P>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
              {[
                { label: 'Trust Score', desc: '0–100. Higher is better. Reflects how legitimate the user appears.' },
                { label: 'Fraud Score', desc: '0–100. Higher is riskier. Reflects detected fraud signals.' },
                { label: 'Decision', desc: 'approve, review, or block. Your system acts on this.' },
              ].map(c => (
                <div key={c.label} style={{ background: '#0B1220', border: '1px solid #1E2D3D', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.6 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* 2. Authentication */}
          <Section id="authentication" title="Authentication">
            <P>
              All API requests must include your API key in the <InlineCode>Authorization</InlineCode> header using the Bearer scheme.
              You can generate API keys from the <strong style={{ color: '#F1F5F9' }}>Dashboard → API Keys</strong> page.
            </P>
            <CodeBlock lang="http" code={`Authorization: Bearer gnx_live_YOUR_API_KEY`} />
            <div style={{ marginTop: 16, background: '#0B1220', border: '1px solid #F59E0B30', borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                Never expose your API key in client-side code. All requests to <InlineCode>/api/risk/check</InlineCode> must
                originate from your server. The key is hashed and cannot be retrieved after creation.
              </div>
            </div>
          </Section>

          {/* 3. Risk Check Endpoint */}
          <Section id="risk-check" title="Risk Check Endpoint">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0B1220', border: '1px solid #1E2D3D', borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
              <span style={{ background: '#3B82F620', color: '#60A5FA', border: '1px solid #3B82F640', borderRadius: 4, padding: '3px 8px', fontSize: 12, fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace' }}>POST</span>
              <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 14, color: '#F1F5F9' }}>/api/risk/check</code>
            </div>
            <P>
              Analyzes a user event and returns a risk assessment. The response is synchronous — you receive the
              decision before replying to the user. Average response time is under 200ms.
            </P>
            <P>
              Each call also records the event in your dashboard, upserts the user profile, and optionally
              adds the event to your review queue (if decision is <InlineCode>review</InlineCode>) and fires your webhooks.
            </P>
          </Section>

          {/* 4. Request Payload */}
          <Section id="request-payload" title="Request Payload">
            <P>Send a JSON body with the following fields. Only <InlineCode>external_user_id</InlineCode> and <InlineCode>event_type</InlineCode> are required.</P>
            <Table>
              <ParamRow name="external_user_id" type="string" required desc="Your internal user ID. Used to correlate events across multiple checks." />
              <ParamRow name="event_type" type="string" required desc="One of: signup, login, transaction, withdrawal, referral, checkout, custom." />
              <ParamRow name="email" type="string" desc="User's email address. Used for disposable domain checks and velocity." />
              <ParamRow name="ip_address" type="string" desc="IPv4 or IPv6 address of the user. Used for IP velocity and multi-user detection." />
              <ParamRow name="device_id" type="string" desc="Your fingerprint ID for the device. Used to detect multi-account device abuse." />
              <ParamRow name="country" type="string" desc="ISO 3166-1 alpha-2 country code (e.g. US, GB, BR). Used for geo-based rules." />
              <ParamRow name="user_agent" type="string" desc="Browser or client User-Agent string. Used to detect headless browsers and automation." />
              <ParamRow name="metadata" type="object" desc="Arbitrary key-value pairs passed through to webhooks and stored with the event. E.g. { amount_usd: 5000 }." />
            </Table>
            <p style={{ marginTop: 16, color: '#94A3B8', fontSize: 14, lineHeight: 1.8, marginBottom: 14 }}>
              Valid <InlineCode>event_type</InlineCode> values:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {['signup', 'login', 'transaction', 'withdrawal', 'referral', 'checkout', 'custom'].map(t => (
                <Badge key={t} color="#60A5FA">{t}</Badge>
              ))}
            </div>
          </Section>

          {/* 5. Response Payload */}
          <Section id="response-payload" title="Response Payload">
            <P>A successful request returns HTTP <InlineCode>200</InlineCode> with the following JSON body:</P>
            <CodeBlock lang="json" code={RESPONSE_EXAMPLE} />
            <Table>
              <ParamRow name="event_id" type="string" desc="UUID of the stored risk event. Use this to reference the event in your dashboard." />
              <ParamRow name="external_user_id" type="string" desc="The user ID you provided." />
              <ParamRow name="trust_score" type="number" desc="0–100. Higher means more trustworthy." />
              <ParamRow name="fraud_score" type="number" desc="0–100. Higher means more suspicious." />
              <ParamRow name="risk_level" type="string" desc="low, medium, high, or critical." />
              <ParamRow name="decision" type="string" desc="approve, review, or block. This is the main action signal for your system." />
              <ParamRow name="signals" type="array" desc="List of detected signals. Each has code, label, severity, and fraud_impact." />
              <ParamRow name="summary" type="string" desc="Human-readable explanation of the risk assessment. Safe to display to internal teams." />
              <ParamRow name="created_at" type="string" desc="ISO 8601 timestamp of when the event was processed." />
            </Table>
          </Section>

          {/* 6. Risk Levels */}
          <Section id="risk-levels" title="Risk Levels">
            <P>Every response includes a <InlineCode>risk_level</InlineCode> field that summarizes the threat level.</P>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {[
                { level: 'low',      color: '#16C784', range: '0–39',  desc: 'Normal user behavior. No meaningful fraud signals detected. Allow the action.' },
                { level: 'medium',   color: '#F59E0B', range: '40–59', desc: 'Some anomalies detected. The user may warrant closer attention. Consider review.' },
                { level: 'high',     color: '#F97316', range: '60–79', desc: 'Multiple fraud signals. Likely fraudulent. Review or block recommended.' },
                { level: 'critical', color: '#EF4444', range: '80–100',desc: 'Strong fraud indicators. Automated abuse or account takeover likely. Block.' },
              ].map(({ level, color, range, desc }) => (
                <div key={level} style={{ background: '#0B1220', border: `1px solid ${color}30`, borderRadius: 8, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Badge color={color}>{level}</Badge>
                    <span style={{ fontSize: 11, color: '#475569', fontFamily: '"IBM Plex Mono", monospace' }}>{range}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', lineHeight: 1.6, paddingTop: 2 }}>{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 7. Decisions */}
          <Section id="decisions" title="Decisions">
            <P>The <InlineCode>decision</InlineCode> field is your primary action signal. Map it directly to your application logic.</P>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {[
                { decision: 'approve', color: '#16C784', action: 'Allow', desc: 'The user appears legitimate. Allow the action to proceed normally.' },
                { decision: 'review',  color: '#F59E0B', action: 'Flag',  desc: 'Anomalies detected. Allow the action but flag for manual review in the dashboard. You may also hold the action pending review.' },
                { decision: 'block',   color: '#EF4444', action: 'Deny',  desc: 'High fraud risk. Deny the action and do not allow the user to proceed. Log the attempt.' },
              ].map(({ decision, color, action, desc }) => (
                <div key={decision} style={{ background: '#0B1220', border: '1px solid #1E2D3D', borderRadius: 8, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, minWidth: 90 }}>
                    <Badge color={color}>{decision}</Badge>
                    <span style={{ fontSize: 11, color: '#475569', paddingLeft: 2 }}>→ {action}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', lineHeight: 1.6, paddingTop: 2 }}>{desc}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, background: '#0B1220', border: '1px solid #1E2D3D', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 8 }}>Custom Rules Override</div>
              <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                Custom rules configured in your dashboard run after the base risk engine and can override the default decision.
                Rules are evaluated in order of creation. Use them to enforce country blocks, score thresholds, or event-specific policies.
              </p>
            </div>
          </Section>

          {/* 8. Webhooks */}
          <Section id="webhooks" title="Webhooks">
            <P>
              Configure webhooks in your dashboard to receive real-time event notifications after each risk check.
              Genuinux signs every delivery with an HMAC-SHA256 signature so you can verify authenticity.
            </P>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#F1F5F9', marginBottom: 8, marginTop: 20 }}>Signature header</div>
            <CodeBlock lang="http" code={`X-Genuinux-Signature: sha256=<hex_signature>`} />
            <div style={{ fontWeight: 600, fontSize: 13, color: '#F1F5F9', marginBottom: 8, marginTop: 20 }}>Webhook payload</div>
            <CodeBlock lang="json" code={WEBHOOK_PAYLOAD} />
            <div style={{ marginTop: 20, background: '#0B1220', border: '1px solid #16C78430', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#16C784', marginBottom: 6 }}>Delivery retries</div>
              <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                Webhook deliveries are fire-and-forget in v1. If your endpoint is down, the delivery is lost.
                Every delivery (success or failure) is logged in your dashboard under each webhook's delivery history.
                Return HTTP <InlineCode>200</InlineCode> to acknowledge receipt.
              </p>
            </div>
          </Section>

          {/* 9. Error Codes */}
          <Section id="error-codes" title="Error Codes">
            <P>All errors return a JSON body with a <InlineCode>message</InlineCode> field describing the problem.</P>
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #1E2D3D', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#07111F' }}>
                    {['Status', 'Code', 'Cause', 'Fix'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ background: '#0B1220' }}>
                  {[
                    ['400', 'bad_request',    'Missing required field or invalid event_type.',         'Check that external_user_id and event_type are present and valid.'],
                    ['401', 'unauthorized',   'Missing or malformed Authorization header.',            'Include Authorization: Bearer YOUR_API_KEY in every request.'],
                    ['403', 'forbidden',      'API key is revoked or does not match any organization.','Generate a new key from the dashboard.'],
                    ['422', 'invalid_payload','JSON body is malformed or has invalid field types.',    'Validate the body before sending. Ensure numbers are not sent as strings.'],
                    ['429', 'rate_limited',   'Too many requests in a short window.',                 'Implement exponential backoff. Contact us to raise your limit.'],
                    ['500', 'internal_error', 'Unexpected server error.',                             'Retry with backoff. If persistent, check status page.'],
                  ].map(([status, code, cause, fix], i) => (
                    <tr key={i}>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', fontFamily: '"IBM Plex Mono", monospace', color: Number(status) >= 500 ? '#EF4444' : Number(status) >= 400 ? '#F59E0B' : '#16C784', fontWeight: 600, fontSize: 13 }}>{status}</td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D' }}><InlineCode>{code}</InlineCode></td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', color: '#94A3B8', lineHeight: 1.5 }}>{cause}</td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', color: '#94A3B8', lineHeight: 1.5 }}>{fix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* 10. cURL Examples */}
          <Section id="curl-examples" title="cURL Examples">
            <div style={{ fontWeight: 600, fontSize: 13, color: '#F1F5F9', marginBottom: 4 }}>Minimal request</div>
            <CodeBlock lang="bash" code={CURL_BASIC} />
            <div style={{ fontWeight: 600, fontSize: 13, color: '#F1F5F9', marginBottom: 4, marginTop: 24 }}>Full request with metadata</div>
            <CodeBlock lang="bash" code={CURL_FULL} />
          </Section>

          {/* 11. JavaScript Example */}
          <Section id="js-example" title="JavaScript Example">
            <P>
              Use this pattern from your backend (Node.js, Deno, Bun) or any server-side runtime that supports the Fetch API.
              Never call the risk check endpoint from client-side browser code — your API key would be exposed.
            </P>
            <CodeBlock lang="javascript" code={JS_EXAMPLE} />
          </Section>

          {/* 12. Node.js Example */}
          <Section id="node-example" title="Node.js Example">
            <P>
              Verify incoming webhook signatures using Node's built-in <InlineCode>crypto</InlineCode> module.
              Always validate the signature before processing the payload.
            </P>
            <CodeBlock lang="javascript" code={NODE_EXAMPLE} />
            <div style={{ marginTop: 20, background: '#0B1220', border: '1px solid #1E2D3D', borderRadius: 8, padding: '20px 24px' }}>
              <div style={{ fontFamily: '"Syne", sans-serif', fontWeight: 700, fontSize: 16, color: '#F1F5F9', marginBottom: 8 }}>Ready to integrate?</div>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                Get your API key from the dashboard and send your first risk check in minutes.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#16C784', color: '#050B14', borderRadius: 6, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  Get API Key
                  <ChevronRight size={14} />
                </Link>
                <Link to="/demo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'transparent', color: '#94A3B8', border: '1px solid #1E2D3D', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
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
