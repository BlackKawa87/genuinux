import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, Activity, ArrowRight, CheckCircle, AlertTriangle,
  Cpu, Fingerprint, FileSearch, Lock, Globe, ChevronRight,
  ShoppingCart, Gamepad2, Landmark, Coins, MonitorSmartphone,
  UserCheck, LogIn, CreditCard, ArrowLeftRight, MousePointerClick,
  Menu, X, BookOpen, Terminal, Users, Eye, MessageSquare,
  Sun, Moon,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

// ── Design tokens (always light on landing) ───────────────────────────────────

const C = {
  bg:      '#F1F4FA',
  surface: '#FFFFFF',
  borderL: '#EAECF4',
  border:  '#D8DCEC',
  text:    '#07090F',
  textSec: '#5B6480',
  textMut: '#9BA4BC',
  trust:   '#16C784',
  trustT:  '#0DAF70',
  trustBg: 'rgba(22,199,132,0.07)',
  trustBd: 'rgba(22,199,132,0.22)',
  dark:    '#07090F',
  dark2:   '#0B1016',
  darkBd:  '#1A2333',
  red:     '#EF4444',
  redBg:   'rgba(239,68,68,0.07)',
  shadow:  '0 1px 4px rgba(7,9,15,0.05), 0 1px 10px rgba(7,9,15,0.04)',
  shadowMd:'0 4px 24px rgba(7,9,15,0.08), 0 1px 4px rgba(7,9,15,0.04)',
  shadowLg:'0 24px 72px rgba(7,9,15,0.12), 0 4px 24px rgba(7,9,15,0.07)',
}

const H = { fontFamily: "'Syne', sans-serif" }

// ── Dashboard mockup (hero right panel) ───────────────────────────────────────

function MiniChart() {
  const pts = [3, 5, 4, 8, 6, 9, 7, 11, 8, 10, 13, 11, 9, 12, 10, 14, 11, 13, 16, 12, 17, 14, 16, 19]
  const max = Math.max(...pts)
  const W = 100, H = 26
  const coords = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - (v / max) * H] as [number, number])
  const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `M0,${H} ` + coords.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W},${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="mcg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16C784" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#16C784" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mcg)" />
      <path d={line} fill="none" stroke="#16C784" strokeWidth="1.2" />
    </svg>
  )
}

function DashboardMockup() {
  const rows = [
    { id: 'usr_k9x2m', ev: 'checkout', dec: 'ALLOW',  color: '#16C784', score: 94 },
    { id: 'usr_8f3k2p', ev: 'login',   dec: 'BLOCK',  color: '#EF4444', score: 12 },
    { id: 'usr_m3j7x',  ev: 'signup',  dec: 'REVIEW', color: '#F59E0B', score: 61 },
    { id: 'usr_p2q8r',  ev: 'payment', dec: 'ALLOW',  color: '#16C784', score: 88 },
  ]

  return (
    <div style={{
      background: '#07080C',
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.07)',
      boxShadow: '0 0 0 1px rgba(22,199,132,0.04), 0 40px 96px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.3)',
      overflow: 'hidden',
      position: 'relative',
      maxWidth: 520,
    }}>
      {/* Browser chrome */}
      <div style={{
        background: '#0B1016',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map(col => (
            <div key={col} style={{ width: 9, height: 9, borderRadius: '50%', background: col, opacity: 0.9 }} />
          ))}
        </div>
        <div style={{
          flex: 1,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 5,
          height: 19,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 5,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16C784', opacity: 0.7 }} />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', fontFamily: "'IBM Plex Mono', monospace" }}>
            app.genuinux.com/dashboard
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#ECF0FA', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
            Risk Intelligence
          </span>
          <span style={{ fontSize: 9, color: '#16C784', fontFamily: "'IBM Plex Mono', monospace", display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16C784', display: 'inline-block' }} />
            Live
          </span>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
          {[
            { label: 'Total Checks',  val: '2.4M',   color: '#ECF0FA' },
            { label: 'Blocked',       val: '18,293',  color: '#EF4444' },
            { label: 'Avg Trust',     val: '94.2',    color: '#16C784' },
          ].map(m => (
            <div key={m.label} style={{
              background: '#0B1016',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 8,
              padding: '8px 10px',
            }}>
              <p style={{ fontSize: 8, color: '#8B9BB8', marginBottom: 3, fontFamily: "'DM Sans', sans-serif" }}>{m.label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: m.color, lineHeight: 1 }}>{m.val}</p>
            </div>
          ))}
        </div>

        {/* Mini chart */}
        <div style={{
          background: '#0B1016',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 8,
          padding: '8px 10px',
          marginBottom: 8,
        }}>
          <p style={{ fontSize: 8, color: '#8B9BB8', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>
            Events over time · last 24h
          </p>
          <MiniChart />
        </div>

        {/* Live feed */}
        <div style={{
          background: '#0B1016',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '7px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16C784', display: 'inline-block' }} />
            <p style={{ fontSize: 8, color: '#8B9BB8', fontFamily: "'DM Sans', sans-serif" }}>Live Risk Feed</p>
          </div>
          {rows.map((r, i) => (
            <div key={r.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: '#8B9BB8', flex: 1 }}>{r.id}</span>
              <span style={{ fontSize: 8, color: '#475569', fontFamily: "'DM Sans', sans-serif" }}>{r.ev}</span>
              <span style={{
                fontSize: 8,
                fontWeight: 700,
                fontFamily: "'IBM Plex Mono', monospace",
                color: r.color,
                background: `${r.color}1A`,
                padding: '1px 5px',
                borderRadius: 3,
              }}>{r.dec}</span>
              <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: r.color, width: 20, textAlign: 'right' }}>{r.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scan line */}
      <div className="scan-anim" />
    </div>
  )
}

// ── Data ──────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'Product',    id: 'product'    },
  { label: 'Developers', id: 'developers' },
  { label: 'Pricing',    id: 'pricing'    },
  { label: 'Blog',       id: 'blog'       },
]

const MODULES = [
  { icon: Activity,    name: 'RiskScore',    tag: 'Core Engine',   desc: 'Combines 300+ signals into a single trust score. Every request returns a clear allow, review, or block verdict in under 50ms.' },
  { icon: Fingerprint, name: 'DeviceID',     tag: 'Device Intel',  desc: 'Persistent device fingerprinting across browsers and sessions. Detects emulators, rooted devices, and automation tools.' },
  { icon: Cpu,         name: 'BehaviorAI',   tag: 'Behavioral ML', desc: "Baseline each user's normal behavior patterns. Flags anomalies like velocity spikes, unusual hours, and session hijacking." },
  { icon: FileSearch,  name: 'DocVerify',    tag: 'Identity',      desc: 'Automated document capture and validation. Detects forgeries, expired IDs, and mismatches between document and selfie.' },
  { icon: Lock,        name: 'SessionGuard', tag: 'Auth Security', desc: 'Continuous session monitoring for account takeover patterns. Re-authenticate silently when risk spikes during a session.' },
]

const PROBLEM_SIGNALS = [
  { icon: AlertTriangle, title: 'Bot-driven signups',       desc: 'Automated account creation that passes CAPTCHA and bypasses rate limits — invisible to rules without behavioral context.' },
  { icon: Activity,      title: 'Velocity attacks',          desc: 'The same identity hits your platform across sessions, IPs, and devices — too fast for humans, invisible to static thresholds.' },
  { icon: Fingerprint,   title: 'Device recycling',          desc: 'Spoofed or shared device fingerprints let bad actors appear as new users every time, defeating session-based protection.' },
  { icon: Users,         title: 'Synthetic identity rings',  desc: 'Coordinated fraud networks create thousands of real-looking accounts. No single account looks fraudulent in isolation.' },
]

const SCALE_CLAIMS = [
  { value: '< 50ms', label: 'Median latency'     },
  { value: '300+',   label: 'Signals per event'  },
  { value: '7',      label: 'Event types'         },
  { value: '1 call', label: 'Full-stack protect.' },
]

const VERTICALS = [
  { icon: Landmark,         label: 'Fintech & Banking',     desc: 'AML, KYC, payment fraud, synthetic identity' },
  { icon: ShoppingCart,     label: 'Retail & E-commerce',   desc: 'Promo abuse, chargebacks, fake accounts' },
  { icon: Gamepad2,         label: 'iGaming & Betting',     desc: 'Age verification, multi-accounting, bonus fraud' },
  { icon: Coins,            label: 'Crypto & DeFi',         desc: 'Wallet fraud, rug-pull protection, bot trading' },
  { icon: Globe,            label: 'Marketplaces',          desc: 'Seller fraud, fake reviews, listing manipulation' },
  { icon: MonitorSmartphone,label: 'SaaS & Subscriptions',  desc: 'Trial abuse, credential stuffing, seat sharing' },
]

const JOURNEY = [
  { icon: UserCheck,         label: 'Signup & Onboarding',    desc: 'Stop fake account creation before it starts.' },
  { icon: LogIn,             label: 'Authentication',          desc: 'Detect account takeover attempts in real time.' },
  { icon: CreditCard,        label: 'Payments & Checkout',     desc: 'Block stolen cards while keeping conversion high.' },
  { icon: ArrowLeftRight,    label: 'Withdrawals & Transfers', desc: 'Flag unusual withdrawal patterns automatically.' },
  { icon: MousePointerClick, label: 'Continuous Sessions',     desc: 'Re-evaluate risk as behavior changes mid-session.' },
]

const TEAMS = [
  {
    icon: UserCheck,
    role: 'Risk & Compliance',
    tagline: 'Full visibility into every decision.',
    features: ['Real-time event dashboard', 'Manual review queue with audit logs', 'Custom rule builder with live preview', 'Signal explanations for every verdict'],
  },
  {
    icon: Activity,
    role: 'Product & Growth',
    tagline: 'Stop fraud without stopping growth.',
    features: ['Risk-aware onboarding flows', 'Conversion-safe: flag real risk only', 'Explainable decisions for support teams', 'Confidence scores, not just block/allow'],
  },
  {
    icon: Terminal,
    role: 'Engineering',
    tagline: 'One integration. Everything included.',
    features: ['Single API endpoint, any language', 'Webhook signing with HMAC-SHA256', 'API key management + usage tracking', 'Explainable signals for every decision'],
  },
]

const PRICING_PLANS: {
  id: string; name: string
  price: string | null; sub: string | null; subtitle: string
  badge: string | null; featured: boolean; trialNote: string | null
  cta: string; ctaTo: string; external: boolean
  features: string[]
}[] = [
  {
    id: 'starter', name: 'Starter',
    price: '£99', sub: '/mo',
    subtitle: 'For startups shipping their first fraud defense layer.',
    badge: null, featured: false, trialNote: '7-day trial included',
    cta: 'Start 7-Day Trial', ctaTo: '/register', external: false,
    features: ['50,000 events/month', 'RiskScore API', 'Webhooks', '30-day event history', 'Basic rules engine', 'Dashboard analytics', 'Shadow mode', 'Email support'],
  },
  {
    id: 'growth', name: 'Growth',
    price: '£499', sub: '/mo',
    subtitle: 'For platforms scaling with real fraud exposure.',
    badge: 'Most Popular', featured: true, trialNote: '7-day trial included',
    cta: 'Start 7-Day Trial', ctaTo: '/register', external: false,
    features: ['500,000 events/month', 'All core modules', 'Device Intelligence', 'BehaviorAI', 'SessionGuard', 'Real-time risk alerts', 'Advanced rules engine', 'Behavioral anomaly detection', 'Session monitoring', 'Velocity analysis', 'Fraud orchestration workflows', 'Team access', '90-day history', 'Priority support'],
  },
  {
    id: 'enterprise', name: 'Enterprise',
    price: null, sub: null,
    subtitle: 'Advanced trust infrastructure for high-volume operations.',
    badge: null, featured: false, trialNote: null,
    cta: 'Contact Sales', ctaTo: 'mailto:sales@genuinux.io', external: true,
    features: ['Unlimited events', 'Dedicated onboarding engineer', 'Private Slack support', 'Custom ML tuning', 'Compliance assistance', 'Multi-region deployment', 'Dedicated account manager', 'SSO & audit logs'],
  },
]

const BLOG_POSTS = [
  { slug: 'detect-account-takeover', category: 'Fraud Detection', date: 'May 12, 2026', readTime: '5 min',
    title: 'How to detect account takeover before it happens',
    desc:  'An overview of behavioral signals that predict ATO attempts — and how to act on them in real time.' },
  { slug: 'cost-of-false-positives', category: 'Risk Strategy',   date: 'Apr 28, 2026', readTime: '4 min',
    title: 'The true cost of false positives in fraud prevention',
    desc:  'Every blocked legitimate user has a cost. We break down how to measure it and optimize your thresholds.' },
  { slug: 'first-custom-fraud-rule', category: 'Developer Guide', date: 'Apr 15, 2026', readTime: '6 min',
    title: 'Building your first custom fraud rule with Genuinux',
    desc:  'A step-by-step guide to writing, testing, and deploying custom rules without touching your production code.' },
]

const TRUST_CARDS = [
  { icon: MessageSquare, title: 'Explainable decisions',   desc: 'Every verdict comes with signals, risk reasons, and a plain-English recommendation. No black boxes.' },
  { icon: FileSearch,    title: 'Audit-ready logs',        desc: 'Rule changes, API key creation, and review actions are written to an immutable audit log.' },
  { icon: Lock,          title: 'Secure API keys',         desc: 'Keys are SHA-256 hashed on creation. The raw value is shown exactly once and never stored.' },
  { icon: Users,         title: 'Role-based access',       desc: 'Owner, admin, and member roles control who can manage keys, webhooks, rules, and settings.' },
  { icon: Shield,        title: 'Privacy-first design',    desc: 'You control what data you send. No PII is required. All signals derived from what you provide.' },
  { icon: Eye,           title: 'Safe rollout with Shadow', desc: 'Run the full engine in observation mode before going live. Validate on real traffic risk-free.' },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function Landing() {
  const [scrolled,        setScrolled]        = useState(false)
  const [hoveredModule,   setHoveredModule]   = useState<number | null>(null)
  const [hoveredVertical, setHoveredVertical] = useState<number | null>(null)
  const [mobileMenuOpen,  setMobileMenuOpen]  = useState(false)
  const { theme, toggle } = useTheme()

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>

      {/* ── Navbar ───────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-200"
        style={{
          background: scrolled || mobileMenuOpen ? 'rgba(241,244,250,0.95)' : 'rgba(241,244,250,0.6)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${scrolled || mobileMenuOpen ? C.border : 'transparent'}`,
          boxShadow: scrolled ? '0 1px 24px rgba(7,9,15,0.06)' : 'none',
        }}>
        <div className="flex items-center justify-between px-6 py-3 max-w-7xl mx-auto">
          <Link to="/">
            <img src="/logo-horizontal.png" alt="Genuinux" style={{ height: 96, display: 'block' }} />
          </Link>

          <div className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map(({ label, id }) => (
              <a key={label} href={`#${id}`}
                className="text-sm font-medium transition-colors duration-150"
                style={{ color: C.textSec }}
                onClick={e => { e.preventDefault(); scrollTo(id) }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                {label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2.5">
            <button onClick={toggle}
              className="p-2 rounded-lg transition-colors duration-150 flex items-center justify-center"
              style={{ color: C.textSec, border: `1px solid ${C.border}` }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <Link to="/login"
              className="text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-150"
              style={{ color: C.textSec, border: `1px solid ${C.border}` }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
              Sign in
            </Link>
            <Link to="/register"
              className="text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all duration-150"
              style={{ background: C.dark, color: '#FFFFFF' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0B1016')}
              onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>
              Get started <ArrowRight size={13} />
            </Link>
          </div>

          <button
            className="md:hidden p-2 rounded-lg"
            style={{ color: C.textSec, border: `1px solid ${C.border}` }}
            onClick={() => setMobileMenuOpen(o => !o)}>
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden px-6 pb-5" style={{ borderTop: `1px solid ${C.border}` }}>
            <div className="py-4 space-y-0.5">
              {NAV_LINKS.map(({ label, id }) => (
                <a key={label} href={`#${id}`}
                  className="block px-3 py-2.5 rounded-lg text-sm"
                  style={{ color: C.textSec }}
                  onClick={e => { e.preventDefault(); scrollTo(id) }}>
                  {label}
                </a>
              ))}
            </div>
            <div className="flex gap-2 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)}
                className="flex-1 text-sm py-2.5 rounded-lg text-center"
                style={{ border: `1px solid ${C.border}`, color: C.textSec }}>
                Sign in
              </Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)}
                className="flex-1 text-sm py-2.5 rounded-lg text-center font-semibold"
                style={{ background: C.dark, color: '#FFFFFF' }}>
                Get started
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{
        background: C.bg,
        paddingTop: 128,
        paddingBottom: 80,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
      }}>
        {/* Dot grid background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, rgba(22,199,132,0.08) 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
        }} />
        {/* Radial fade */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 70% 60% at 50% 0%, rgba(22,199,132,0.05) 0%, transparent 60%)`,
          pointerEvents: 'none',
        }} />

        <div className="relative max-w-7xl mx-auto px-6 w-full grid lg:grid-cols-2 gap-14 items-center">

          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-7 anim-0"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
              AI Trust Infrastructure · Controlled Beta
            </div>

            <h1 className="font-black leading-none mb-6 anim-1"
              style={{
                fontSize: 'clamp(2.8rem, 5.5vw, 4.75rem)',
                letterSpacing: '-0.04em',
                color: C.text,
                ...H,
              }}>
              Block fraud,
              <br />
              <span style={{ color: C.trust }}>not customers.</span>
            </h1>

            <p className="text-lg leading-relaxed mb-8 anim-2"
              style={{ color: C.textSec, maxWidth: 460, lineHeight: 1.65 }}>
              Real-time risk intelligence for every user, session, and event.
              One API call. Full-stack fraud protection.
            </p>

            {/* Stats bar */}
            <div className="flex items-center gap-6 mb-9 anim-3">
              {SCALE_CLAIMS.map((s, i) => (
                <div key={i} className={i > 0 ? 'pl-6' : ''}
                  style={i > 0 ? { borderLeft: `1px solid ${C.border}` } : {}}>
                  <p style={{ fontSize: 18, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: C.text, lineHeight: 1 }}>
                    {s.value}
                  </p>
                  <p style={{ fontSize: 10, color: C.textMut, marginTop: 3 }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 anim-4">
              <Link to="/register" className="btn-trust px-6 py-3 text-sm gap-2">
                Start 7-Day Trial <ArrowRight size={15} />
              </Link>
              <Link to="/demo"
                className="flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-150"
                style={{ color: C.textSec, border: `1px solid ${C.border}` }}
                onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.textMut }}
                onMouseLeave={e => { e.currentTarget.style.color = C.textSec; e.currentTarget.style.borderColor = C.border }}>
                Schedule a demo <ChevronRight size={13} />
              </Link>
            </div>

            <p className="text-xs mt-5 anim-5" style={{ color: C.textMut }}>
              No credit card required · 5-minute setup · Cancel anytime
            </p>
          </div>

          {/* Right — dashboard mockup */}
          <div className="hidden lg:block anim-5">
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* ── Built for trust ──────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              <Shield size={12} />
              Built for trust
            </div>
            <h2 className="font-black mb-3"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
              Security and transparency,
              <span style={{ color: C.trust }}> by design.</span>
            </h2>
            <p className="text-base max-w-lg mx-auto" style={{ color: C.textSec }}>
              Built for teams that need to move fast without cutting corners on auditability, explainability, or data control.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {TRUST_CARDS.map((card, i) => (
              <div key={i} className="p-6 rounded-2xl"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <card.icon size={14} style={{ color: C.trust }} />
                </div>
                <h3 className="text-sm font-semibold mb-2" style={{ color: C.text }}>{card.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem ──────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="font-black mb-4"
            style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
            Fraud no longer
            <br />
            <span style={{ color: C.trust }}>looks obvious.</span>
          </h2>
          <p className="text-base max-w-lg mx-auto leading-relaxed" style={{ color: C.textSec }}>
            Modern fraud hides in patterns — not individual bad transactions.
            By the time a static rule catches it, the damage is already done.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PROBLEM_SIGNALS.map((p, i) => (
            <div key={i} className="p-6 rounded-2xl"
              style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: C.redBg, border: '1px solid rgba(239,68,68,0.15)' }}>
                <p.icon size={16} style={{ color: C.red }} />
              </div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: C.text }}>{p.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Platform Overview ─────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="flex flex-col lg:flex-row items-center gap-14">
            <div className="flex-1 w-full" style={{
              background: C.dark, borderRadius: 16, border: `1px solid ${C.darkBd}`,
              boxShadow: C.shadowLg, minHeight: 340, padding: 24,
              position: 'relative', overflow: 'hidden',
            }}>
              <div className="flex items-center gap-2 mb-5">
                {['#EF4444', '#F59E0B', '#22C55E'].map(col => (
                  <div key={col} className="w-3 h-3 rounded-full" style={{ background: col }} />
                ))}
                <div className="flex-1 mx-4 h-5 rounded" style={{ background: '#1A2333', maxWidth: 200 }} />
              </div>
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Total Requests', val: '2.4M',   color: C.trust   },
                  { label: 'Fraud Blocked',  val: '18,293', color: '#EF4444' },
                  { label: 'Avg Trust',      val: '76.4',   color: '#60A5FA' },
                ].map((m, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: '#0B1016', border: '1px solid #182030' }}>
                    <p className="text-[10px] mb-1" style={{ color: '#8B9BB8' }}>{m.label}</p>
                    <p className="text-xl font-bold mono" style={{ color: m.color }}>{m.val}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { id: 'usr_k9x2m', ev: 'checkout', score: 94, dec: 'ALLOW',  color: C.trust   },
                  { id: 'usr_8f3k2p', ev: 'login',   score: 12, dec: 'BLOCK',  color: '#EF4444' },
                  { id: 'usr_m3j7x',  ev: 'signup',  score: 61, dec: 'REVIEW', color: '#F59E0B' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: '#0B1016', border: '1px solid #182030' }}>
                    <p className="text-xs mono flex-1" style={{ color: '#8B9BB8' }}>{r.id}</p>
                    <p className="text-xs" style={{ color: '#475569' }}>{r.ev}</p>
                    <p className="text-xs mono w-8 text-right" style={{ color: r.color }}>{r.score}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded mono"
                      style={{ background: `${r.color}18`, color: r.color }}>{r.dec}</span>
                  </div>
                ))}
              </div>
              <div className="scan-anim" />
            </div>

            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5"
                style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
                One Platform
              </div>
              <h2 className="font-black mb-5"
                style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
                Full-stack fraud prevention,
                <span style={{ color: C.trust }}> one API call.</span>
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: C.textSec }}>
                Stop stitching together five different vendors. Genuinux delivers device intelligence,
                behavioral ML, identity verification, and session monitoring from a single endpoint.
              </p>
              <div className="space-y-3 mb-8">
                {['One integration, all risk signals unified', 'Real-time decisions, never batch-processed', 'Webhook alerts + dashboard for your team'].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm" style={{ color: C.textSec }}>
                    <CheckCircle size={14} style={{ color: C.trust, flexShrink: 0 }} />
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Link to="/register" className="btn-trust px-5 py-2.5 text-sm gap-2">
                  Start 7-Day Trial <ArrowRight size={14} />
                </Link>
                <Link to="/docs"
                  className="px-5 py-2.5 text-sm flex items-center gap-2 rounded-lg transition-colors duration-150"
                  style={{ color: C.textSec, border: `1px solid ${C.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                  View docs <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product Modules ──────────────────── id="product" ─────── */}
      <section id="product">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              API Modules
            </div>
            <h2 className="font-black"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
              Every signal you need,
              <span style={{ color: C.textSec }}> zero vendor sprawl.</span>
            </h2>
            <p className="text-base mt-4 max-w-lg mx-auto" style={{ color: C.textSec }}>
              Mix and match modules from the same SDK. Each adds a new layer of protection without a new integration.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-4">
            {MODULES.map((m, i) => (
              <div key={i} className="p-6 rounded-2xl cursor-default"
                style={{
                  background: hoveredModule === i ? C.bg : C.surface,
                  border: `1px solid ${hoveredModule === i ? C.trustBd : C.border}`,
                  boxShadow: hoveredModule === i ? C.shadowMd : C.shadow,
                  transition: 'all 0.18s ease',
                  transform: hoveredModule === i ? 'translateY(-4px)' : 'translateY(0)',
                }}
                onMouseEnter={() => setHoveredModule(i)}
                onMouseLeave={() => setHoveredModule(null)}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <m.icon size={16} style={{ color: C.trust }} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMut }}>{m.tag}</p>
                <h3 className="text-base font-semibold mb-2 mono" style={{ color: C.text }}>{m.name}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built for scale strip ─────────────────────────────────── */}
      <section style={{ background: C.dark }}>
        <div className="max-w-6xl mx-auto px-6 py-16">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-center mb-10" style={{ color: '#2E3F54', letterSpacing: '0.15em' }}>
            Built for scale
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {SCALE_CLAIMS.map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl font-black mono mb-1.5"
                  style={{ color: i === 0 ? C.trust : '#ECF0FA', ...H }}>
                  {s.value}
                </p>
                <p className="text-xs" style={{ color: '#8B9BB8' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solutions by Vertical ─────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="flex flex-col lg:flex-row gap-14 items-start">
          <div className="lg:w-80 flex-shrink-0">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              By Industry
            </div>
            <h2 className="font-black mb-4"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
              Built for your vertical.
            </h2>
            <p className="text-base leading-relaxed" style={{ color: C.textSec }}>
              Fraud patterns vary by industry. Genuinux ships pre-tuned signal weights and detection logic for each vertical.
            </p>
          </div>
          <div className="flex-1 grid md:grid-cols-2 gap-3">
            {VERTICALS.map((v, i) => (
              <div key={i} className="flex items-start gap-4 p-5 rounded-xl cursor-default"
                style={{
                  background: hoveredVertical === i ? C.trustBg : C.surface,
                  border: `1px solid ${hoveredVertical === i ? C.trustBd : C.border}`,
                  transition: 'all 0.18s ease',
                }}
                onMouseEnter={() => setHoveredVertical(i)}
                onMouseLeave={() => setHoveredVertical(null)}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <v.icon size={14} style={{ color: C.trust }} />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: C.text }}>{v.label}</p>
                  <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Journey Coverage ──────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              Full Journey Coverage
            </div>
            <h2 className="font-black"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
              Protect every touchpoint.
              <span style={{ color: C.trust }}> Not just login.</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-5 gap-8">
            {JOURNEY.map((j, i) => (
              <div key={i}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <j.icon size={15} style={{ color: C.trust }} />
                </div>
                <h3 className="text-sm font-semibold mb-2" style={{ color: C.text }}>{j.label}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{j.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Developers ──────────────────────── id="developers" ───── */}
      <section id="developers" className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
            <Terminal size={12} />
            For Developers
          </div>
          <h2 className="font-black"
            style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
            Integrate in minutes.
            <span style={{ color: C.trust }}> Protect forever.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-10">
          {[
            { n: '01', title: 'Install the SDK',       time: '2 minutes', desc: 'One package. Zero infrastructure changes.',           code: 'npm install @genuinux/sdk'                      },
            { n: '02', title: 'Send your first event', time: '5 minutes', desc: "Call analyze() with a user ID, IP, and event type.",  code: 'await genuinux.analyze({ user_id, event, ip })' },
            { n: '03', title: 'Start blocking fraud',  time: 'Instant',   desc: 'Act on the decision in your own handler.',            code: "if (result.decision === 'block') return 403"    },
          ].map((s, i) => (
            <div key={i}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold mono mb-5"
                style={{ border: `2px solid ${C.border}`, color: C.textSec, background: C.bg }}>
                {s.n}
              </div>
              <h3 className="text-base font-semibold mb-1" style={{ color: C.text }}>{s.title}</h3>
              <p className="text-xs font-semibold mono mb-3" style={{ color: C.trust }}>{s.time}</p>
              <p className="text-sm leading-relaxed mb-4" style={{ color: C.textSec }}>{s.desc}</p>
              <div className="px-4 py-3.5 rounded-xl text-xs mono"
                style={{ background: C.dark, color: C.trust, border: `1px solid ${C.darkBd}` }}>
                {s.code}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link to="/docs"
            className="inline-flex items-center gap-2 text-sm font-medium transition-opacity duration-150"
            style={{ color: C.trust }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            View full API documentation <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── Teams ─────────────────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <h2 className="font-black"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
              Built for the teams
              <span style={{ color: C.trust }}> who own trust.</span>
            </h2>
            <p className="text-base mt-4 max-w-lg mx-auto" style={{ color: C.textSec }}>
              Whether you're stopping fraud, analyzing risk, or writing the integration — Genuinux fits your workflow.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {TEAMS.map((t, i) => (
              <div key={i} className="p-7 rounded-2xl"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <t.icon size={16} style={{ color: C.trust }} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMut }}>For</p>
                <h3 className="text-base font-semibold mb-1.5" style={{ color: C.text }}>{t.role}</h3>
                <p className="text-sm mb-5" style={{ color: C.textSec }}>{t.tagline}</p>
                <ul className="space-y-2">
                  {t.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2.5 text-xs" style={{ color: C.textSec }}>
                      <CheckCircle size={11} style={{ color: C.trust, flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────── id="pricing" ─────── */}
      <section id="pricing" style={{ background: C.bg }}>
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              Pricing
            </div>
            <h2 className="font-black"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
              Simple, transparent pricing.
            </h2>
            <p className="text-base mt-4 max-w-md mx-auto" style={{ color: C.textSec }}>
              Three tiers. No contracts, no hidden fees. Cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:items-stretch">
            {PRICING_PLANS.map(plan => {
              const fg = plan.featured
              return (
                <div key={plan.id}
                  className="flex flex-col rounded-2xl"
                  style={fg ? {
                    background: C.dark,
                    border: '1px solid rgba(22,199,132,0.25)',
                    boxShadow: '0 0 0 1px rgba(22,199,132,0.07), 0 32px 64px rgba(22,199,132,0.12), 0 8px 24px rgba(7,9,15,0.35)',
                    padding: '36px 32px',
                  } : {
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    boxShadow: C.shadow,
                    padding: '32px 28px',
                  }}>

                  <div style={{ minHeight: 28, marginBottom: 20 }}>
                    {plan.badge && (
                      <div className="inline-flex text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                        style={{ background: C.trustBg, color: C.trust, border: `1px solid ${C.trustBd}` }}>
                        {plan.badge}
                      </div>
                    )}
                  </div>

                  <h3 className="font-bold mb-2"
                    style={{ fontSize: '1.1rem', letterSpacing: '-0.03em', color: fg ? '#FFFFFF' : C.text, ...H }}>
                    {plan.name}
                  </h3>
                  <p className="text-sm leading-relaxed mb-5" style={{ color: fg ? '#5B6480' : C.textSec }}>
                    {plan.subtitle}
                  </p>

                  <div style={{ minHeight: 20, marginBottom: 8 }}>
                    {plan.trialNote && (
                      <p className="text-xs font-semibold" style={{ color: C.trust }}>{plan.trialNote}</p>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1.5 mb-6" style={{ minHeight: 44 }}>
                    {plan.price
                      ? <>
                          <span className="font-black mono"
                            style={{ fontSize: fg ? '2.4rem' : '2rem', lineHeight: 1, color: fg ? '#FFFFFF' : C.text }}>
                            {plan.price}
                          </span>
                          <span className="text-sm font-medium" style={{ color: fg ? '#475569' : C.textMut }}>
                            {plan.sub}
                          </span>
                        </>
                      : <span className="text-lg font-semibold" style={{ color: fg ? '#8B9BB8' : C.text, paddingTop: 4 }}>
                          Custom pricing
                        </span>
                    }
                  </div>

                  <div className="mb-6" style={{ height: 1, background: fg ? '#1A2333' : C.borderL }} />

                  <ul className="space-y-2.5 flex-1 mb-8">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm"
                        style={{ color: fg ? '#8B9BB8' : C.textSec }}>
                        <CheckCircle size={12} style={{ color: C.trust, flexShrink: 0, marginTop: 2 }} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {plan.external
                    ? <a href={plan.ctaTo}
                        className="text-sm font-semibold py-3 rounded-xl text-center block transition-all duration-150"
                        style={{ background: C.dark2, color: '#FFFFFF', border: `1px solid ${C.darkBd}` }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.trust; e.currentTarget.style.color = C.trust }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.darkBd; e.currentTarget.style.color = '#FFFFFF' }}>
                        {plan.cta}
                      </a>
                    : <Link to={plan.ctaTo}
                        className="text-sm font-semibold py-3 rounded-xl text-center block transition-all duration-150"
                        style={fg
                          ? { background: C.trust, color: '#07090F' }
                          : { border: `1px solid ${C.border}`, color: C.text, background: 'transparent' }}
                        onMouseEnter={e => {
                          if (fg) { e.currentTarget.style.background = C.trustT; return }
                          e.currentTarget.style.borderColor = C.trust
                          e.currentTarget.style.color = C.trust
                        }}
                        onMouseLeave={e => {
                          if (fg) { e.currentTarget.style.background = C.trust; return }
                          e.currentTarget.style.borderColor = C.border
                          e.currentTarget.style.color = C.text
                        }}>
                        {plan.cta}
                      </Link>
                  }

                  {!plan.external && (
                    <p className="text-center text-xs mt-3" style={{ color: fg ? '#2E3F54' : C.textMut }}>
                      No credit card required
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-center text-sm mt-12" style={{ color: C.textMut }}>
            Need more volume?{' '}
            <a href="mailto:sales@genuinux.io"
              className="font-semibold transition-opacity duration-150"
              style={{ color: C.trust }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Talk to us →
            </a>
          </p>
        </div>
      </section>

      {/* ── Blog ─────────────────────────────── id="blog" ────────── */}
      <section id="blog" style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              <BookOpen size={12} />
              Blog
            </div>
            <h2 className="font-black"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', letterSpacing: '-0.04em', color: C.text, ...H }}>
              From the Genuinux team.
            </h2>
            <p className="text-base mt-2" style={{ color: C.textSec }}>
              Insights on fraud prevention, risk engineering, and building trustworthy platforms.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {BLOG_POSTS.map((post, i) => (
              <Link key={i} to={`/blog/${post.slug}`}
                className="p-6 rounded-2xl flex flex-col transition-all duration-150"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.trust)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={{ background: C.trustBg, color: C.trustT, border: `1px solid ${C.trustBd}` }}>
                    {post.category}
                  </span>
                  <span className="text-[10px]" style={{ color: C.textMut }}>{post.date} · {post.readTime}</span>
                </div>
                <h3 className="text-sm font-semibold mb-3 leading-snug flex-1" style={{ color: C.text }}>
                  {post.title}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{post.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dark CTA ──────────────────────────────────────────────── */}
      <section style={{ background: C.dark }}>
        <div className="max-w-4xl mx-auto px-6 py-28 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-7"
            style={{ background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.22)', color: C.trust }}>
            Get started today
          </div>
          <h2 className="font-black mb-5"
            style={{ fontSize: 'clamp(2.4rem, 5vw, 3.8rem)', letterSpacing: '-0.05em', color: '#FFFFFF', ...H }}>
            Ready to trust
            <br />
            <span style={{ color: C.trust }}>every interaction?</span>
          </h2>
          <p className="text-lg mb-10 max-w-md mx-auto" style={{ color: '#8B9BB8' }}>
            Start protecting your platform today. No contracts, no setup fees.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/register" className="btn-trust px-8 py-4 text-base gap-2 rounded-xl inline-flex">
              Start 7-Day Trial <ArrowRight size={18} />
            </Link>
            <Link to="/demo"
              className="px-8 py-4 text-base flex items-center gap-2 rounded-xl transition-all duration-150"
              style={{ color: '#8B9BB8', border: '1px solid #1A2333' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#2E3F54' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#8B9BB8'; e.currentTarget.style.borderColor = '#1A2333' }}>
              Schedule a demo <ChevronRight size={16} />
            </Link>
          </div>
          <p className="text-xs mt-6" style={{ color: '#2E3F54' }}>
            No credit card required · Free tier available · 5-minute setup
          </p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="mb-4">
                <img src="/logo-color.png" alt="Genuinux" style={{ height: 88, display: 'block' }} />
              </div>
              <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>
                AI Trust Infrastructure. Block fraud without blocking customers.
              </p>
            </div>

            {([
              { title: 'Product', links: [
                { label: 'RiskScore',    href: '/#product' },
                { label: 'DeviceID',     href: '/#product' },
                { label: 'BehaviorAI',   href: '/#product' },
                { label: 'DocVerify',    href: '/#product' },
                { label: 'SessionGuard', href: '/#product' },
              ]},
              { title: 'Company', links: [
                { label: 'About',   href: 'mailto:hello@genuinux.io' },
                { label: 'Blog',    href: '/blog/detect-account-takeover' },
                { label: 'Careers', href: 'mailto:careers@genuinux.io' },
                { label: 'Press',   href: 'mailto:press@genuinux.io' },
              ]},
              { title: 'Developers', links: [
                { label: 'Documentation', href: '/docs' },
                { label: 'API Reference', href: '/docs' },
                { label: 'Live Demo',     href: '/demo' },
                { label: 'Changelog',     href: 'mailto:hello@genuinux.io' },
              ]},
            ] as { title: string; links: { label: string; href: string }[] }[]).map((col, i) => (
              <div key={i}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-4" style={{ color: C.textSec, letterSpacing: '0.1em' }}>
                  {col.title}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map(l => (
                    <li key={l.label}>
                      <a href={l.href} className="text-xs transition-colors duration-150"
                        style={{ color: C.textSec }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                        onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8"
            style={{ borderTop: `1px solid ${C.border}` }}>
            <p className="text-xs" style={{ color: C.textMut }}>© 2026 Genuinux. AI Trust Infrastructure.</p>
            <div className="flex items-center gap-6">
              {([
                { label: 'Privacy',  to: '/privacy' },
                { label: 'Terms',    to: '/terms' },
                { label: 'Security', to: 'mailto:security@genuinux.io', external: true },
              ] as { label: string; to: string; external?: boolean }[]).map(l => (
                l.external
                  ? <a key={l.label} href={l.to} className="text-xs transition-colors duration-150"
                      style={{ color: C.textMut }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                      onMouseLeave={e => (e.currentTarget.style.color = C.textMut)}>
                      {l.label}
                    </a>
                  : <Link key={l.label} to={l.to} className="text-xs transition-colors duration-150"
                      style={{ color: C.textMut, textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                      onMouseLeave={e => (e.currentTarget.style.color = C.textMut)}>
                      {l.label}
                    </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
