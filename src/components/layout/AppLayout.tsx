import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Key, Activity, ListChecks,
  Users, Settings, LogOut, Globe, GitBranch, BookOpen,
  ChevronRight, BarChart2, Sun, Moon,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'
import { can, ROLE_META } from '../../lib/permissions'

const NAV_ALL = [
  { to: '/dashboard',            icon: LayoutDashboard, label: 'Overview',      permission: null               },
  { to: '/dashboard/events',     icon: Activity,        label: 'Risk Events',   permission: null               },
  { to: '/dashboard/users',      icon: Users,           label: 'Users',         permission: 'act_queue'        },
  { to: '/dashboard/queue',      icon: ListChecks,      label: 'Review Queue',  permission: 'act_queue'        },
  { to: '/dashboard/analytics',  icon: BarChart2,       label: 'Analytics',     permission: null               },
  { to: '/dashboard/rules',      icon: GitBranch,       label: 'Rules',         permission: 'manage_rules'     },
  { to: '/dashboard/api-keys',   icon: Key,             label: 'API Keys',      permission: 'manage_api_keys'  },
  { to: '/dashboard/webhooks',   icon: Globe,           label: 'Webhooks',      permission: 'manage_webhooks'  },
] as const

export default function AppLayout() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user, profile, signOut } = useAuth()
  const { theme, toggle } = useTheme()

  const [orgName, setOrgName] = useState<string>('')
  const [plan,    setPlan]    = useState<string>('')

  const role    = profile?.role ?? null
  const roleMeta = ROLE_META[role ?? ''] ?? null

  const navItems = NAV_ALL.filter(item =>
    item.permission === null || can(role, item.permission as Parameters<typeof can>[1])
  )

  useEffect(() => {
    if (!profile?.organization_id) return
    void supabase
      .from('organizations')
      .select('name, plan')
      .eq('id', profile.organization_id)
      .single()
      .then(({ data: org }) => {
        if (org) {
          setOrgName(org.name as string)
          setPlan(org.plan as string)
        }
      })
  }, [profile?.organization_id])

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === path
      : location.pathname.startsWith(path)

  const currentPage = NAV_ALL.find(n => isActive(n.to))?.label ?? 'Dashboard'

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const dark = theme === 'dark'

  const S = {
    outer:           dark ? '#050B14'               : '#F8FAFC',
    sidebar:         dark ? '#07111F'               : '#FFFFFF',
    sidebarBorder:   dark ? '#1E2D3D'               : '#E2E8F0',
    header:          dark ? 'rgba(7,17,31,0.95)'    : 'rgba(255,255,255,0.95)',
    headerBorder:    dark ? '#1E2D3D'               : '#E2E8F0',
    orgCard:         dark ? '#0B1220'               : '#F8FAFC',
    orgCardBorder:   dark ? '#1E2D3D'               : '#E2E8F0',
    orgName:         dark ? '#E2E8F0'               : '#0F172A',
    logoFilter:      dark ? 'brightness(0) invert(1)' : 'none',
    breadcrumbDim:   dark ? '#2D4057'               : '#94A3B8',
    breadcrumbPage:  dark ? '#94A3B8'               : '#0F172A',
    divider:         dark ? '#1E2D3D'               : '#E2E8F0',
    toggleColor:     dark ? '#94A3B8'               : '#64748B',
    liveColor:       '#16C784',
  }

  return (
    <div className="flex min-h-screen" style={{ background: S.outer }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className="fixed left-0 top-0 h-screen w-[220px] flex flex-col z-30"
        style={{ background: S.sidebar, borderRight: `1px solid ${S.sidebarBorder}` }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: `1px solid ${S.sidebarBorder}` }}
        >
          <img
            src="/logo-horizontal.png"
            alt="Genuinux"
            style={{ height: '44px', display: 'block', filter: S.logoFilter }}
          />
          <p className="text-[10px] mono flex items-center gap-1" style={{ color: S.liveColor }}>
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
            Live
          </p>
        </div>

        {/* Org badge */}
        {orgName && (
          <div
            className="mx-3 mt-3 px-3 py-2 rounded-lg flex-shrink-0"
            style={{ background: S.orgCard, border: `1px solid ${S.orgCardBorder}` }}
          >
            <p className="text-xs font-semibold truncate" style={{ color: S.orgName }}>
              {orgName}
            </p>
            {plan && (
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className="text-[9px] mono px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(22,199,132,0.08)',
                    color: '#16C784',
                    border: '1px solid rgba(22,199,132,0.15)',
                  }}
                >
                  {plan.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-item${isActive(item.to) ? ' active' : ''}`}
            >
              <item.icon size={14} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div
          className="px-3 pb-3 pt-2 flex-shrink-0 space-y-0.5"
          style={{ borderTop: `1px solid ${S.sidebarBorder}` }}
        >
          <Link
            to="/docs"
            className="nav-item"
          >
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
          <div
            className="mt-2 px-3 py-2.5 rounded-lg"
            style={{ background: S.orgCard, border: `1px solid ${S.orgCardBorder}` }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs truncate mono" style={{ color: '#475569', maxWidth: '120px' }}>
                {user?.email}
              </p>
              {roleMeta && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ml-1"
                  style={{ background: roleMeta.bg, color: roleMeta.color }}
                >
                  {roleMeta.label}
                </span>
              )}
            </div>
            <button
              onClick={() => void handleSignOut()}
              className="flex items-center gap-2 text-xs transition-colors duration-150"
              style={{ color: '#475569' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: '220px' }}>

        {/* Top bar */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between px-7 flex-shrink-0"
          style={{
            height: 52,
            background: S.header,
            borderBottom: `1px solid ${S.headerBorder}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs" style={{ color: S.breadcrumbDim }}>
            <span style={{ color: S.breadcrumbDim }}>Dashboard</span>
            <ChevronRight size={12} style={{ color: S.breadcrumbDim }} />
            <span style={{ color: S.breadcrumbPage }}>{currentPage}</span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-5">
            {orgName && (
              <div className="hidden sm:flex items-center gap-2.5">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: 'rgba(22,199,132,0.1)',
                    color: '#16C784',
                    border: '1px solid rgba(22,199,132,0.2)',
                  }}
                >
                  {orgName.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium" style={{ color: S.breadcrumbPage }}>
                  {orgName}
                </span>
                {plan && (
                  <span
                    className="text-[9px] mono px-1.5 py-0.5 rounded"
                    style={{
                      background: 'rgba(22,199,132,0.06)',
                      color: '#16C784',
                      border: '1px solid rgba(22,199,132,0.12)',
                    }}
                  >
                    {plan.toUpperCase()}
                  </span>
                )}
              </div>
            )}

            <div className="w-px h-3.5 flex-shrink-0" style={{ background: S.divider }} />

            <span className="flex items-center gap-1.5 text-xs mono" style={{ color: S.liveColor }}>
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
              Live
            </span>

            <div className="w-px h-3.5 flex-shrink-0" style={{ background: S.divider }} />

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="flex items-center justify-center w-7 h-7 rounded-md transition-opacity duration-150 hover:opacity-70"
              style={{ color: S.toggleColor }}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
