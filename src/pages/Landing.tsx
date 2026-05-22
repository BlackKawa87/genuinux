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
  shadow:   '0 1px 3px rgba(15,23,42,0.04), 0 1px 8px rgba(15,23,42,0.04)',
  shadowMd: '0 4px 20px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.04)',
  shadowLg: '0 24px 64px rgba(15,23,42,0.09), 0 4px 20px rgba(15,23,42,0.05)',
}

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
          style={{ background: C.redBg, color: '#DC2626' }}>
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

const NAV_LINKS = [
  { label: 'Product',     id: 'product'     },
  { label: 'Developers',  id: 'developers'  },
  { label: 'Pricing',     id: 'pricing'     },
  { label: 'Blog',        id: 'blog'        },
]

const MODULES = [
  { icon: Activity,     name: 'RiskScore',     tag: 'Core Engine',     desc: 'Combines 300+ signals into a single trust score. Every request returns a clear allow, review, or block verdict in under 50ms.' },
  { icon: Fingerprint,  name: 'DeviceID',      tag: 'Device Intel',    desc: 'Persistent device fingerprinting across browsers and sessions. Detects emulators, rooted devices, and automation tools.' },
  { icon: Cpu,          name: 'BehaviorAI',    tag: 'Behavioral ML',   desc: "Baseline each user's normal behavior patterns. Flags anomalies like velocity spikes, unusual hours, and session hijacking." },
  { icon: FileSearch,   name: 'DocVerify',     tag: 'Identity',        desc: 'Automated document capture and validation. Detects forgeries, expired IDs, and mismatches between document and selfie.' },
  { icon: Lock,         name: 'SessionGuard',  tag: 'Auth Security',   desc: 'Continuous session monitoring for account takeover patterns. Re-authenticate silently when risk spikes during a session.' },
]

const PROBLEM_SIGNALS = [
  { icon: AlertTriangle, title: 'Bot-driven signups',        desc: 'Automated account creation that passes CAPTCHA and bypasses rate limits — invisible to rules without behavioral context.' },
  { icon: Activity,      title: 'Velocity attacks',          desc: 'The same identity hits your platform across sessions, IPs, and devices — too fast for humans, invisible to static thresholds.' },
  { icon: Fingerprint,   title: 'Device recycling',          desc: 'Spoofed or shared device fingerprints let bad actors appear as new users every time, defeating session-based protection.' },
  { icon: Users,         title: 'Synthetic identity rings',  desc: 'Coordinated fraud networks create thousands of real-looking accounts. No single account looks fraudulent in isolation.' },
]

const SCALE_CLAIMS = [
  { value: '< 50ms', label: 'Median decision latency'  },
  { value: '300+',   label: 'Risk signals per event'   },
  { value: '7',      label: 'Event types supported'    },
  { value: '1 call', label: 'Full-stack protection'    },
]

const VERTICALS = [
  { icon: Landmark,          label: 'Fintech & Banking',       desc: 'AML, KYC, payment fraud, synthetic identity' },
  { icon: ShoppingCart,      label: 'Retail & E-commerce',     desc: 'Promo abuse, chargebacks, fake accounts' },
  { icon: Gamepad2,          label: 'iGaming & Betting',       desc: 'Age verification, multi-accounting, bonus fraud' },
  { icon: Coins,             label: 'Crypto & DeFi',           desc: 'Wallet fraud, rug-pull protection, bot trading' },
  { icon: Globe,             label: 'Marketplaces',            desc: 'Seller fraud, fake reviews, listing manipulation' },
  { icon: MonitorSmartphone, label: 'SaaS & Subscriptions',   desc: 'Trial abuse, credential stuffing, seat sharing' },
]

const JOURNEY = [
  { icon: UserCheck,        label: 'Signup & Onboarding',     desc: 'Stop fake account creation before it starts. Verify identity without adding friction to genuine users.' },
  { icon: LogIn,            label: 'Authentication',          desc: 'Detect account takeover attempts in real time. Step-up auth only when risk is actually elevated.' },
  { icon: CreditCard,       label: 'Payments & Checkout',     desc: 'Block stolen cards and payment fraud while keeping checkout conversion high for legitimate customers.' },
  { icon: ArrowLeftRight,   label: 'Withdrawals & Transfers', desc: 'Flag unusual withdrawal patterns, velocity anomalies, and money mule networks automatically.' },
  { icon: MousePointerClick,label: 'Continuous Sessions',     desc: 'Monitor the full session lifecycle. Re-evaluate risk as behavior changes — not just at login.' },
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
    features: [
      '50,000 events/month',
      'RiskScore API',
      'Webhooks',
      '30-day event history',
      'Basic rules engine',
      'Dashboard analytics',
      'Shadow mode',
      'Basic risk alerts',
      'Email support',
    ],
  },
  {
    id: 'growth', name: 'Growth',
    price: '£499', sub: '/mo',
    subtitle: 'For platforms scaling with real fraud exposure.',
    badge: 'Most Popular', featured: true, trialNote: '7-day trial included',
    cta: 'Start 7-Day Trial', ctaTo: '/register', external: false,
    features: [
      '500,000 events/month',
      'All core modules',
      'Device Intelligence',
      'BehaviorAI',
      'SessionGuard',
      'Real-time risk alerts',
      'Advanced rules engine',
      'Behavioral anomaly detection',
      'Session monitoring',
      'Velocity analysis',
      'Fraud orchestration workflows',
      'Webhook delivery',
      'Team access',
      '90-day event history',
      'Priority support',
    ],
  },
  {
    id: 'enterprise', name: 'Enterprise',
    price: null, sub: null,
    subtitle: 'Advanced trust infrastructure for high-volume operations.',
    badge: null, featured: false, trialNote: null,
    cta: 'Contact Sales', ctaTo: 'mailto:sales@genuinux.io', external: true,
    features: [
      'Unlimited events',
      'Dedicated onboarding engineer',
      'Private Slack support',
      'Custom ML tuning',
      'Compliance assistance',
      'Multi-region deployment',
      'Dedicated account manager',
      'SSO & audit logs',
      'Advanced orchestration',
      'Dedicated infrastructure',
    ],
  },
]

const BLOG_POSTS = [
  { slug: 'detect-account-takeover', category: 'Fraud Detection',  date: 'May 12, 2026',   readTime: '5 min',
    title: 'How to detect account takeover before it happens',
    desc:  'An overview of behavioral signals that predict ATO attempts — and how to act on them in real time.' },
  { slug: 'cost-of-false-positives', category: 'Risk Strategy',    date: 'Apr 28, 2026',   readTime: '4 min',
    title: 'The true cost of false positives in fraud prevention',
    desc:  'Every blocked legitimate user has a cost. We break down how to measure it and optimize your thresholds.' },
  { slug: 'first-custom-fraud-rule', category: 'Developer Guide',  date: 'Apr 15, 2026',   readTime: '6 min',
    title: 'Building your first custom fraud rule with Genuinux',
    desc:  'A step-by-step guide to writing, testing, and deploying custom rules without touching your production code.' },
]

const TRUST_CARDS = [
  {
    icon: MessageSquare,
    title: 'Explainable decisions',
    desc: 'Every verdict comes with signals, risk reasons, and a plain-English recommendation. No black boxes — every decision can be justified to your team or your users.',
  },
  {
    icon: FileSearch,
    title: 'Audit-ready logs',
    desc: 'Rule changes, API key creation, and review actions are written to an immutable audit log. Built for teams that need a full chain of custody.',
  },
  {
    icon: Lock,
    title: 'Secure API keys',
    desc: 'Keys are SHA-256 hashed on creation. The raw value is shown exactly once and never stored. Revoke instantly from the dashboard.',
  },
  {
    icon: Users,
    title: 'Role-based access',
    desc: 'Owner, admin, and member roles control who can manage keys, webhooks, rules, and organization settings. Least-privilege by default.',
  },
  {
    icon: Shield,
    title: 'Privacy-first design',
    desc: 'You control what data you send. No PII is required. All signals are derived from what you explicitly provide — nothing is inferred or scraped.',
  },
  {
    icon: Eye,
    title: 'Safe rollout with Shadow Mode',
    desc: 'Run the full engine in observation mode before going live. Validate accuracy on real traffic without affecting a single user decision.',
  },
]

export default function Landing() {
  const [scrolled,         setScrolled]         = useState(false)
  const [hoveredModule,    setHoveredModule]    = useState<number | null>(null)
  const [hoveredVertical,  setHoveredVertical]  = useState<number | null>(null)
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false)
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

      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-shadow duration-200"
        style={{
          background: 'rgba(248,250,252,0.92)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${scrolled || mobileMenuOpen ? C.border : 'transparent'}`,
          boxShadow: scrolled ? '0 1px 20px rgba(15,23,42,0.06)' : 'none',
        }}>
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <Link to="/">
            <img src="/logo-horizontal.png" alt="Genuinux" style={{ height: '112px', display: 'block' }} />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(({ label, id }) => (
              <a key={label} href={`#${id}`}
                className="text-sm transition-colors duration-150"
                style={{ color: C.textSec }}
                onClick={e => { e.preventDefault(); scrollTo(id) }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                {label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={toggle}
              className="p-2 rounded-lg transition-colors duration-150 flex items-center justify-center"
              style={{ color: C.textSec, border: `1px solid ${C.border}` }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
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

          <button
            className="md:hidden p-2 rounded-lg transition-colors duration-150"
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
                  className="block px-3 py-2.5 rounded-lg text-sm transition-colors duration-150"
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
                className="flex-1 text-sm py-2.5 rounded-lg text-center font-bold"
                style={{ background: C.dark, color: '#FFFFFF' }}>
                Get started
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 flex flex-col items-center text-center overflow-hidden"
        style={{ background: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(22,199,132,0.07) 0%, transparent 65%), ${C.bg}` }}>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-7 anim-0"
          style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: C.trust, display: 'inline-block' }} />
          AI Trust Infrastructure
        </div>

        <h1 className="font-bold leading-none tracking-tight mb-6 anim-1"
          style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)', color: C.text }}>
          Block fraud.
          <br />
          <span style={{ color: C.trust }}>Not customers.</span>
        </h1>

        <p className="text-lg md:text-xl max-w-xl mx-auto leading-relaxed mb-4 anim-2" style={{ color: C.textSec }}>
          Real-time risk intelligence for every user, session, and event.
          Stop bad actors without adding friction for legitimate users.
        </p>

        <p className="text-sm mb-10 anim-2" style={{ color: C.textMut }}>
          Built for risk, product, and engineering teams — one API, full-stack protection.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mb-16 anim-3">
          <Link to="/register" className="btn-trust px-6 py-3 text-sm gap-2 rounded-lg">
            Start for free <ArrowRight size={15} />
          </Link>
          <Link to="/demo"
            className="px-6 py-3 text-sm flex items-center gap-2 rounded-lg transition-colors duration-150"
            style={{ color: C.textSec, border: `1px solid ${C.border}` }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
            Schedule a demo <ChevronRight size={13} />
          </Link>
        </div>

        <div className="flex gap-4 justify-center flex-wrap anim-4 w-full max-w-[580px] mx-auto">
          <AllowCard />
          <BlockCard />
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
          style={{ background: `linear-gradient(to bottom, transparent, ${C.bg})` }} />
      </section>

      {/* ── Built for trust ─────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              <Shield size={13} />
              Built for trust
            </div>
            <h2 className="font-bold mb-3"
              style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)', letterSpacing: '-0.03em', color: C.text }}>
              Security and transparency,
              <span style={{ color: C.trust }}> by design.</span>
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: C.textSec }}>
              Built for teams that need to move fast without cutting corners on auditability, explainability, or data control.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {TRUST_CARDS.map((card, i) => (
              <div key={i} className="p-6 rounded-2xl"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <card.icon size={15} style={{ color: C.trust }} />
                </div>
                <h3 className="text-sm font-bold mb-2" style={{ color: C.text }}>{card.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="font-bold mb-4"
            style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '-0.03em', color: C.text }}>
            Fraud no longer
            <br />
            <span style={{ color: C.trust }}>looks obvious.</span>
          </h2>
          <p className="text-base max-w-xl mx-auto leading-relaxed" style={{ color: C.textSec }}>
            Modern fraud hides in patterns — not individual bad transactions.
            By the time a static rule catches it, the damage is already done.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {PROBLEM_SIGNALS.map((p, i) => (
            <div key={i} className="p-6 rounded-2xl"
              style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: C.redBg, border: '1px solid rgba(239,68,68,0.15)' }}>
                <p.icon size={17} style={{ color: C.red }} />
              </div>
              <h3 className="text-sm font-bold mb-2" style={{ color: C.text }}>{p.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Platform Overview ──────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 w-full" style={{
              background: C.dark, borderRadius: '16px', border: `1px solid ${C.darkBd}`,
              boxShadow: C.shadowLg, minHeight: '340px', padding: '24px',
              position: 'relative', overflow: 'hidden',
            }}>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-3 h-3 rounded-full" style={{ background: '#EF4444' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#F59E0B' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#22C55E' }} />
                <div className="flex-1 mx-4 h-5 rounded" style={{ background: '#1E2D3D', maxWidth: '200px' }} />
              </div>
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Total Requests', val: '2.4M',   color: C.trust    },
                  { label: 'Fraud Blocked',  val: '18,293', color: '#EF4444'  },
                  { label: 'Avg Trust Score',val: '76.4',   color: '#60A5FA'  },
                ].map((m, i) => (
                  <div key={i} className="p-3 rounded-lg" style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}>
                    <p className="text-[10px] mb-1" style={{ color: '#94A3B8' }}>{m.label}</p>
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
                    style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}>
                    <p className="text-xs mono flex-1" style={{ color: '#94A3B8' }}>{r.id}</p>
                    <p className="text-xs" style={{ color: '#475569' }}>{r.ev}</p>
                    <p className="text-xs mono w-8 text-right" style={{ color: r.color }}>{r.score}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mono"
                      style={{ background: `${r.color}15`, color: r.color }}>{r.dec}</span>
                  </div>
                ))}
              </div>
              <div className="scan-anim" />
            </div>

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
                {['One integration, all risk signals unified', 'Real-time decisions, never batch-processed', 'Webhook alerts + dashboard for your team'].map((item, i) => (
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

      {/* ── Product Modules ──────────────────── id="product" */}
      <section id="product">
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
              <div key={i} className="p-6 rounded-2xl cursor-default"
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
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMut }}>{m.tag}</p>
                <h3 className="text-base font-bold mb-2 mono" style={{ color: C.text }}>{m.name}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built for Scale ──────────────────────────────────── */}
      <section style={{ background: C.dark }}>
        <div className="max-w-6xl mx-auto px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-center mb-10" style={{ color: '#475569' }}>
            Built for scale
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {SCALE_CLAIMS.map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl font-bold mono mb-1.5" style={{ color: i === 0 ? C.trust : '#FFFFFF' }}>
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
              Fraud patterns vary by industry. Genuinux ships pre-tuned signal weights and detection logic
              for each vertical — no starting from scratch.
            </p>
          </div>

          <div className="flex-1 grid md:grid-cols-2 gap-4">
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
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Developers ──────────────────────── id="developers" */}
      <section id="developers" className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-5"
            style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
            <Terminal size={13} />
            For Developers
          </div>
          <h2 className="font-bold"
            style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '-0.03em', color: C.text }}>
            Integrate in minutes.
            <span style={{ color: C.trust }}> Protect forever.</span>
          </h2>
          <p className="text-base mt-4 max-w-xl mx-auto" style={{ color: C.textSec }}>
            No infrastructure changes. No weeks of setup. One API call, any language.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-10">
          {[
            { n: '01', title: 'Install the SDK',       time: '2 minutes', desc: 'One package. Zero infrastructure changes. Works with any backend language.',            code: 'npm install @genuinux/sdk'                                  },
            { n: '02', title: 'Send your first event', time: '5 minutes', desc: "Call analyze() with a user ID, IP, and event type. That's it.",                        code: 'await genuinux.analyze({ user_id, event, ip })'             },
            { n: '03', title: 'Start blocking fraud',  time: 'Instant',   desc: 'Act on the decision in your own handler. Protected from the very first request.',      code: 'if (result.decision === "block") return 403'                },
          ].map((s, i) => (
            <div key={i}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold mono mb-5"
                style={{ border: `2px solid ${C.border}`, color: C.textSec, background: C.bg }}>
                {s.n}
              </div>
              <h3 className="text-lg font-bold mb-1" style={{ color: C.text }}>{s.title}</h3>
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
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            View full API documentation <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── Teams ────────────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <h2 className="font-bold"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '-0.03em', color: C.text }}>
              Built for the teams
              <span style={{ color: C.trust }}> who own trust.</span>
            </h2>
            <p className="text-base mt-4 max-w-xl mx-auto" style={{ color: C.textSec }}>
              Whether you're stopping fraud, analyzing risk, or writing the integration — Genuinux fits your workflow.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TEAMS.map((t, i) => (
              <div key={i} className="p-7 rounded-2xl"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
                  <t.icon size={17} style={{ color: C.trust }} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMut }}>For</p>
                <h3 className="text-lg font-bold mb-1.5" style={{ color: C.text }}>{t.role}</h3>
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

      {/* ── Pricing ──────────────────────────── id="pricing" */}
      <section id="pricing" style={{ background: C.bg, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-24">

          {/* Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              Pricing
            </div>
            <h2 className="font-bold"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '-0.03em', color: C.text }}>
              Simple, transparent pricing.
            </h2>
            <p className="text-base mt-4 max-w-md mx-auto" style={{ color: C.textSec }}>
              Three tiers. No contracts, no hidden fees. Cancel anytime.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:items-stretch">
            {PRICING_PLANS.map(plan => {
              const fg = plan.featured

              return (
                <div key={plan.id}
                  className="flex flex-col rounded-2xl transition-shadow duration-200"
                  style={fg ? {
                    background: C.dark,
                    border:     '1px solid rgba(22,199,132,0.28)',
                    boxShadow:  '0 0 0 1px rgba(22,199,132,0.06), 0 24px 56px rgba(22,199,132,0.11), 0 8px 20px rgba(15,23,42,0.32)',
                    padding:    '36px 32px',
                  } : {
                    background: C.surface,
                    border:     `1px solid ${C.border}`,
                    boxShadow:  C.shadow,
                    padding:    '32px 28px',
                  }}>

                  {/* Badge row — fixed height keeps plan name aligned across all cards */}
                  <div style={{ minHeight: 28, marginBottom: 20 }}>
                    {plan.badge && (
                      <div className="inline-flex text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                        style={{ background: C.trustBg, color: C.trust, border: `1px solid ${C.trustBd}` }}>
                        {plan.badge}
                      </div>
                    )}
                  </div>

                  {/* Plan name */}
                  <h3 className="font-bold mb-2"
                    style={{ fontSize: '1.125rem', letterSpacing: '-0.02em', color: fg ? '#FFFFFF' : C.text }}>
                    {plan.name}
                  </h3>

                  {/* Subtitle */}
                  <p className="text-sm leading-relaxed mb-5"
                    style={{ color: fg ? '#64748B' : C.textSec }}>
                    {plan.subtitle}
                  </p>

                  {/* Trial note — fixed height keeps price aligned */}
                  <div style={{ minHeight: 20, marginBottom: 8 }}>
                    {plan.trialNote && (
                      <p className="text-xs font-semibold" style={{ color: C.trust }}>
                        {plan.trialNote}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-1.5 mb-6" style={{ minHeight: 44 }}>
                    {plan.price
                      ? <>
                          <span className="font-black mono"
                            style={{ fontSize: fg ? '2.5rem' : '2rem', lineHeight: 1, color: fg ? '#FFFFFF' : C.text }}>
                            {plan.price}
                          </span>
                          <span className="text-sm font-medium" style={{ color: fg ? '#475569' : C.textMut }}>
                            {plan.sub}
                          </span>
                        </>
                      : <span className="text-lg font-semibold"
                          style={{ color: fg ? '#94A3B8' : C.text, paddingTop: 4 }}>
                          Custom pricing
                        </span>
                    }
                  </div>

                  {/* Divider */}
                  <div className="mb-6" style={{ height: 1, background: fg ? '#1E293B' : C.borderL }} />

                  {/* Feature list — flex-1 pushes CTA to bottom */}
                  <ul className="space-y-2.5 flex-1 mb-8">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm"
                        style={{ color: fg ? '#94A3B8' : C.textSec }}>
                        <CheckCircle size={13}
                          style={{ color: C.trust, flexShrink: 0, marginTop: 2 }} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {plan.external
                    ? <a href={plan.ctaTo}
                        className="text-sm font-bold py-3 rounded-xl text-center block transition-all duration-150"
                        style={{ background: C.dark, color: '#FFFFFF', border: `1px solid ${C.darkBd}` }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.trust; e.currentTarget.style.color = C.trust }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.darkBd; e.currentTarget.style.color = '#FFFFFF' }}>
                        {plan.cta}
                      </a>
                    : <Link to={plan.ctaTo}
                        className="text-sm font-bold py-3 rounded-xl text-center block transition-all duration-150"
                        style={fg
                          ? { background: C.trust, color: '#0F172A' }
                          : { border: `1px solid ${C.border}`, color: C.text, background: 'transparent' }
                        }
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

                  {/* No credit card note */}
                  {!plan.external && (
                    <p className="text-center text-xs mt-3"
                      style={{ color: fg ? '#334155' : C.textMut }}>
                      No credit card required
                    </p>
                  )}

                </div>
              )
            })}
          </div>

          {/* Volume note */}
          <p className="text-center text-sm mt-12" style={{ color: C.textMut }}>
            Need more volume?{' '}
            <span style={{ color: C.textSec }}>
              Additional events scale automatically as your platform grows.
            </span>{' '}
            <a href="mailto:sales@genuinux.io"
              className="font-semibold transition-opacity duration-150"
              style={{ color: C.trust }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Talk to us →
            </a>
          </p>

        </div>
      </section>

      {/* ── Blog ──────────────────────────────── id="blog" */}
      <section id="blog" style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-5"
              style={{ background: C.trustBg, border: `1px solid ${C.trustBd}`, color: C.trustT }}>
              <BookOpen size={13} />
              Blog
            </div>
            <h2 className="font-bold"
              style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', letterSpacing: '-0.03em', color: C.text }}>
              From the Genuinux team.
            </h2>
            <p className="text-base mt-2" style={{ color: C.textSec }}>
              Insights on fraud prevention, risk engineering, and building trustworthy platforms.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {BLOG_POSTS.map((post, i) => (
              <Link key={i} to={`/blog/${post.slug}`}
                className="p-6 rounded-2xl flex flex-col transition-all duration-150 group"
                style={{ background: C.bg, border: `1px solid ${C.border}`, boxShadow: C.shadow }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.trust)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={{ background: C.trustBg, color: C.trustT, border: `1px solid ${C.trustBd}` }}>
                    {post.category}
                  </span>
                  <span className="text-[10px]" style={{ color: C.textMut }}>{post.date} · {post.readTime}</span>
                </div>
                <h3 className="text-sm font-bold mb-3 leading-snug flex-1 transition-colors"
                  style={{ color: C.text }}>
                  {post.title}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSec }}>{post.desc}</p>
              </Link>
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
            Ready to trust
            <br />
            <span style={{ color: C.trust }}>every interaction?</span>
          </h2>
          <p className="text-lg mb-10 max-w-md mx-auto" style={{ color: '#94A3B8' }}>
            Start protecting your platform today. No contracts, no setup fees.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/register" className="btn-trust px-8 py-4 text-base gap-2 rounded-xl inline-flex">
              Start for free <ArrowRight size={18} />
            </Link>
            <Link to="/demo"
              className="px-8 py-4 text-base flex items-center gap-2 rounded-xl transition-all duration-150"
              style={{ color: '#94A3B8', border: '1px solid #334155' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#475569' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#334155' }}>
              Schedule a demo <ChevronRight size={16} />
            </Link>
          </div>
          <p className="text-xs mt-6" style={{ color: '#475569' }}>
            No credit card required · Free tier available · 5-minute setup
          </p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="mb-4">
                <img src="/logo-color.png" alt="Genuinux" style={{ height: '112px', display: 'block' }} />
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
                { label: 'About',    href: 'mailto:hello@genuinux.io' },
                { label: 'Blog',     href: '/blog/detect-account-takeover' },
                { label: 'Careers',  href: 'mailto:careers@genuinux.io' },
                { label: 'Press',    href: 'mailto:press@genuinux.io' },
              ]},
              { title: 'Developers', links: [
                { label: 'Documentation', href: '/docs' },
                { label: 'API Reference', href: '/docs' },
                { label: 'Live Demo',     href: '/demo' },
                { label: 'Changelog',     href: 'mailto:hello@genuinux.io' },
              ]},
            ] as { title: string; links: { label: string; href: string }[] }[]).map((col, i) => (
              <div key={i}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: C.textSec }}>
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
            <p className="text-xs" style={{ color: C.textSec }}>© 2026 Genuinux. AI Trust Infrastructure.</p>
            <div className="flex items-center gap-6">
              {([
                { label: 'Privacy',  to: '/privacy' },
                { label: 'Terms',    to: '/terms' },
                { label: 'Security', to: 'mailto:security@genuinux.io', external: true },
              ] as { label: string; to: string; external?: boolean }[]).map(l => (
                l.external
                  ? <a key={l.label} href={l.to} className="text-xs transition-colors duration-150"
                      style={{ color: C.textSec }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                      onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                      {l.label}
                    </a>
                  : <Link key={l.label} to={l.to} className="text-xs transition-colors duration-150"
                      style={{ color: C.textSec, textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                      onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
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
