import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Key, Activity, ListChecks,
  Users, Settings, LogOut, Globe, GitBranch, BookOpen,
  ChevronRight, BarChart2, Sun, Moon, AlertTriangle,
  ShieldCheck, Server, FlaskConical, BrainCircuit, Menu, X, Shield,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import { supabase } from '../../lib/supabase'
import { can, ROLE_META } from '../../lib/permissions'
import { useWindowSize } from '../../hooks/useWindowSize'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  permission: string | null
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Intelligence',
    items: [
      { to: '/dashboard',           icon: LayoutDashboard, label: 'Overview',     permission: null },
      { to: '/dashboard/events',    icon: Activity,        label: 'Risk Events',  permission: null },
      { to: '/dashboard/users',     icon: Users,           label: 'Users',        permission: 'act_queue' },
      { to: '/dashboard/queue',     icon: ListChecks,      label: 'Review Queue', permission: 'act_queue' },
      { to: '/dashboard/analytics', icon: BarChart2,       label: 'Analytics',       permission: null },
      { to: '/dashboard/ml',        icon: BrainCircuit,    label: 'Machine Learning', permission: null },
    ],
  },
  {
    label: 'Controls',
    items: [
      { to: '/dashboard/rules',    icon: GitBranch, label: 'Rules',    permission: 'manage_rules' },
      { to: '/dashboard/api-keys', icon: Key,       label: 'API Keys', permission: 'manage_api_keys' },
      { to: '/dashboard/webhooks', icon: Globe,     label: 'Webhooks', permission: 'manage_webhooks' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/dashboard/infrastructure', icon: Server,       label: 'Infrastructure', permission: 'owner_only' },
      { to: '/dashboard/ops',            icon: FlaskConical, label: 'Beta Ops',       permission: 'owner_only' },
    ],
  },
]

const BETA_LIMITS: Record<string, number> = {
  free: 1_000, starter: 10_000, growth: 50_000,
  pro: 50_000, enterprise: 500_000,
}

const SIDEBAR_W = 216

export default function AppLayout() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user, profile, signOut } = useAuth()
  const T = useT()

  const [orgName,      setOrgName]      = useState('')
  const [plan,         setPlan]         = useState('')
  const [shadowMode,   setShadowMode]   = useState(true)
  const [monthlyUsed,  setMonthlyUsed]  = useState(0)
  const [monthlyLimit, setMonthlyLimit] = useState(Infinity)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)

  const { isMobile } = useWindowSize()

  const role     = profile?.role ?? null
  const roleMeta = ROLE_META[role ?? ''] ?? null

  const filteredGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item =>
      item.permission === null || can(role, item.permission as Parameters<typeof can>[1])
    ),
  })).filter(g => g.items.length > 0)

  useEffect(() => {
    if (!profile?.organization_id) return
    const orgId = profile.organization_id

    void supabase
      .from('organizations')
      .select('name, plan, shadow_mode')
      .eq('id', orgId)
      .single()
      .then(({ data: org }) => {
        if (!org) return
        const p = org.plan as string
        setOrgName(org.name as string)
        setPlan(p)
        setShadowMode(Boolean((org as { shadow_mode?: boolean }).shadow_mode))
        const limit = BETA_LIMITS[p] ?? Infinity
        setMonthlyLimit(limit)
        if (isFinite(limit)) {
          const som = new Date()
          som.setDate(1); som.setHours(0, 0, 0, 0)
          void supabase
            .from('risk_events')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .gte('created_at', som.toISOString())
            .then(({ count }) => setMonthlyUsed(count ?? 0))
        }
      })
  }, [profile?.organization_id])

  // Close sidebar on navigation (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === path
      : location.pathname.startsWith(path)

  const currentPage = NAV_GROUPS.flatMap(g => g.items).find(n => isActive(n.to))?.label ?? 'Dashboard'

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const usagePct  = isFinite(monthlyLimit) && monthlyLimit > 0 ? monthlyUsed / monthlyLimit : 0
  const nearLimit = usagePct >= 0.8 && usagePct < 1
  const atLimit   = usagePct >= 1

  /* Environment is the most consequential piece of state in the header: it
     tells the operator whether decisions are being enforced on real users. */
  const envTone = shadowMode
    ? { ink: T.infoText,    fill: T.info,    label: 'Shadow' }
    : { ink: T.successText, fill: T.success, label: 'Live'  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>

      {/* ── Mobile backdrop ──────────────────────────────────────────────── */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, background: T.overlay, zIndex: 199 }}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        aria-label="Main navigation"
        style={{
          position: 'fixed', left: 0, top: 0,
          height: '100vh', width: SIDEBAR_W,
          display: 'flex', flexDirection: 'column',
          transform: isMobile && !sidebarOpen ? `translateX(-${SIDEBAR_W}px)` : 'translateX(0)',
          transition: `transform ${T.dSlow} ${T.ease}`,
          zIndex: isMobile ? 200 : 30,
          background: T.card,
          borderRight: `1px solid ${T.border}`,
        }}
      >
        {/* Brand. Sized to sit level with the header rule opposite it. */}
        <div
          style={{
            height: 52, padding: '0 14px', flexShrink: 0,
            display: 'flex', alignItems: 'center',
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center' }} aria-label="Genuinux dashboard">
            <img
              src="/logo-horizontal.png"
              alt="Genuinux"
              style={{ height: 26, display: 'block', filter: T.dark ? 'brightness(0) invert(1)' : 'none' }}
            />
          </Link>
        </div>

        {/* Organisation. A quiet line of context, not a boxed widget. */}
        {orgName && (
          <div style={{ padding: '14px 14px 10px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 20, height: 20, flexShrink: 0,
                  borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: T.trustDim, border: `1px solid ${T.trustBd}`,
                  color: T.trustText, fontSize: 10, fontWeight: 700,
                }}
              >
                {orgName.charAt(0).toUpperCase()}
              </span>
              <span
                className="t-subhead"
                style={{ color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={orgName}
              >
                {orgName}
              </span>
            </div>
            {plan && (
              <p className="t-label" style={{ color: T.textDim, marginTop: 6, paddingLeft: 28 }}>
                {plan} plan
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="g-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
          {filteredGroups.map((group, gi) => (
            <div key={group.label} style={{ marginTop: gi > 0 ? 20 : 0 }}>
              <p className="t-label" style={{ padding: '0 9px', marginBottom: 6, color: T.textDim }}>
                {group.label}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {group.items.map(item => {
                  const active = isActive(item.to)
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`nav-item${active ? ' active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <item.icon size={14} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Secondary links + account */}
        <div style={{ padding: '8px 12px 12px', flexShrink: 0, borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 8 }}>
            <Link to="/docs" className="nav-item">
              <BookOpen size={14} />
              <span>Documentation</span>
            </Link>
            <Link
              to="/dashboard/settings"
              className={`nav-item${isActive('/dashboard/settings') ? ' active' : ''}`}
              aria-current={isActive('/dashboard/settings') ? 'page' : undefined}
            >
              <Settings size={14} />
              <span>Settings</span>
            </Link>
          </div>

          {/* Account. Bare row — the sidebar edge already frames it. */}
          <div style={{ padding: '0 9px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span
                className="mono"
                style={{
                  fontSize: 11, color: T.textDim, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                title={user?.email}
              >
                {user?.email}
              </span>
              {roleMeta && (
                <span
                  style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                    padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                    background: roleMeta.bg, color: roleMeta.color,
                  }}
                >
                  {roleMeta.label}
                </span>
              )}
            </div>
            <button
              onClick={() => void handleSignOut()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: T.textDim,
                background: 'none', border: 0, padding: 0, cursor: 'pointer',
                transition: `color ${T.dFast} ${T.ease}`,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = T.dangerText)}
              onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
            >
              <LogOut size={11} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh',
          marginLeft: isMobile ? 0 : SIDEBAR_W,
          minWidth: 0,
        }}
      >
        {/* Header. Left: where you are. Right: what state the system is in.
            Three groups, one divider — not five chips competing for attention. */}
        <header
          style={{
            position: 'sticky', top: 0, zIndex: 20, flexShrink: 0,
            height: 52, padding: '0 var(--page-x)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            background: T.headerBg,
            borderBottom: `1px solid ${T.border}`,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(o => !o)}
                aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={sidebarOpen}
                className="btn btn-ghost btn-sm btn-icon"
              >
                {sidebarOpen ? <X size={17} /> : <Menu size={17} />}
              </button>
            )}
            <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span className="t-meta" style={{ color: T.textDim, display: isMobile ? 'none' : 'inline' }}>
                Dashboard
              </span>
              <ChevronRight
                size={12}
                style={{ color: T.textDim, flexShrink: 0, display: isMobile ? 'none' : 'block' }}
                aria-hidden="true"
              />
              <span
                className="t-subhead"
                style={{ color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {currentPage}
              </span>
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Environment — the one status that always earns header space. */}
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: envTone.ink }}
              title={shadowMode
                ? 'Shadow mode: decisions are recorded but not enforced'
                : 'Live mode: block and review decisions are enforced'}
            >
              <span
                className="pulse-dot"
                style={{ width: 6, height: 6, borderRadius: 999, background: envTone.fill, flexShrink: 0 }}
              />
              {envTone.label}
            </span>

            <span aria-hidden="true" style={{ width: 1, height: 14, background: T.border }} />

            {profile?.is_platform_admin && (
              <Link
                to="/admin"
                className="btn btn-ghost btn-sm"
                style={{ color: T.warningText, display: isMobile ? 'none' : 'inline-flex' }}
                title="Platform administration"
              >
                <Shield size={12} />
                Admin
              </Link>
            )}

            <button
              onClick={T.toggle}
              className="btn btn-ghost btn-sm btn-icon"
              aria-label={T.dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {T.dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </header>

        {/* ── Safety banners ─────────────────────────────────────────────── */}
        {!shadowMode && (
          <div
            role="status"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px var(--page-x)', fontSize: 12,
              background: T.successDim,
              borderBottom: `1px solid ${T.successBd}`,
              color: T.successText,
            }}
          >
            <ShieldCheck size={13} style={{ flexShrink: 0 }} />
            <span>
              <strong style={{ fontWeight: 600 }}>Live mode active</strong>
              {' — '}block and review decisions are enforced in real time.{' '}
              <Link to="/dashboard/settings?tab=risk" style={{ color: 'inherit', textDecoration: 'underline' }}>
                Pause in Settings
              </Link>
            </span>
          </div>
        )}
        {nearLimit && (
          <div
            role="status"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px var(--page-x)', fontSize: 12,
              background: T.warningDim,
              borderBottom: `1px solid ${T.warningBd}`,
              color: T.warningText,
            }}
          >
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            <span>
              <strong style={{ fontWeight: 600 }}>{Math.round(usagePct * 100)}% of monthly limit used</strong>
              {' '}({monthlyUsed.toLocaleString()} / {monthlyLimit.toLocaleString()}).{' '}
              <Link to="/dashboard/settings?tab=billing" style={{ color: 'inherit', textDecoration: 'underline' }}>
                Upgrade
              </Link>
            </span>
          </div>
        )}
        {atLimit && (
          <div
            role="alert"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px var(--page-x)', fontSize: 12,
              background: T.dangerDim,
              borderBottom: `1px solid ${T.dangerBd}`,
              color: T.dangerText,
            }}
          >
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            <span>
              <strong style={{ fontWeight: 600 }}>Monthly event limit reached.</strong>
              {' '}The API is returning 429 for new events.{' '}
              <Link to="/dashboard/settings?tab=billing" style={{ color: 'inherit', textDecoration: 'underline' }}>
                Upgrade now
              </Link>
            </span>
          </div>
        )}

        <main style={{ flex: 1, overflowX: 'hidden', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
