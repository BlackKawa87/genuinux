import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield,
  Activity,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Cpu,
  Fingerprint,
  FileSearch,
  Lock,
  Globe,
  ChevronRight,
  BarChart3,
  ShoppingCart,
  Gamepad2,
  Landmark,
  Coins,
  MonitorSmartphone,
  UserCheck,
  LogIn,
  CreditCard,
  ArrowLeftRight,
  MousePointerClick,
} from 'lucide-react'

// ── Palette ──────────────────────────────────────────────────
const C = {
  bg:       '#F8FAFC',
  surface:  '#FFFFFF',
  borderL:  '#F1F5F9',
  border:   '#E2E8F0',
  text:     '#0F172A',
  textSec:  '#64748B',
  textMut:  '#94A3B8',
  trust:    '#16C784',
  trustT:   '#0D9068',
  trustBg:  'rgba(22,199,132,0.08)',
  trustBd:  'rgba(22,199,132,0.2)',
  dark:     '#0F172A',
  dark2:    '#1E293B',
  darkBd:   '#334155',
  red:      '#EF4444',
  redBg:    'rgba(239,68,68,0.08)',
  redT:     '#DC2626',
  shadow:   '0 1px 3px rgba(15,23,42,0.04), 0 1px 8px rgba(15,23,42,0.04)',
  shadowMd: '0 4px 20px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.04)',
  shadowLg: '0 24px 64px rgba(15,23,42,0.09), 0 4px 20px rgba(15,23,42,0.05)',
}

// ── Hero sub-cards ────────────────────────────────────────────
function AllowCard() {
  return (
    <div className="rounded-2xl overflow-hidden flex-1"
      style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: C.shadowLg, maxWidth: '272px' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.borderL}` }}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textMut }}>Trust Analysis</p>
          <p className="text-[10px] mono mt-0.5" style={{ color: C.textMut }}>47ms</p>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
          style={{ background: C.trustBg, color: C.trustT }}>
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: C.trust, display: 'inline-block' }} />
          ALLOW
        </span>
      </div>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.borderL}` }}>
        <p className="text-xs" style={{ color: C.textSec }}>Checkout · US</p>
        <p className="text-sm font-semibold mono mt-0.5" style={{ color: C.text }}>usr_k9x2m</p>
      </div>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.borderL}` }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs" style={{ color: C.textSec }}>Trust Score</p>
          <p className="text-lg font-bold mono leading-none" style={{ color: C.text }}>
            94<span className="text-xs font-normal" style={{ color: C.textMut }}>/100</span>
          </p>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: C.borderL }}>
          <div className="h-full rounded-full" style={{ width: '94%', background: `linear-gradient(90deg, ${C.trust}, #0FE8B6)` }} />
        </div>
      </div>
      <div className="px-5 py-4 space-y-1.5">
        {['Verified device', 'Clean IP address', 'Normal velocity'].map(s => (
          <div key={s} className="flex items-center gap-2 text-xs" style={{ color: C.textSec }}>
            <CheckCircle size={11} style={{ color: C.trust, flexShrink: 0 }} />{s}
          </div>
        ))}
      </div>
    </div>
  )
}

function BlockCard() {
  return (
    <div className="rounded-2xl overflow-hidden flex-1"
      style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: C.shadowLg, maxWidth: '272px' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.borderL}` }}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textMut }}>Risk Detection</p>
          <p className="text-[10px] mono mt-0.5" style={{ color: C.textMut }}>31ms</p>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
          style={{ background: C.redBg, color: C.redT }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.red, display: 'inline-block' }} />
          BLOCK
        </span>
      </div>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.borderL}` }}>
        <p className="text-xs" style={{ color: C.textSec }}>Login attempt · RU</p>
        <p className="text-sm font-semibold mono mt-0.5" style={{ color: C.text }}>usr_8f3k2p</p>
      </div>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.borderL}` }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs" style={{ color: C.textSec }}>Trust Score</p>
          <p className="text-lg font-bold mono leading-none" style={{ color: C.text }}>
            12<span className="text-xs font-normal" style={{ color: C.textMut }}>/100</span>
          </p>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: C.borderL }}>
          <div className="h-full rounded-full" style={{ width: '12%', background: C.red }} />
        </div>
      </div>
      <div className="px-5 py-4 space-y-1.5">
        {['Suspicious IP origin', 'New device fingerprint', 'Velocity anomaly'].map(s => (
          <div key={s} className="flex items-center gap-2 text-xs" style={{ color: C.textSec }}>
            <AlertTriangle size={11} style={{ color: C.red, flexShrink: 0 }} />{s}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Data ──────────────────────────────────────────────────────

const MODULES = [
  {
    icon: Activity,
    name: 'RiskScore',
    tag: 'Core Engine',
    desc: 'Combines 300+ signals into a single trust score. Every request returns a clear allow, review, or block verdict in under 50ms.',
  },
  {
    icon: Fingerprint,
    name: 'DeviceID',
    tag: 'Device Intelligence',
    desc: 'Persistent device fingerprinting across browsers and sessions. Detects emulators, rooted devices, and automation tools.',
  },
  {
    icon: Cpu,
    name: 'BehaviorAI',
    tag: 'Behavioral ML',
    desc: 'Baseline each user\'s normal behavior patterns. Flags anomalies like velocity spikes, unusual hours, and session hijacking.',
  },
  {
    icon: FileSearch,
    name: 'DocVerify',
    tag: 'Identity',
    desc: 'Automated document capture and validation. Detects forgeries, expired IDs, and mismatches between document and selfie.',
  },
  {
    icon: Lock,
    name: 'SessionGuard',
    tag: 'Auth Security',
    desc: 'Continuous session monitoring for account takeover patterns. Re-authenticate silently when risk spikes during a session.',
  },
]

const STATS = [
  { value: '10M+',   label: 'Signals/month' },
  { value: '<50ms',  label: 'Median latency' },
  { value: '99.7%',  label: 'Detection accuracy' },
  { value: '300+',   label: 'Risk signals' },
  { value: '500+',   label: 'Active clients' },
  { value: '$2B+',   label: 'Fraud prevented' },
  { value: '85%',    label: 'Avg conversion kept' },
  { value: '99.9%',  label: 'Guaranteed uptime' },
]

const VERTICALS = [
  { icon: Landmark,       label: 'Fintech & Banking',           desc: 'AML, KYC, payment fraud, synthetic identity' },
  { icon: ShoppingCart,   label: 'Retail & E-commerce',         desc: 'Promo abuse, chargebacks, fake accounts' },
  { icon: Gamepad2,       label: 'iGaming & Betting',           desc: 'Age verification, multi-accounting, bonus fraud' },
  { icon: Coins,          label: 'Crypto & DeFi',               desc: 'Wallet fraud, rug-pull protection, bot trading' },
  { icon: Globe,          label: 'Marketplaces',                desc: 'Seller fraud, fake reviews, listing manipulation' },
  { icon: MonitorSmartphone, label: 'SaaS & Subscriptions',    desc: 'Trial abuse, credential stuffing, seat sharing' },
]

const JOURNEY = [
  { icon: UserCheck,      label: 'Signup & Onboarding',    desc: 'Stop fake account creation before it starts. Verify identity without adding friction to genuine users.' },
  { icon: LogIn,          label: 'Authentication',         desc: 'Detect account takeover attempts in real time. Step-up auth only when risk is actually elevated.' },
  { icon: CreditCard,     label: 'Payments & Checkout',    desc: 'Block stolen cards and payment fraud while keeping checkout conversion high for legitimate customers.' },
  { icon: ArrowLeftRight, label: 'Withdrawals & Transfers', desc: 'Flag unusual withdrawal patterns, velocity anomalies, and money mule networks automatically.' },
  { icon: MousePointerClick, label: 'Continuous Sessions', desc: 'Monitor the full session lifecycle. Re-evaluate risk as behavior changes — not just at login.' },
]

const CERTS = [
  { label: 'SOC 2 Type II', sub: 'Security & Availability' },
  { label: 'ISO 27001',     sub: 'Information Security' },
  { label: 'GDPR Ready',    sub: 'EU Data Protection' },
  { label: 'PCI DSS',       sub: 'Payment Card Industry' },
]

// ── Main ──────────────────────────────────────────────────────

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)
  const [hoveredModule, setHoveredModule] = useState<number | null>(null)
  const [hoveredVertical, setHoveredVertical] = useState<number | null>(null)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>

      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-shadow duration-200"
        style={{
          background: 'rgba(248,250,252,0.92)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${scrolled ? C.border : 'transparent'}`,
          boxShadow: scrolled ? '0 1px 20px rgba(15,23,42,0.06)' : 'none',
        }}>
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
              <Shield size={15} style={{ color: C.trust }} />
            </div>
            <span className="text-base font-bold" style={{ color: C.text }}>Genuinux</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {['Product', 'Developers', 'Pricing', 'Blog'].map(label => (
              <a key={label} href="#"
                className="text-sm transition-colors duration-150"
                style={{ color: C.textSec }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login"
              className="text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-150"
              style={{ color: C.textSec, border: `1px solid ${C.border}` }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
              Sign in
            </Link>
            <Link to="/register"
              className="text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all duration-150"
              style={{ background: C.dark, color: '#FFFFFF' }}
              onMouseEnter={e => (e.currentTarget.style.background = C.dark2)}
              onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>
              Get started <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 flex flex-col items-center text-center overflow-hidden"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(22,199,132,0.07) 0%, transparent 65%), ${C.bg}`,
        }}>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-7 anim-0"
          style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: C.trust, display: 'inline-block' }} />
          AI Trust Infrastructure
        </div>

        <h1 className="font-extrabold leading-none tracking-tight mb-6 anim-1"
          style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)', color: C.text }}>
          Block fraud.
          <br />
          <span style={{ color: C.trust }}>Not customers.</span>
        </h1>

        <p className="text-lg md:text-xl max-w-xl mx-auto leading-relaxed mb-10 anim-2"
          style={{ color: C.textSec }}>
          Real-time risk intelligence for every user, session, and event.
          Stop bad actors without adding friction for legitimate users.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mb-16 anim-3">
          <Link to="/register" className="btn-trust px-6 py-3 text-sm gap-2 rounded-lg">
            Start for free <ArrowRight size={15} />
          </Link>
          <a href="#"
            className="px-6 py-3 text-sm flex items-center gap-2 rounded-lg transition-colors duration-150"
            style={{ color: C.textSec, border: `1px solid ${C.border}` }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
            Schedule a demo <ChevronRight size={13} />
          </a>
        </div>

        <div className="flex gap-4 justify-center flex-wrap anim-4 w-full max-w-[580px] mx-auto">
          <AllowCard />
          <BlockCard />
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
          style={{ background: `linear-gradient(to bottom, transparent, ${C.bg})` }} />
      </section>

      {/* ── Certifications ──────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-center mb-8" style={{ color: C.textMut }}>
            Compliance & Certifications
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            {CERTS.map((c, i) => (
              <div key={i}
                className="flex items-center gap-3 px-5 py-3 rounded-xl"
                style={{ border: `1px solid ${C.border}`, background: C.bg }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <Shield size={14} style={{ color: C.trust }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: C.text }}>{c.label}</p>
                  <p className="text-xs" style={{ color: C.textMut }}>{c.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform Overview ────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* Left: mock dashboard */}
          <div className="flex-1 w-full"
            style={{
              background: C.dark,
              borderRadius: '16px',
              border: `1px solid ${C.darkBd}`,
              boxShadow: C.shadowLg,
              minHeight: '340px',
              padding: '24px',
              position: 'relative',
              overflow: 'hidden',
            }}>
            {/* Mock dashboard header */}
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full" style={{ background: '#EF4444' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#F59E0B' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#22C55E' }} />
              <div className="flex-1 mx-4 h-5 rounded" style={{ background: '#1E2D3D', maxWidth: '200px' }} />
            </div>
            {/* Mock metric cards */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Total Requests', val: '2.4M', color: C.trust },
                { label: 'Fraud Blocked', val: '18,293', color: '#EF4444' },
                { label: 'Avg Trust Score', val: '76.4', color: '#60A5FA' },
              ].map((m, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}>
                  <p className="text-[10px] mb-1" style={{ color: '#94A3B8' }}>{m.label}</p>
                  <p className="text-xl font-bold mono" style={{ color: m.color }}>{m.val}</p>
                </div>
              ))}
            </div>
            {/* Mock event rows */}
            <div className="space-y-2">
              {[
                { id: 'usr_k9x2m', ev: 'checkout', score: 94, dec: 'ALLOW', color: C.trust },
                { id: 'usr_8f3k2p', ev: 'login',    score: 12, dec: 'BLOCK', color: '#EF4444' },
                { id: 'usr_m3j7x',  ev: 'signup',   score: 61, dec: 'REVIEW', color: '#F59E0B' },
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}>
                  <p className="text-xs mono flex-1" style={{ color: '#94A3B8' }}>{r.id}</p>
                  <p className="text-xs" style={{ color: '#475569' }}>{r.ev}</p>
                  <p className="text-xs mono w-8 text-right" style={{ color: r.color }}>{r.score}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mono"
                    style={{ background: `${r.color}15`, color: r.color }}>{r.dec}</span>
                </div>
              ))}
            </div>
            {/* Scan animation overlay */}
            <div className="scan-anim" />
          </div>

          {/* Right: copy */}
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              One Platform
            </div>
            <h2 className="font-bold mb-5"
              style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', letterSpacing: '-0.03em', color: C.text }}>
              Full-stack fraud prevention,
              <span style={{ color: C.trust }}> one API call.</span>
            </h2>
            <p className="text-base leading-relaxed mb-8" style={{ color: C.textSec }}>
              Stop stitching together five different vendors. Genuinux delivers device intelligence,
              behavioral ML, identity verification, and session monitoring from a single endpoint.
              Your stack stays clean. Your fraud rate drops on day one.
            </p>
            <div className="space-y-3">
              {[
                'One integration, all risk signals unified',
                'Real-time decisions, never batch-processed',
                'Webhook alerts + dashboard for your team',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm" style={{ color: C.textSec }}>
                  <CheckCircle size={15} style={{ color: C.trust, flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-8 flex gap-3">
              <Link to="/register" className="btn-trust px-5 py-2.5 text-sm gap-2 rounded-lg">
                Start for free <ArrowRight size={14} />
              </Link>
              <a href="#"
                className="px-5 py-2.5 text-sm flex items-center gap-2 rounded-lg transition-colors duration-150"
                style={{ color: C.textSec, border: `1px solid ${C.border}` }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                View docs <ChevronRight size={13} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product Modules ──────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              API Modules
            </div>
            <h2 className="font-bold"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '-0.03em', color: C.text }}>
              Every signal you need,
              <span style={{ color: C.textSec }}> zero vendor sprawl.</span>
            </h2>
            <p className="text-base mt-4 max-w-xl mx-auto" style={{ color: C.textSec }}>
              Mix and match modules from the same SDK. Each adds a new layer of protection without a new integration.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-4">
            {MODULES.map((m, i) => (
              <div key={i}
                className="p-6 rounded-2xl cursor-default"
                style={{
                  background: hoveredModule === i ? C.bg : C.surface,
                  border: `1px solid ${hoveredModule === i ? C.trustBd : C.border}`,
                  boxShadow: hoveredModule === i ? C.shadowMd : C.shadow,
                  transition: 'all 0.18s ease',
                  transform: hoveredModule === i ? 'translateY(-3px)' : 'translateY(0)',
                }}
                onMouseEnter={() => setHoveredModule(i)}
                onMouseLeave={() => setHoveredModule(null)}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <m.icon size={17} style={{ color: C.trust }} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMut }}>
                  {m.tag}
                </p>
                <h3 className="text-base font-bold mb-2 mono" style={{ color: C.text }}>{m.name}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats Bar ────────────────────────────────────────── */}
      <section style={{ background: C.dark }}>
        <div className="max-w-6xl mx-auto px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-center mb-10" style={{ color: '#475569' }}>
            Genuinux by the numbers
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl font-bold mono mb-1.5" style={{ color: i % 3 === 0 ? C.trust : '#FFFFFF' }}>
                  {s.value}
                </p>
                <p className="text-sm" style={{ color: '#94A3B8' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solutions by Vertical ───────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="flex flex-col lg:flex-row gap-14 items-start">
          <div className="lg:w-80 flex-shrink-0">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              By Industry
            </div>
            <h2 className="font-bold mb-4"
              style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)', letterSpacing: '-0.03em', color: C.text }}>
              Built for your vertical.
            </h2>
            <p className="text-base leading-relaxed" style={{ color: C.textSec }}>
              Fraud patterns vary by industry. Genuinux ships pre-tuned rule sets and ML models
              for each vertical so you don't start from scratch.
            </p>
          </div>

          <div className="flex-1 grid md:grid-cols-2 gap-4">
            {VERTICALS.map((v, i) => (
              <div key={i}
                className="flex items-start gap-4 p-5 rounded-xl cursor-default"
                style={{
                  background: hoveredVertical === i ? C.trustBg : C.surface,
                  border: `1px solid ${hoveredVertical === i ? C.trustBd : C.border}`,
                  transition: 'all 0.18s ease',
                }}
                onMouseEnter={() => setHoveredVertical(i)}
                onMouseLeave={() => setHoveredVertical(null)}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <v.icon size={15} style={{ color: C.trust }} />
                </div>
                <div>
                  <p className="text-sm font-bold mb-1" style={{ color: C.text }}>{v.label}</p>
                  <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Journey Coverage ─────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              Full Journey Coverage
            </div>
            <h2 className="font-bold"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '-0.03em', color: C.text }}>
              Protect every touchpoint.
              <span style={{ color: C.trust }}> Not just login.</span>
            </h2>
            <p className="text-base mt-4 max-w-xl mx-auto" style={{ color: C.textSec }}>
              Fraud doesn't happen at one moment — it builds across a journey. Genuinux watches every step.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-6">
            {JOURNEY.map((j, i) => (
              <div key={i}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <j.icon size={16} style={{ color: C.trust }} />
                </div>
                <h3 className="text-sm font-bold mb-2" style={{ color: C.text }}>{j.label}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{j.desc}</p>
                {i < JOURNEY.length - 1 && (
                  <div className="hidden md:block absolute" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="font-bold"
            style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '-0.03em', color: C.text }}>
            Integrate in minutes.
            <span style={{ color: C.trust }}> Protect forever.</span>
          </h2>
          <p className="text-base mt-4 max-w-xl mx-auto" style={{ color: C.textSec }}>
            No infrastructure changes. No weeks of setup. One API call.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-10">
          {[
            { n: '01', title: 'Install the SDK', time: '5 minutes', desc: 'One package. Zero infrastructure changes. Works with any backend language.', code: 'npm install @genuinux/sdk' },
            { n: '02', title: 'Send your first event', time: '5 minutes', desc: "Call analyze() with a user ID, IP, and event type. That's it.", code: 'await genuinux.analyze({ user_id, event, ip })' },
            { n: '03', title: 'Start blocking fraud', time: 'Instant', desc: 'Act on the decision. Your platform is protected from the first request.', code: 'if (result.decision === "block") return 403' },
          ].map((s, i) => (
            <div key={i}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold mono mb-5"
                style={{ border: `2px solid ${C.border}`, color: C.textSec, background: C.bg }}>
                {s.n}
              </div>
              <h3 className="text-lg font-bold mb-1" style={{ color: C.text }}>{s.title}</h3>
              <p className="text-xs font-semibold mono mb-3" style={{ color: C.trust }}>{s.time}</p>
              <p className="text-sm leading-relaxed mb-4" style={{ color: C.textSec }}>{s.desc}</p>
              <div className="px-4 py-3 rounded-xl text-xs mono"
                style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textSec }}>
                {s.code}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Social Proof ─────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-center mb-10" style={{ color: C.textMut }}>
            What teams say
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "We cut chargebacks by 67% in the first month. The RiskScore module alone paid for itself in week one.",
                name: 'Sarah Chen', role: 'Head of Risk · NovaPay',
              },
              {
                quote: "Finally a fraud API that doesn't require a PhD to integrate. We were live in under a day.",
                name: 'Marcus Reyes', role: 'CTO · Stackr',
              },
              {
                quote: "The behavioral anomaly detection catches things our rules engine never would. It's like having an extra team.",
                name: 'Anya Patel', role: 'VP Engineering · BetFusion',
              },
            ].map((t, i) => (
              <div key={i} className="p-6 rounded-2xl"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <BarChart3 key={j} size={12} style={{ color: C.trust }} />
                  ))}
                </div>
                <p className="text-sm leading-relaxed mb-5" style={{ color: C.textSec }}>"{t.quote}"</p>
                <div>
                  <p className="text-sm font-bold" style={{ color: C.text }}>{t.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: C.textMut }}>{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dark CTA ─────────────────────────────────────────── */}
      <section style={{ background: C.dark }}>
        <div className="max-w-4xl mx-auto px-6 py-28 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-7"
            style={{ background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.2)', color: C.trust }}>
            Get started today
          </div>
          <h2 className="font-bold mb-5"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)', letterSpacing: '-0.04em', color: '#FFFFFF' }}>
            Ready to protect
            <br />
            <span style={{ color: C.trust }}>your platform?</span>
          </h2>
          <p className="text-lg mb-10 max-w-md mx-auto" style={{ color: '#94A3B8' }}>
            Join 500+ teams using Genuinux to protect millions of users in real time.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/register" className="btn-trust px-8 py-4 text-base gap-2 rounded-xl inline-flex">
              Start for free <ArrowRight size={18} />
            </Link>
            <a href="#"
              className="px-8 py-4 text-base flex items-center gap-2 rounded-xl transition-all duration-150"
              style={{ color: '#94A3B8', border: '1px solid #334155' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#475569' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#334155' }}>
              Schedule a demo <ChevronRight size={16} />
            </a>
          </div>
          <p className="text-xs mt-6" style={{ color: '#475569' }}>
            No credit card required · Free tier available · 5-minute setup
          </p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{ background: C.dark, borderTop: '1px solid #1E293B' }}>
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.2)' }}>
                  <Shield size={13} style={{ color: C.trust }} />
                </div>
                <span className="font-bold text-sm" style={{ color: '#FFFFFF' }}>Genuinux</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
                AI Trust Infrastructure. Block fraud without blocking customers.
              </p>
            </div>

            {[
              { title: 'Product', links: ['RiskScore', 'DeviceID', 'BehaviorAI', 'DocVerify', 'SessionGuard'] },
              { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press'] },
              { title: 'Developers', links: ['Documentation', 'API Reference', 'Status', 'Changelog'] },
            ].map((col, i) => (
              <div key={i}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: '#64748B' }}>
                  {col.title}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map(l => (
                    <li key={l}>
                      <a href="#" className="text-xs transition-colors duration-150"
                        style={{ color: '#475569' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8"
            style={{ borderTop: '1px solid #1E293B' }}>
            <p className="text-xs" style={{ color: '#475569' }}>© 2025 Genuinux. AI Trust Infrastructure.</p>
            <div className="flex items-center gap-6">
              {['Privacy', 'Terms', 'Security', 'Cookie Policy'].map(l => (
                <a key={l} href="#" className="text-xs transition-colors duration-150"
                  style={{ color: '#475569' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                  {l}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
