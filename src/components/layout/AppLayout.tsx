import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Key, Activity, ListChecks,
  Users, Settings, LogOut, Globe, GitBranch, BookOpen,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const NAV_TOP = [
  { to: '/dashboard',          icon: LayoutDashboard, label: 'Overview'      },
  { to: '/dashboard/events',   icon: Activity,        label: 'Risk Events'   },
  { to: '/dashboard/users',    icon: Users,           label: 'Users'         },
  { to: '/dashboard/queue',    icon: ListChecks,      label: 'Review Queue'  },
  { to: '/dashboard/rules',    icon: GitBranch,       label: 'Rules'         },
  { to: '/dashboard/api-keys', icon: Key,             label: 'API Keys'      },
  { to: '/dashboard/webhooks', icon: Globe,           label: 'Webhooks'      },
]

export default function AppLayout() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user, signOut } = useAuth()

  const [orgName, setOrgName] = useState<string>('')
  const [plan,    setPlan]    = useState<string>('')

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!profile?.organization_id) return

      const { data: org } = await supabase
        .from('organizations')
        .select('name, plan')
        .eq('id', profile.organization_id)
        .single()

      if (org) {
        setOrgName(org.name as string)
        setPlan(org.plan as string)
      }
    })()
  }, [user])

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === path
      : location.pathname.startsWith(path)

  const currentPage = NAV_TOP.find(n => isActive(n.to))?.label ?? 'Dashboard'

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen" style={{ background: '#050B14' }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className="fixed left-0 top-0 h-screen w-[220px] flex flex-col z-30"
        style={{ background: '#07111F', borderRight: '1px solid #1E2D3D' }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #1E2D3D' }}
        >
          <img
            src="/logo-full.png"
            alt="Genuinux"
            style={{ height: '32px', display: 'block', filter: 'brightness(0) invert(1)' }}
          />
          <p className="text-[10px] mono flex items-center gap-1" style={{ color: '#16C784' }}>
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
            Live
          </p>
        </div>

        {/* Org badge */}
        {orgName && (
          <div
            className="mx-3 mt-3 px-3 py-2 rounded-lg flex-shrink-0"
            style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}
          >
            <p className="text-xs font-semibold truncate" style={{ color: '#E2E8F0' }}>
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
          {NAV_TOP.map(item => (
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
          style={{ borderTop: '1px solid #1E2D3D' }}
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
            style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}
          >
            <p className="text-xs truncate mono mb-2" style={{ color: '#475569' }}>
              {user?.email}
            </p>
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
            background: 'rgba(7,17,31,0.95)',
            borderBottom: '1px solid #1E2D3D',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs" style={{ color: '#475569' }}>
            <span style={{ color: '#2D4057' }}>Dashboard</span>
            <ChevronRight size={12} style={{ color: '#2D4057' }} />
            <span style={{ color: '#94A3B8' }}>{currentPage}</span>
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
                <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>
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

            <div
              className="w-px h-3.5 flex-shrink-0"
              style={{ background: '#1E2D3D' }}
            />

            <span className="flex items-center gap-1.5 text-xs mono" style={{ color: '#16C784' }}>
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
              Live
            </span>
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
