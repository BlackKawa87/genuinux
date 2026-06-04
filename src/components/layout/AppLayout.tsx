import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Key, Activity, ListChecks,
  Users, Settings, LogOut, Globe, GitBranch, BookOpen,
  ChevronRight, BarChart2, Sun, Moon, AlertTriangle,
  ShieldCheck, Server, FlaskConical,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'
import { can, ROLE_META } from '../../lib/permissions'

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
      { to: '/dashboard/analytics', icon: BarChart2,       label: 'Analytics',    permission: null },
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

export default function AppLayout() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user, profile, signOut } = useAuth()
  const { theme, toggle } = useTheme()

  const [orgName,      setOrgName]      = useState('')
  const [plan,         setPlan]         = useState('')
  const [shadowMode,   setShadowMode]   = useState(true)
  const [monthlyUsed,  setMonthlyUsed]  = useState(0)
  const [monthlyLimit, setMonthlyLimit] = useState(Infinity)

  const role     = profile?.role ?? null
  const roleMeta = ROLE_META[role ?? ''] ?? null
  const dark     = theme === 'dark'

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.organization_id])

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === path
      : location.pathname.startsWith(path)

  const currentPage = NAV_GROUPS.flatMap(g => g.items).find(n => isActive(n.to))?.label ?? 'Dashboard'

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  // Design tokens
  const S = {
    outer:         dark ? '#07080C'             : '#F1F4FA',
    sidebar:       dark ? '#09101A'             : '#FFFFFF',
    sidebarBorder: dark ? '#182030'             : '#D8DCEC',
    header:        dark ? 'rgba(9,16,26,0.97)'  : 'rgba(255,255,255,0.96)',
    headerBorder:  dark ? '#182030'             : '#D8DCEC',
    orgCard:       dark ? '#0E1520'             : '#F1F4FA',
    orgCardBorder: dark ? '#182030'             : '#D8DCEC',
    orgName:       dark ? '#ECF0FA'             : '#07090F',
    logoFilter:    dark ? 'brightness(0) invert(1)' : 'none',
    pageTitle:     dark ? '#ECF0FA'             : '#07090F',
    pageSub:       dark ? '#475569'             : '#9BA4BC',
    divider:       dark ? '#182030'             : '#D8DCEC',
    toggleColor:   dark ? '#8B9BB8'             : '#5B6480',
    groupLabel:    dark ? '#2E3F54'             : '#9BA4BC',
    liveColor:     '#16C784',
    shadowColor:   '#38BDF8',
  }

  const usagePct  = isFinite(monthlyLimit) && monthlyLimit > 0 ? monthlyUsed / monthlyLimit : 0
  const nearLimit = usagePct >= 0.8 && usagePct < 1
  const atLimit   = usagePct >= 1

  return (
    <div className="flex min-h-screen" style={{ background: S.outer }}>

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside
        className="fixed left-0 top-0 h-screen w-[216px] flex flex-col z-30"
        style={{ background: S.sidebar, borderRight: `1px solid ${S.sidebarBorder}` }}
      >
        {/* Logo + mode */}
        <div className="flex items-center justify-between px-4 py-3.5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${S.sidebarBorder}` }}>
          <img
            src="/logo-horizontal.png"
            alt="Genuinux"
            style={{ height: 64, display: 'block', filter: S.logoFilter }}
          />
          <span className="flex items-center gap-1 text-[9px] mono flex-shrink-0"
            style={{ color: shadowMode ? S.shadowColor : S.liveColor }}>
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
            {shadowMode ? 'Shadow' : 'Live'}
          </span>
        </div>

        {/* Org badge */}
        {orgName && (
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-lg flex-shrink-0 flex items-center justify-between"
            style={{ background: S.orgCard, border: `1px solid ${S.orgCardBorder}` }}>
            <p className="text-xs font-semibold truncate" style={{ color: S.orgName }}>
              {orgName}
            </p>
            {plan && (
              <span className="text-[9px] mono px-1.5 py-0.5 rounded flex-shrink-0 ml-2"
                style={{
                  background: 'rgba(22,199,132,0.09)',
                  color: '#16C784',
                  border: '1px solid rgba(22,199,132,0.2)',
                }}>
                {plan.toUpperCase()}
              </span>
            )}
          </div>
        )}

        {/* Nav groups */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {filteredGroups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-5' : ''}>
              <p className="px-2 mb-1.5 text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: S.groupLabel, letterSpacing: '0.1em' }}>
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`nav-item${isActive(item.to) ? ' active' : ''}`}
                  >
                    <item.icon size={14} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-3 pt-2 flex-shrink-0 space-y-0.5"
          style={{ borderTop: `1px solid ${S.sidebarBorder}` }}>
          <Link to="/docs" className="nav-item">
            <BookOpen size={14} />
            <span>Documentation</span>
          </Link>
          <Link
            to="/dashboard/settings"
            className={`nav-item${isActive('/dashboard/settings') ? ' active' : ''}`}
          >
            <Settings size={14} />
            <span>Settings</span>
          </Link>

          {/* User card */}
          <div className="mt-2 px-3 py-2.5 rounded-lg"
            style={{ background: S.orgCard, border: `1px solid ${S.orgCardBorder}` }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] mono truncate" style={{ color: S.pageSub, maxWidth: '120px' }}>
                {user?.email}
              </p>
              {roleMeta && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ml-1"
                  style={{ background: roleMeta.bg, color: roleMeta.color }}>
                  {roleMeta.label}
                </span>
              )}
            </div>
            <button
              onClick={() => void handleSignOut()}
              className="flex items-center gap-1.5 text-[11px] transition-colors duration-150"
              style={{ color: S.pageSub }}
              onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
              onMouseLeave={e => (e.currentTarget.style.color = S.pageSub)}
            >
              <LogOut size={11} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: '216px' }}>

        {/* Header */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between px-7 flex-shrink-0"
          style={{
            height: 52,
            background: S.header,
            borderBottom: `1px solid ${S.headerBorder}`,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          {/* Page title */}
          <div className="flex items-center gap-2 text-xs" style={{ color: S.pageSub }}>
            <span>Dashboard</span>
            <ChevronRight size={11} style={{ color: S.pageSub }} />
            <span className="font-semibold" style={{ color: S.pageTitle }}>{currentPage}</span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-4">
            {orgName && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold"
                  style={{ background: 'rgba(22,199,132,0.1)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)' }}>
                  {orgName.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium" style={{ color: S.pageTitle }}>{orgName}</span>
                {plan && (
                  <span className="text-[9px] mono px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(22,199,132,0.07)', color: '#16C784', border: '1px solid rgba(22,199,132,0.15)' }}>
                    {plan.toUpperCase()}
                  </span>
                )}
              </div>
            )}

            <div className="w-px h-3.5 flex-shrink-0" style={{ background: S.divider }} />

            <span className="text-[9px] mono px-1.5 py-0.5 rounded font-semibold"
              style={{ background: 'rgba(245,158,11,0.07)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.18)' }}>
              CONTROLLED BETA
            </span>

            <div className="w-px h-3.5 flex-shrink-0" style={{ background: S.divider }} />

            <span className="flex items-center gap-1.5 text-xs mono"
              style={{ color: shadowMode ? S.shadowColor : S.liveColor }}>
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
              {shadowMode ? 'Shadow' : 'Live'}
            </span>

            <div className="w-px h-3.5 flex-shrink-0" style={{ background: S.divider }} />

            <button
              onClick={toggle}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-opacity duration-150 hover:opacity-60"
              style={{ color: S.toggleColor }}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </header>

        {/* Safety banners */}
        {!shadowMode && (
          <div className="flex items-center gap-2 px-7 py-2 text-xs"
            style={{ background: 'rgba(22,199,132,0.05)', borderBottom: '1px solid rgba(22,199,132,0.14)', color: '#16C784' }}>
            <ShieldCheck size={11} />
            <span>
              <strong>Live Mode active</strong> — block and review decisions are enforced in real time.{' '}
              <Link to="/dashboard/settings?tab=risk" style={{ color: '#16C784', textDecoration: 'underline' }}>
                Settings → Risk
              </Link>{' '}
              to pause.
            </span>
          </div>
        )}
        {nearLimit && (
          <div className="flex items-center gap-2 px-7 py-2 text-xs"
            style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.18)', color: '#B45309' }}>
            <AlertTriangle size={11} />
            <span>
              <strong>{Math.round(usagePct * 100)}% of monthly limit used</strong>{' '}
              ({monthlyUsed.toLocaleString()} / {monthlyLimit.toLocaleString()}).{' '}
              <Link to="/dashboard/settings?tab=billing" style={{ color: '#D97706', textDecoration: 'underline' }}>
                Upgrade →
              </Link>
            </span>
          </div>
        )}
        {atLimit && (
          <div className="flex items-center gap-2 px-7 py-2 text-xs"
            style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.18)', color: '#DC2626' }}>
            <AlertTriangle size={11} />
            <span>
              <strong>Monthly event limit reached.</strong>{' '}
              API returning 429 for new events.{' '}
              <Link to="/dashboard/settings?tab=billing" style={{ color: '#DC2626', textDecoration: 'underline' }}>
                Upgrade now →
              </Link>
            </span>
          </div>
        )}

        <main className="flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
