import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, Activity, ArrowRight, CheckCircle, AlertTriangle,
  Cpu, Fingerprint, FileSearch, Lock, Globe, ChevronRight,
  ShoppingCart, Gamepad2, Landmark, Coins, MonitorSmartphone,
  UserCheck, LogIn, CreditCard, ArrowLeftRight, MousePointerClick,
  Menu, X, Terminal, Users, Eye, MessageSquare,
  Sun, Moon,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:      '#F0F2F8',
  surface: '#FFFFFF',
  borderL: '#E8EBF4',
  border:  '#D6DAE8',
  text:    '#07090F',
  textSec: '#4A5468',
  textMut: '#8892AA',
  trust:   '#16C784',
  trustT:  '#0DAF70',
  trustBg: 'rgba(22,199,132,0.06)',
  trustBd: 'rgba(22,199,132,0.18)',
  dark:    '#07090F',
  dark2:   '#0B1016',
  darkBd:  '#1A2333',
  red:     '#EF4444',
  redBg:   'rgba(239,68,68,0.07)',
  shadow:  '0 1px 3px rgba(7,9,15,0.06), 0 2px 12px rgba(7,9,15,0.04)',
  shadowMd:'0 4px 20px rgba(7,9,15,0.08), 0 1px 4px rgba(7,9,15,0.05)',
  shadowLg:'0 20px 60px rgba(7,9,15,0.14), 0 4px 20px rgba(7,9,15,0.07)',
}

// Inter Tight — enterprise display font
const H: React.CSSProperties = { fontFamily: "'Inter Tight', sans-serif" }

// Section label — no pill, no background. Just text. Like Stripe.
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: "'Inter Tight', sans-serif",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: C.trust,
      marginBottom: 12,
    }}>
      {children}
    </p>
  )
}

// ── MiniChart ─────────────────────────────────────────────────────────────────

function MiniChart() {
  const pts = [2, 4, 3, 6, 5, 8, 6, 9, 8, 11, 10, 13, 11, 10, 12, 14, 11, 13, 16, 12, 17, 14, 16, 19]
  const max = Math.max(...pts)
  const W = 100, H = 28
  const coords = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - (v / max) * H] as [number, number])
  const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `M0,${H} ` + coords.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W},${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="mcg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16C784" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#16C784" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mcg)" />
      <path d={line} fill="none" stroke="#16C784" strokeWidth="1.2" />
    </svg>
  )
}

// ── Dashboard Mockup — with real sidebar, showing actual product ───────────────

function DashboardMockup() {
  const SIDEBAR_ITEMS = [
    { label: 'Overview',    active: true  },
    { label: 'Risk Events', active: false },
    { label: 'Users',       active: false },
    { label: 'Review Queue',active: false },
    { label: 'Rules',       active: false },
    { label: 'API Keys',    active: false },
  ]

  const EVENTS = [
    { id: 'usr_k9x2m', ev: 'checkout', dec: 'ALLOW',  col: '#16C784', score: 94 },
    { id: 'usr_8f3k2p', ev: 'login',    dec: 'BLOCK',  col: '#EF4444', score: 12 },
    { id: 'usr_m3j7x',  ev: 'signup',   dec: 'REVIEW', col: '#F59E0B', score: 61 },
    { id: 'usr_p2q8r',  ev: 'payment',  dec: 'ALLOW',  col: '#16C784', score: 88 },
    { id: 'usr_n7v3k',  ev: 'withdraw', dec: 'BLOCK',  col: '#EF4444', score: 8  },
  ]

  return (
    <div style={{
      background: '#07080C',
      borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.07)',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 40px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.3)',
      overflow: 'hidden',
      position: 'relative',
      width: '100%',
    }}>
      {/* Browser chrome */}
      <div style={{
        background: '#0A0F18',
        padding: '9px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map(col => (
            <div key={col} style={{ width: 8, height: 8, borderRadius: '50%', background: col, opacity: 0.85 }} />
          ))}
        </div>
        <div style={{
          flex: 1,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 4,
          height: 17,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 7,
          gap: 4,
        }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#16C784', opacity: 0.8 }} />
          <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.18)', fontFamily: "'IBM Plex Mono', monospace" }}>
            app.genuinux.com/dashboard
          </span>
        </div>
      </div>

      {/* App layout: sidebar + content */}
      <div style={{ display: 'flex' }}>

        {/* Sidebar */}
        <div style={{
          width: 136,
          background: '#09101A',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          padding: '10px 8px',
          flexShrink: 0,
        }}>
          {/* Logo */}
          <div style={{ padding: '3px 8px 10px', marginBottom: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: '#16C784' }} />
              <span style={{ fontSize: 9, fontWeight: 600, color: '#C8D4E8', fontFamily: "'Inter Tight', sans-serif" }}>Genuinux</span>
            </div>
          </div>

          {/* Group label */}
          <p style={{ fontSize: 7, color: '#253345', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 8px 3px', fontFamily: "'DM Sans', sans-serif" }}>
            Intelligence
          </p>

          {/* Nav */}
          {SIDEBAR_ITEMS.map(item => (
            <div key={item.label} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '5px 8px',
              borderRadius: 5,
              borderLeft: `2px solid ${item.active ? '#16C784' : 'transparent'}`,
              background: item.active ? 'rgba(22,199,132,0.09)' : 'transparent',
              marginBottom: 1,
            }}>
              <span style={{
                fontSize: 9,
                fontWeight: item.active ? 600 : 400,
                color: item.active ? '#16C784' : '#3D5270',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {item.label}
              </span>
            </div>
          ))}

          {/* Divider + Settings */}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            {['Settings', 'Docs'].map(item => (
              <div key={item} style={{ padding: '4px 8px', marginBottom: 1 }}>
                <span style={{ fontSize: 9, color: '#2E3F54', fontFamily: "'DM Sans', sans-serif" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: '11px 13px', overflow: 'hidden', minWidth: 0 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#E8F0FA', fontFamily: "'Inter Tight', sans-serif", letterSpacing: '-0.01em', display: 'block', lineHeight: 1 }}>
                Risk Intelligence
              </span>
              <span style={{ fontSize: 7.5, color: '#3D5270', fontFamily: "'DM Sans', sans-serif" }}>
                Live · last 24 hours
              </span>
            </div>
            <span style={{ fontSize: 7.5, color: '#16C784', fontFamily: "'IBM Plex Mono', monospace", display: 'flex', alignItems: 'center', gap: 3 }}>
              <span className="pulse-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: '#16C784', display: 'inline-block' }} />
              Live
            </span>
          </div>

          {/* 4 Metric cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginBottom: 8 }}>
            {[
              { label: 'Total Checks', val: '2.4M',   color: '#E8F0FA' },
              { label: 'Blocked',      val: '18,293',  color: '#EF4444' },
              { label: 'In Review',    val: '358',     color: '#F59E0B' },
              { label: 'Avg Trust',    val: '74.4',    color: '#16C784' },
            ].map(m => (
              <div key={m.label} style={{
                background: '#0B1016',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 7,
                padding: '6px 8px',
              }}>
                <p style={{ fontSize: 7, color: '#3D5270', marginBottom: 2, fontFamily: "'DM Sans', sans-serif" }}>{m.label}</p>
                <p style={{ fontSize: 13, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: m.color, lineHeight: 1 }}>{m.val}</p>
              </div>
            ))}
          </div>

          {/* Two-column: chart left, feed right */}
          <div style={{ display: 'grid', gridTemplateColumns: '58% 42%', gap: 6 }}>

            {/* Chart */}
            <div style={{
              background: '#0B1016',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 7,
              padding: '7px 10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <p style={{ fontSize: 7, color: '#3D5270', fontFamily: "'DM Sans', sans-serif" }}>Events over time</p>
                <p style={{ fontSize: 7, color: '#253345', fontFamily: "'DM Sans', sans-serif" }}>24h</p>
              </div>
              <MiniChart />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {['24h ago', '18h', '12h', '6h', 'now'].map(l => (
                  <span key={l} style={{ fontSize: 6, color: '#253345', fontFamily: "'IBM Plex Mono', monospace" }}>{l}</span>
                ))}
              </div>
              {/* Decision breakdown bars */}
              <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <p style={{ fontSize: 7, color: '#3D5270', marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>Decision breakdown</p>
                {[
                  { label: 'Approved', pct: 82, color: '#16C784' },
                  { label: 'Review',   pct: 11, color: '#F59E0B' },
                  { label: 'Blocked',  pct: 7,  color: '#EF4444' },
                ].map(b => (
                  <div key={b.label} style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 7, color: '#3D5270', fontFamily: "'DM Sans', sans-serif" }}>{b.label}</span>
                      <span style={{ fontSize: 7, fontFamily: "'IBM Plex Mono', monospace", color: b.color }}>{b.pct}%</span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${b.pct}%`, height: '100%', background: b.color, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Risk Feed */}
            <div style={{
              background: '#0B1016',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 7,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ padding: '6px 9px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span className="pulse-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: '#16C784', display: 'inline-block' }} />
                  <p style={{ fontSize: 7, color: '#3D5270', fontFamily: "'DM Sans', sans-serif" }}>Live Risk Feed</p>
                </div>
                <span style={{ fontSize: 7, color: '#253345', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {EVENTS.length} events
                </span>
              </div>
              {EVENTS.map((r, i) => (
                <div key={r.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 9px',
                  borderBottom: i < EVENTS.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: r.col, flexShrink: 0 }} />
                  <span style={{ fontSize: 7, fontFamily: "'IBM Plex Mono', monospace", color: '#3D5270', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.id}</span>
                  <span style={{ fontSize: 7, color: '#253345', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{r.ev}</span>
                  <span style={{
                    fontSize: 7,
                    fontWeight: 700,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: r.col,
                    background: `${r.col}18`,
                    padding: '1px 4px',
                    borderRadius: 3,
                    flexShrink: 0,
                  }}>{r.dec}</span>
                  <span style={{ fontSize: 7, fontFamily: "'IBM Plex Mono', monospace", color: r.col, width: 14, textAlign: 'right', flexShrink: 0 }}>{r.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scan line — subtle */}
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
  { icon: Activity,    name: 'RiskScore',    tag: 'Core',      desc: 'Combines 300+ signals into a single trust score. Returns a clear allow, review, or block verdict in under 50ms.' },
  { icon: Fingerprint, name: 'DeviceID',     tag: 'Device',    desc: 'Persistent fingerprinting across browsers and sessions. Detects emulators, rooted devices, and automation.' },
  { icon: Cpu,         name: 'BehaviorAI',   tag: 'Behavioral',desc: "Baselines each user's normal patterns. Flags velocity spikes, unusual hours, and session hijacking in real time." },
  { icon: FileSearch,  name: 'DocVerify',    tag: 'Identity',  desc: 'Automated document validation. Detects forgeries, expired IDs, and mismatches between document and selfie.' },
  { icon: Lock,        name: 'SessionGuard', tag: 'Auth',      desc: 'Continuous session monitoring for account takeover patterns. Silent step-up when risk spikes mid-session.' },
]

const PROBLEM_SIGNALS = [
  { icon: AlertTriangle, title: 'Bot-driven signups',      desc: 'Automated account creation that passes CAPTCHA — invisible without behavioral context.' },
  { icon: Activity,      title: 'Velocity attacks',         desc: 'The same identity hits across sessions, IPs, and devices — too fast for static thresholds.' },
  { icon: Fingerprint,   title: 'Device recycling',         desc: 'Spoofed fingerprints let bad actors appear as new users every time, defeating session protection.' },
  { icon: Users,         title: 'Synthetic identity rings', desc: 'Coordinated networks create thousands of real-looking accounts. No single account looks fraudulent.' },
]

const VERTICALS = [
  { icon: Landmark,         label: 'Fintech & Banking',    desc: 'AML, KYC, payment fraud, synthetic identity' },
  { icon: ShoppingCart,     label: 'Retail & E-commerce',  desc: 'Promo abuse, chargebacks, fake accounts' },
  { icon: Gamepad2,         label: 'iGaming & Betting',    desc: 'Age verification, multi-accounting, bonus fraud' },
  { icon: Coins,            label: 'Crypto & DeFi',        desc: 'Wallet fraud, rug-pull protection, bot trading' },
  { icon: Globe,            label: 'Marketplaces',         desc: 'Seller fraud, fake reviews, listing manipulation' },
  { icon: MonitorSmartphone,label: 'SaaS & Subscriptions', desc: 'Trial abuse, credential stuffing, seat sharing' },
]

const JOURNEY = [
  { icon: UserCheck,         label: 'Signup & Onboarding',    desc: 'Stop fake account creation before it starts.' },
  { icon: LogIn,             label: 'Authentication',          desc: 'Detect account takeover in real time.' },
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
    badge: null, featured: false, trialNote: null,
    cta: 'Start Free Trial', ctaTo: '/register', external: false,
    features: ['50,000 events/month', 'RiskScore API', 'Webhooks', '30-day event history', 'Basic rules engine', 'Dashboard analytics', 'Shadow mode', 'Email support'],
  },
  {
    id: 'growth', name: 'Growth',
    price: '£499', sub: '/mo',
    subtitle: 'For platforms scaling with real fraud exposure.',
    badge: 'Most Popular', featured: true, trialNote: null,
    cta: 'Start Free Trial', ctaTo: '/register', external: false,
    features: ['500,000 events/month', 'All core modules', 'Device Intelligence', 'BehaviorAI', 'SessionGuard', 'Real-time risk alerts', 'Advanced rules engine', 'Behavioral anomaly detection', 'Velocity analysis', 'Team access', '90-day history', 'Priority support'],
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
    desc:  'Behavioral signals that predict ATO attempts — and how to act on them in real time.' },
  { slug: 'cost-of-false-positives', category: 'Risk Strategy',   date: 'Apr 28, 2026', readTime: '4 min',
    title: 'The true cost of false positives in fraud prevention',
    desc:  'Every blocked legitimate user has a cost. How to measure it and optimize thresholds.' },
  { slug: 'first-custom-fraud-rule', category: 'Developer Guide', date: 'Apr 15, 2026', readTime: '6 min',
    title: 'Building your first custom fraud rule with Genuinux',
    desc:  'Write, test, and deploy custom rules without touching your production code.' },
]

const TRUST_CARDS = [
  { icon: MessageSquare, title: 'Explainable decisions',    desc: 'Every verdict includes signals, risk reasons, and a plain-English recommendation. No black boxes.' },
  { icon: FileSearch,    title: 'Audit-ready logs',         desc: 'Rule changes, API key creation, and review actions written to an immutable audit log.' },
  { icon: Lock,          title: 'Secure API keys',          desc: 'SHA-256 hashed on creation. Shown once, never stored. Revoke instantly from the dashboard.' },
  { icon: Users,         title: 'Role-based access',        desc: 'Owner, admin, and member roles control who can manage keys, webhooks, rules, and settings.' },
  { icon: Shield,        title: 'Privacy-first design',     desc: 'No PII required. All signals derived from what you explicitly provide — nothing inferred.' },
  { icon: Eye,           title: 'Shadow mode rollout',      desc: 'Validate accuracy on real traffic in observation mode before a single user is affected.' },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function Landing() {
  const [scrolled,        setScrolled]        = useState(false)
  const [hoveredModule,   setHoveredModule]   = useState<number | null>(null)
  const [hoveredVertical, setHoveredVertical] = useState<number | null>(null)
  const [mobileMenuOpen,  setMobileMenuOpen]  = useState(false)
  const { theme, toggle } = useTheme()

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  // ── Navbar ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>

      <nav className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: scrolled || mobileMenuOpen ? 'rgba(240,242,248,0.96)' : 'rgba(240,242,248,0.5)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${scrolled || mobileMenuOpen ? C.border : 'transparent'}`,
          boxShadow: scrolled ? '0 1px 20px rgba(7,9,15,0.06)' : 'none',
          transition: 'all 0.2s ease',
        }}>
        <div className="flex items-center justify-between px-6 py-3 max-w-7xl mx-auto">
          <Link to="/">
            <img src="/logo-horizontal.png" alt="Genuinux" style={{ height: 80, display: 'block' }} />
          </Link>

          <div className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map(({ label, id }) => (
              <a key={label} href={`#${id}`}
                className="text-sm font-medium transition-colors duration-150"
                style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}
                onClick={e => { e.preventDefault(); scrollTo(id) }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                {label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <button onClick={toggle}
              className="p-2 rounded-lg transition-colors duration-150"
              style={{ color: C.textSec, border: `1px solid ${C.border}` }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <Link to="/login"
              className="text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-150"
              style={{ color: C.textSec, border: `1px solid ${C.border}`, fontFamily: "'DM Sans', sans-serif" }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
              Sign in
            </Link>
            <Link to="/register"
              className="text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all duration-150"
              style={{ background: C.dark, color: '#FFFFFF', fontFamily: "'Inter Tight', sans-serif" }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0B1016')}
              onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>
              Start Free Trial
            </Link>
          </div>

          <button className="md:hidden p-2 rounded-lg"
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
                  style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}
                  onClick={e => { e.preventDefault(); scrollTo(id) }}>
                  {label}
                </a>
              ))}
            </div>
            <div className="flex gap-2 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)}
                className="flex-1 text-sm py-2.5 rounded-lg text-center"
                style={{ border: `1px solid ${C.border}`, color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
                Sign in
              </Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)}
                className="flex-1 text-sm py-2.5 rounded-lg text-center font-semibold"
                style={{ background: C.dark, color: '#FFFFFF', fontFamily: "'Inter Tight', sans-serif" }}>
                Start Free Trial
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden"
        style={{
          background: C.bg,
          paddingTop: 112,
          paddingBottom: 72,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
        }}>
        {/* Subtle dot grid */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, rgba(22,199,132,0.06) 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 60% 50% at 50% -5%, rgba(22,199,132,0.04) 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div className="relative max-w-7xl mx-auto px-6 w-full">

          {/* Centered text block — max 780px, like Stripe/Vercel */}
          <div className="max-w-[780px] mx-auto text-center">

            {/* Badge */}
            <div className="flex items-center justify-center gap-2 mb-5 anim-0">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: C.trust, letterSpacing: '0.1em', fontFamily: "'Inter Tight', sans-serif" }}>
                <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
                Risk Intelligence API · Production Ready
              </span>
            </div>

            {/* Headline */}
            <h1 className="anim-1"
              style={{
                fontSize: 'clamp(1.9rem, 3.2vw, 2.85rem)',
                fontWeight: 700,
                letterSpacing: '-0.022em',
                lineHeight: 1.18,
                color: C.text,
                marginBottom: 18,
                ...H,
              }}>
              Real-time fraud decisions
              <br />
              <span style={{ color: C.trust }}>for every transaction.</span>
            </h1>

            {/* Subtext */}
            <p className="anim-2"
              style={{
                fontSize: '1rem',
                lineHeight: 1.65,
                color: C.textSec,
                maxWidth: 560,
                margin: '0 auto 28px',
                fontFamily: "'DM Sans', sans-serif",
              }}>
              One API call delivers trust scores, fraud signals, and block/approve decisions in under 50ms.
              Full coverage from signup to withdrawal — no vendor sprawl.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-9 anim-3">
              <Link to="/register" className="btn-trust px-5 py-2.5 text-sm gap-1.5">
                Start Free Trial <ArrowRight size={14} />
              </Link>
              <Link to="/docs"
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium transition-all duration-150"
                style={{ color: C.textSec, border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: "'DM Sans', sans-serif" }}
                onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = '#A0A8BE' }}
                onMouseLeave={e => { e.currentTarget.style.color = C.textSec; e.currentTarget.style.borderColor = C.border }}>
                View API docs <ChevronRight size={13} />
              </Link>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center justify-center gap-5 anim-4">
              {[
                { val: '< 50ms', label: 'Decision latency' },
                { val: '300+',   label: 'Risk signals' },
                { val: '7',      label: 'Event types' },
                { val: '1 call', label: 'Full coverage' },
              ].map((s, i) => (
                <div key={i} className={i > 0 ? 'pl-5' : ''}
                  style={i > 0 ? { borderLeft: `1px solid ${C.border}` } : {}}>
                  <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: C.text, lineHeight: 1 }}>
                    {s.val}
                  </p>
                  <p style={{ fontSize: 10, color: C.textMut, marginTop: 3, fontFamily: "'DM Sans', sans-serif" }}>{s.label}</p>
                </div>
              ))}
            </div>

            <p className="anim-5 mt-5 text-xs" style={{ color: C.textMut, fontFamily: "'DM Sans', sans-serif" }}>
              No credit card required · 5-minute setup · Cancel anytime
            </p>
          </div>

          {/* Dashboard mockup — full width below, like Stripe product screenshots */}
          <div className="mt-14 anim-5">
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* ── Built for trust ──────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <Label>Built for trust</Label>
            <h2 style={{ fontSize: 'clamp(1.4rem, 2vw, 1.85rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.25, ...H }}>
              Security and transparency, by design.
            </h2>
            <p className="text-sm mt-3 max-w-lg mx-auto" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
              Built for teams that need to move fast without cutting corners on auditability, explainability, or data control.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {TRUST_CARDS.map((card, i) => (
              <div key={i} className="p-5 rounded-xl"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <card.icon size={13} style={{ color: C.trust }} />
                </div>
                <h3 className="text-sm font-semibold mb-1.5" style={{ color: C.text, fontFamily: "'Inter Tight', sans-serif" }}>{card.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem ──────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <Label>The problem</Label>
          <h2 style={{ fontSize: 'clamp(1.4rem, 2vw, 1.85rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.25, ...H }}>
            Fraud no longer looks obvious.
          </h2>
          <p className="text-sm max-w-lg mx-auto mt-3 leading-relaxed" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
            Modern fraud hides in behavioral patterns — not individual transactions.
            By the time a static rule catches it, the damage is done.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PROBLEM_SIGNALS.map((p, i) => (
            <div key={i} className="p-5 rounded-xl"
              style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                style={{ background: C.redBg, border: '1px solid rgba(239,68,68,0.14)' }}>
                <p.icon size={15} style={{ color: C.red }} />
              </div>
              <h3 className="text-sm font-semibold mb-1.5" style={{ color: C.text, fontFamily: "'Inter Tight', sans-serif" }}>{p.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Platform overview ─────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="flex flex-col lg:flex-row items-center gap-12">

            {/* Dark terminal panel */}
            <div className="flex-1 w-full" style={{
              background: C.dark, borderRadius: 12, border: `1px solid ${C.darkBd}`,
              boxShadow: C.shadowLg, padding: 22, position: 'relative', overflow: 'hidden', minHeight: 300,
            }}>
              <div className="flex items-center gap-2 mb-5">
                {['#EF4444', '#F59E0B', '#22C55E'].map(col => (
                  <div key={col} className="w-3 h-3 rounded-full" style={{ background: col }} />
                ))}
                <div className="flex-1 mx-4 h-5 rounded" style={{ background: '#1A2333', maxWidth: 200 }} />
              </div>
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Total Checks', val: '2.4M',   color: C.trust   },
                  { label: 'Blocked',      val: '18,293', color: '#EF4444' },
                  { label: 'Avg Trust',    val: '76.4',   color: '#60A5FA' },
                ].map((m, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: '#0B1016', border: '1px solid #182030' }}>
                    <p className="text-[9px] mb-1" style={{ color: '#3D5270' }}>{m.label}</p>
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
                    <p className="text-xs mono flex-1" style={{ color: '#3D5270' }}>{r.id}</p>
                    <p className="text-xs" style={{ color: '#253345' }}>{r.ev}</p>
                    <p className="text-xs mono w-8 text-right" style={{ color: r.color }}>{r.score}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded mono"
                      style={{ background: `${r.color}18`, color: r.color }}>{r.dec}</span>
                  </div>
                ))}
              </div>
              <div className="scan-anim" />
            </div>

            {/* Copy */}
            <div className="flex-1">
              <Label>One Platform</Label>
              <h2 style={{ fontSize: 'clamp(1.4rem, 2.2vw, 2rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.22, marginBottom: 16, ...H }}>
                Full-stack fraud prevention,
                <br />
                <span style={{ color: C.trust }}>one API call.</span>
              </h2>
              <p className="text-sm leading-relaxed mb-7" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
                Stop stitching together five different vendors. Genuinux delivers device intelligence,
                behavioral ML, identity verification, and session monitoring from a single endpoint.
                Your stack stays clean. Your fraud rate drops on day one.
              </p>
              <div className="space-y-3 mb-7">
                {['One integration, all risk signals unified', 'Real-time decisions, never batch-processed', 'Webhook alerts + dashboard for your team'].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
                    <CheckCircle size={13} style={{ color: C.trust, flexShrink: 0 }} />
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Link to="/register" className="btn-trust px-5 py-2.5 text-sm gap-1.5">
                  Start 7-Day Trial <ArrowRight size={13} />
                </Link>
                <Link to="/docs"
                  className="px-5 py-2.5 text-sm flex items-center gap-1.5 transition-colors duration-150"
                  style={{ color: C.textSec, border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: "'DM Sans', sans-serif" }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                  View docs <ChevronRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product Modules ──────────────────── id="product" ─────── */}
      <section id="product">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <Label>API Modules</Label>
            <h2 style={{ fontSize: 'clamp(1.4rem, 2vw, 1.85rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.25, ...H }}>
              Every signal you need, zero vendor sprawl.
            </h2>
            <p className="text-sm mt-3 max-w-lg mx-auto" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
              Mix and match modules from the same SDK. Each adds protection without a new integration.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-3">
            {MODULES.map((m, i) => (
              <div key={i} className="p-5 rounded-xl cursor-default"
                style={{
                  background: hoveredModule === i ? C.bg : C.surface,
                  border: `1px solid ${hoveredModule === i ? C.trustBd : C.border}`,
                  boxShadow: hoveredModule === i ? C.shadowMd : C.shadow,
                  transition: 'all 0.15s ease',
                  transform: hoveredModule === i ? 'translateY(-3px)' : 'none',
                }}
                onMouseEnter={() => setHoveredModule(i)}
                onMouseLeave={() => setHoveredModule(null)}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <m.icon size={15} style={{ color: C.trust }} />
                </div>
                <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMut, letterSpacing: '0.08em' }}>{m.tag}</p>
                <h3 className="text-sm font-semibold mb-2 mono" style={{ color: C.text }}>{m.name}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built for scale strip ─────────────────────────────────── */}
      <section style={{ background: C.dark, borderTop: `1px solid ${C.darkBd}` }}>
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', color: '#253345', marginBottom: 32, fontFamily: "'Inter Tight', sans-serif" }}>
            Built for scale
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: '< 50ms', label: 'Median decision latency'  },
              { value: '300+',   label: 'Risk signals per event'   },
              { value: '7',      label: 'Event types supported'    },
              { value: '1 call', label: 'Full-stack protection'    },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl font-bold mono mb-1.5"
                  style={{ color: i === 0 ? C.trust : '#E8F0FA', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {s.value}
                </p>
                <p className="text-xs" style={{ color: '#3D5270', fontFamily: "'DM Sans', sans-serif" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solutions by Vertical ─────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col lg:flex-row gap-12 items-start">
          <div className="lg:w-72 flex-shrink-0">
            <Label>By Industry</Label>
            <h2 style={{ fontSize: 'clamp(1.3rem, 2vw, 1.7rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.25, marginBottom: 12, ...H }}>
              Built for your vertical.
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
              Fraud patterns vary by industry. Genuinux ships pre-tuned signal weights for each vertical — no starting from scratch.
            </p>
          </div>
          <div className="flex-1 grid md:grid-cols-2 gap-3">
            {VERTICALS.map((v, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl cursor-default"
                style={{
                  background: hoveredVertical === i ? C.trustBg : C.surface,
                  border: `1px solid ${hoveredVertical === i ? C.trustBd : C.border}`,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={() => setHoveredVertical(i)}
                onMouseLeave={() => setHoveredVertical(null)}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <v.icon size={13} style={{ color: C.trust }} />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: C.text, fontFamily: "'Inter Tight', sans-serif" }}>{v.label}</p>
                  <p className="text-xs leading-relaxed" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Journey Coverage ──────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <Label>Full Journey Coverage</Label>
            <h2 style={{ fontSize: 'clamp(1.4rem, 2vw, 1.85rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.25, ...H }}>
              Protect every touchpoint. Not just login.
            </h2>
          </div>
          <div className="grid md:grid-cols-5 gap-6">
            {JOURNEY.map((j, i) => (
              <div key={i}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <j.icon size={14} style={{ color: C.trust }} />
                </div>
                <h3 className="text-sm font-semibold mb-1.5" style={{ color: C.text, fontFamily: "'Inter Tight', sans-serif" }}>{j.label}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>{j.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Developers ──────────────────────── id="developers" ───── */}
      <section id="developers" className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <Label>For Developers</Label>
          <h2 style={{ fontSize: 'clamp(1.4rem, 2vw, 1.85rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.25, ...H }}>
            Integrate in minutes. Protect forever.
          </h2>
          <p className="text-sm mt-3 max-w-md mx-auto" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
            No infrastructure changes. One API endpoint, any language.
          </p>
        </div>

        {/* API Request/Response — enterprise-grade docs feel */}
        <div className="grid md:grid-cols-2 gap-4 mb-12">
          <div className="rounded-xl overflow-hidden" style={{ background: C.dark, border: `1px solid ${C.darkBd}` }}>
            <div className="px-4 py-2.5 flex items-center justify-between"
              style={{ borderBottom: `1px solid ${C.darkBd}` }}>
              <span className="text-xs font-semibold mono" style={{ color: '#3D5270' }}>Request</span>
              <span className="text-[10px] mono px-2 py-0.5 rounded"
                style={{ background: 'rgba(22,199,132,0.1)', color: C.trust, border: `1px solid ${C.trustBd}` }}>
                POST /api/risk/check
              </span>
            </div>
            <pre className="p-4 text-xs mono leading-relaxed overflow-x-auto" style={{ color: '#64748B', margin: 0 }}>
              <span style={{ color: '#3D5270' }}>Authorization:</span>{' '}
              <span style={{ color: C.trust }}>Bearer gnx_live_...</span>{'\n\n'}
              <span style={{ color: C.darkBd }}>{'{'}</span>{'\n'}
              {'  '}<span style={{ color: '#8B9BB8' }}>"user_id"</span>
              <span style={{ color: C.darkBd }}>: </span>
              <span style={{ color: C.trust }}>"usr_k9x2m"</span>,{'\n'}
              {'  '}<span style={{ color: '#8B9BB8' }}>"event_type"</span>
              <span style={{ color: C.darkBd }}>: </span>
              <span style={{ color: C.trust }}>"checkout"</span>,{'\n'}
              {'  '}<span style={{ color: '#8B9BB8' }}>"ip_address"</span>
              <span style={{ color: C.darkBd }}>: </span>
              <span style={{ color: C.trust }}>"82.197.32.44"</span>,{'\n'}
              {'  '}<span style={{ color: '#8B9BB8' }}>"email"</span>
              <span style={{ color: C.darkBd }}>: </span>
              <span style={{ color: C.trust }}>"user@acme.com"</span>{'\n'}
              <span style={{ color: C.darkBd }}>{'}'}</span>
            </pre>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: C.dark, border: `1px solid ${C.darkBd}` }}>
            <div className="px-4 py-2.5 flex items-center justify-between"
              style={{ borderBottom: `1px solid ${C.darkBd}` }}>
              <span className="text-xs font-semibold mono" style={{ color: '#3D5270' }}>Response</span>
              <span className="text-[10px] mono px-2 py-0.5 rounded"
                style={{ background: 'rgba(22,199,132,0.1)', color: C.trust, border: `1px solid ${C.trustBd}` }}>
                200 OK · 47ms
              </span>
            </div>
            <pre className="p-4 text-xs mono leading-relaxed overflow-x-auto" style={{ color: '#64748B', margin: 0 }}>
              <span style={{ color: C.darkBd }}>{'{'}</span>{'\n'}
              {'  '}<span style={{ color: '#8B9BB8' }}>"decision"</span>
              <span style={{ color: C.darkBd }}>: </span>
              <span style={{ color: C.trust }}>"approve"</span>,{'\n'}
              {'  '}<span style={{ color: '#8B9BB8' }}>"trust_score"</span>
              <span style={{ color: C.darkBd }}>: </span>
              <span style={{ color: C.trust }}>94</span>,{'\n'}
              {'  '}<span style={{ color: '#8B9BB8' }}>"fraud_score"</span>
              <span style={{ color: C.darkBd }}>: </span>
              <span style={{ color: '#EF4444' }}>6</span>,{'\n'}
              {'  '}<span style={{ color: '#8B9BB8' }}>"risk_level"</span>
              <span style={{ color: C.darkBd }}>: </span>
              <span style={{ color: C.trust }}>"low"</span>,{'\n'}
              {'  '}<span style={{ color: '#8B9BB8' }}>"signals"</span>
              <span style={{ color: C.darkBd }}>: </span>
              <span style={{ color: C.darkBd }}>[]</span>{'\n'}
              <span style={{ color: C.darkBd }}>{'}'}</span>
            </pre>
          </div>
        </div>

        {/* 3 steps */}
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { n: '01', title: 'Install the SDK',       time: '2 min',    desc: 'One package. Zero infrastructure changes. Works with any backend language.',           code: 'npm install @genuinux/sdk' },
            { n: '02', title: 'Send your first event', time: '5 min',    desc: "Call analyze() with a user ID, IP, and event type.",                                  code: 'genuinux.analyze({ user_id, event, ip })' },
            { n: '03', title: 'Act on the decision',   time: 'Instant',  desc: 'Act on the decision in your own handler. Protected from the first request.',          code: "if (res.decision === 'block') return 403" },
          ].map((s, i) => (
            <div key={i}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mono mb-4"
                style={{ border: `1.5px solid ${C.border}`, color: C.textSec, background: C.bg, fontFamily: "'IBM Plex Mono', monospace" }}>
                {s.n}
              </div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: C.text, fontFamily: "'Inter Tight', sans-serif" }}>{s.title}</h3>
              <p className="text-[10px] font-semibold mono mb-2.5" style={{ color: C.trust }}>{s.time}</p>
              <p className="text-xs leading-relaxed mb-4" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>{s.desc}</p>
              <div className="px-4 py-3 rounded-lg text-xs mono"
                style={{ background: C.dark, color: C.trust, border: `1px solid ${C.darkBd}`, fontFamily: "'IBM Plex Mono', monospace" }}>
                {s.code}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link to="/docs"
            className="inline-flex items-center gap-2 text-sm font-medium transition-opacity"
            style={{ color: C.trust, fontFamily: "'DM Sans', sans-serif" }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            View full API documentation <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      {/* ── Teams ─────────────────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <h2 style={{ fontSize: 'clamp(1.4rem, 2vw, 1.85rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.25, ...H }}>
              Built for the teams who own trust.
            </h2>
            <p className="text-sm mt-3 max-w-lg mx-auto" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
              Whether you're stopping fraud, analyzing risk, or writing the integration — Genuinux fits your workflow.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {TEAMS.map((t, i) => (
              <div key={i} className="p-6 rounded-xl"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <t.icon size={15} style={{ color: C.trust }} />
                </div>
                <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMut, letterSpacing: '0.1em', fontFamily: "'Inter Tight', sans-serif" }}>For</p>
                <h3 className="text-sm font-semibold mb-1.5" style={{ color: C.text, fontFamily: "'Inter Tight', sans-serif" }}>{t.role}</h3>
                <p className="text-xs mb-4" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>{t.tagline}</p>
                <ul className="space-y-2">
                  {t.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-xs" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
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
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <Label>Pricing</Label>
            <h2 style={{ fontSize: 'clamp(1.4rem, 2vw, 1.85rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.25, ...H }}>
              Simple, transparent pricing.
            </h2>
            <p className="text-sm mt-3 max-w-md mx-auto" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
              Three tiers. No contracts, no hidden fees. Cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:items-stretch">
            {PRICING_PLANS.map(plan => {
              const fg = plan.featured
              return (
                <div key={plan.id} className="flex flex-col rounded-xl"
                  style={fg ? {
                    background: C.dark,
                    border: '1px solid rgba(22,199,132,0.22)',
                    boxShadow: '0 0 0 1px rgba(22,199,132,0.06), 0 24px 56px rgba(22,199,132,0.1), 0 6px 20px rgba(7,9,15,0.3)',
                    padding: '32px 28px',
                  } : {
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    boxShadow: C.shadow,
                    padding: '28px 24px',
                  }}>

                  <div style={{ minHeight: 24, marginBottom: 16 }}>
                    {plan.badge && (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                        style={{ background: C.trustBg, color: C.trust, border: `1px solid ${C.trustBd}`, letterSpacing: '0.1em', fontFamily: "'Inter Tight', sans-serif" }}>
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold mb-1.5"
                    style={{ fontSize: '1rem', letterSpacing: '-0.018em', color: fg ? '#FFFFFF' : C.text, fontFamily: "'Inter Tight', sans-serif" }}>
                    {plan.name}
                  </h3>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: fg ? '#3D5270' : C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
                    {plan.subtitle}
                  </p>

                  <div style={{ minHeight: 18, marginBottom: 6 }}>
                    {plan.trialNote && (
                      <p className="text-xs font-semibold" style={{ color: C.trust, fontFamily: "'DM Sans', sans-serif" }}>{plan.trialNote}</p>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1.5 mb-5" style={{ minHeight: 40 }}>
                    {plan.price
                      ? <>
                          <span className="font-bold mono"
                            style={{ fontSize: fg ? '2.2rem' : '1.8rem', lineHeight: 1, color: fg ? '#FFFFFF' : C.text, fontFamily: "'IBM Plex Mono', monospace" }}>
                            {plan.price}
                          </span>
                          <span className="text-sm" style={{ color: fg ? '#3D5270' : C.textMut, fontFamily: "'DM Sans', sans-serif" }}>
                            {plan.sub}
                          </span>
                        </>
                      : <span className="text-base font-semibold"
                          style={{ color: fg ? '#64748B' : C.text, paddingTop: 4, fontFamily: "'Inter Tight', sans-serif" }}>
                          Custom pricing
                        </span>
                    }
                  </div>

                  <div className="mb-5" style={{ height: 1, background: fg ? '#1A2333' : C.borderL }} />

                  <ul className="space-y-2.5 flex-1 mb-7">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs"
                        style={{ color: fg ? '#64748B' : C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
                        <CheckCircle size={11} style={{ color: C.trust, flexShrink: 0, marginTop: 1 }} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {plan.external
                    ? <a href={plan.ctaTo}
                        className="text-sm font-semibold py-2.5 rounded-lg text-center block transition-all"
                        style={{ background: C.dark2, color: '#FFFFFF', border: `1px solid ${C.darkBd}`, fontFamily: "'Inter Tight', sans-serif" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.trust; e.currentTarget.style.color = C.trust }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.darkBd; e.currentTarget.style.color = '#FFFFFF' }}>
                        {plan.cta}
                      </a>
                    : <Link to={plan.ctaTo}
                        className="text-sm font-semibold py-2.5 rounded-lg text-center block transition-all"
                        style={fg
                          ? { background: C.trust, color: '#07090F', fontFamily: "'Inter Tight', sans-serif" }
                          : { border: `1px solid ${C.border}`, color: C.text, background: 'transparent', fontFamily: "'Inter Tight', sans-serif" }}
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
                    <p className="text-center text-[10px] mt-2.5" style={{ color: fg ? '#253345' : C.textMut, fontFamily: "'DM Sans', sans-serif" }}>
                      No credit card required
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-center text-sm mt-10" style={{ color: C.textMut, fontFamily: "'DM Sans', sans-serif" }}>
            Need more volume?{' '}
            <a href="mailto:sales@genuinux.io"
              className="font-semibold transition-opacity"
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
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="mb-10">
            <Label>Blog</Label>
            <h2 style={{ fontSize: 'clamp(1.4rem, 2vw, 1.85rem)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.25, ...H }}>
              From the Genuinux team.
            </h2>
            <p className="text-sm mt-2" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
              Insights on fraud prevention, risk engineering, and building trustworthy platforms.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {BLOG_POSTS.map((post, i) => (
              <Link key={i} to={`/blog/${post.slug}`}
                className="p-5 rounded-xl flex flex-col transition-all"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.trust)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ background: C.trustBg, color: C.trustT, border: `1px solid ${C.trustBd}`, letterSpacing: '0.08em', fontFamily: "'Inter Tight', sans-serif" }}>
                    {post.category}
                  </span>
                  <span className="text-[10px]" style={{ color: C.textMut, fontFamily: "'DM Sans', sans-serif" }}>{post.date} · {post.readTime}</span>
                </div>
                <h3 className="text-sm font-semibold mb-2 leading-snug flex-1"
                  style={{ color: C.text, fontFamily: "'Inter Tight', sans-serif" }}>
                  {post.title}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>{post.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section style={{ background: C.dark }}>
        <div className="max-w-4xl mx-auto px-6 py-24 text-center">
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#253345', marginBottom: 20, fontFamily: "'Inter Tight', sans-serif" }}>
            Get started today
          </p>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.75rem)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, color: '#FFFFFF', marginBottom: 16, ...H }}>
            Ready to protect your platform?
          </h2>
          <p className="text-base mb-10 max-w-md mx-auto" style={{ color: '#3D5270', fontFamily: "'DM Sans', sans-serif" }}>
            Start protecting your platform today. No contracts, no setup fees. Cancel anytime.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/register" className="btn-trust px-7 py-3.5 text-sm gap-2 rounded-xl inline-flex">
              Start 7-Day Trial <ArrowRight size={16} />
            </Link>
            <Link to="/demo"
              className="px-7 py-3.5 text-sm flex items-center gap-2 rounded-xl transition-all"
              style={{ color: '#3D5270', border: '1px solid #1A2333', fontFamily: "'DM Sans', sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#253345' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#3D5270'; e.currentTarget.style.borderColor = '#1A2333' }}>
              Schedule a demo <ChevronRight size={14} />
            </Link>
          </div>
          <p className="text-xs mt-5" style={{ color: '#1E2D40', fontFamily: "'DM Sans', sans-serif" }}>
            No credit card required · Free tier available · 5-minute setup
          </p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="mb-3">
                <img src="/logo-color.png" alt="Genuinux" style={{ height: 72, display: 'block' }} />
              </div>
              <p className="text-xs leading-relaxed" style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}>
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
                <p className="text-[9px] font-semibold uppercase tracking-widest mb-4"
                  style={{ color: C.textSec, letterSpacing: '0.12em', fontFamily: "'Inter Tight', sans-serif" }}>
                  {col.title}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map(l => (
                    <li key={l.label}>
                      <a href={l.href} className="text-xs transition-colors"
                        style={{ color: C.textSec, fontFamily: "'DM Sans', sans-serif" }}
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

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-7"
            style={{ borderTop: `1px solid ${C.border}` }}>
            <p className="text-xs" style={{ color: C.textMut, fontFamily: "'DM Sans', sans-serif" }}>
              © 2026 Genuinux. AI Trust Infrastructure.
            </p>
            <div className="flex items-center gap-6">
              {([
                { label: 'Privacy',  to: '/privacy' },
                { label: 'Terms',    to: '/terms' },
                { label: 'Security', to: 'mailto:security@genuinux.io', external: true },
              ] as { label: string; to: string; external?: boolean }[]).map(l => (
                l.external
                  ? <a key={l.label} href={l.to} className="text-xs transition-colors"
                      style={{ color: C.textMut, fontFamily: "'DM Sans', sans-serif" }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                      onMouseLeave={e => (e.currentTarget.style.color = C.textMut)}>
                      {l.label}
                    </a>
                  : <Link key={l.label} to={l.to} className="text-xs transition-colors"
                      style={{ color: C.textMut, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif" }}
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
