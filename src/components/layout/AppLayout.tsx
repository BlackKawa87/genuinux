import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Shield, LayoutDashboard, Key, Activity, ListChecks,
  Users, Settings, LogOut, Globe, GitBranch, BookOpen,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const NAV_TOP = [
  { to: '/dashboard',             icon: LayoutDashboard, label: 'Overview'      },
  { to: '/dashboard/events',      icon: Activity,        label: 'Risk Events'   },
  { to: '/dashboard/users',       icon: Users,           label: 'Users'         },
  { to: '/dashboard/queue',       icon: ListChecks,      label: 'Review Queue'  },
  { to: '/dashboard/rules',       icon: GitBranch,       label: 'Rules'         },
  { to: '/dashboard/api-keys',    icon: Key,             label: 'API Keys'      },
  { to: '/dashboard/webhooks',    icon: Globe,           label: 'Webhooks'      },
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
          className="flex items-center gap-3 px-5 py-[18px] flex-shrink-0"
          style={{ borderBottom: '1px solid #1E2D3D' }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(22,199,132,0.08)',
              border: '1px solid rgba(22,199,132,0.2)',
            }}
          >
            <Shield size={14} style={{ color: '#16C784' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-none" style={{ color: '#FFFFFF' }}>
              Genuinux
            </p>
            <p className="text-[10px] mt-0.5 mono flex items-center gap-1" style={{ color: '#16C784' }}>
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current" />
              Live
            </p>
          </div>
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
              <p className="text-[10px] mt-0.5 mono capitalize" style={{ color: '#475569' }}>
                {plan} plan
              </p>
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
          <a
            href="https://docs.genuinux.io"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item"
          >
            <BookOpen size={14} />
            <span>Documentation</span>
          </a>
          <Link to="/dashboard/settings" className={`nav-item${isActive('/dashboard/settings') ? ' active' : ''}`}>
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
      <main className="flex-1 min-h-screen overflow-x-hidden" style={{ marginLeft: '220px' }}>
        <Outlet />
      </main>
    </div>
  )
}
