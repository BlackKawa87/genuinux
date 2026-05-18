import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Shield,
  LayoutDashboard,
  Key,
  Activity,
  BarChart2,
  Settings,
  LogOut,
  BookOpen,
  Users,
  ListChecks,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  { to: '/dashboard',           icon: LayoutDashboard, label: 'Overview' },
  { to: '/dashboard/api-keys',  icon: Key,             label: 'API Keys' },
  { to: '/dashboard/events',    icon: Activity,        label: 'Events',    soon: true },
  { to: '/dashboard/queue',     icon: ListChecks,      label: 'Review Queue', soon: true },
  { to: '/dashboard/analytics', icon: BarChart2,       label: 'Analytics', soon: true },
  { to: '/dashboard/team',      icon: Users,           label: 'Team',      soon: true },
]

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === path
      : location.pathname.startsWith(path)

  return (
    <div className="flex min-h-screen" style={{ background: '#050B14' }}>
      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 h-screen w-[240px] flex flex-col z-30"
        style={{ background: '#07111F', borderRight: '1px solid #1E2D3D' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5 flex-shrink-0"
          style={{ borderBottom: '1px solid #1E2D3D' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(22, 199, 132, 0.08)',
              border: '1px solid rgba(22, 199, 132, 0.2)',
            }}
          >
            <Shield size={16} style={{ color: '#16C784' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-none" style={{ color: '#FFFFFF' }}>Genuinux</p>
            <p className="text-[10px] mt-1 mono" style={{ color: '#16C784' }}>
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 align-middle" />
              Live
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-item ${isActive(item.to) ? 'active' : ''}`}
              style={item.soon ? { pointerEvents: 'none', opacity: 0.45 } : undefined}
            >
              <item.icon size={15} />
              <span>{item.label}</span>
              {item.soon && (
                <span
                  className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full mono"
                  style={{ background: 'rgba(22, 199, 132, 0.06)', color: '#16C784' }}
                >
                  soon
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: '1px solid #1E2D3D' }}>
          <a
            href="https://docs.genuinux.io"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item"
          >
            <BookOpen size={15} />
            <span>Documentation</span>
          </a>
          <Link to="/dashboard/settings" className="nav-item">
            <Settings size={15} />
            <span>Settings</span>
          </Link>

          {/* User */}
          <div
            className="mt-2 px-3 py-3 rounded-xl"
            style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}
          >
            <p
              className="text-xs truncate mb-2.5 mono"
              style={{ color: '#94A3B8' }}
            >
              {user?.email}
            </p>
            <button
              onClick={handleSignOut}
              className="nav-item p-0 gap-2 text-xs"
              style={{ color: '#475569', padding: 0, width: 'auto' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-h-screen" style={{ marginLeft: '240px' }}>
        <Outlet />
      </main>
    </div>
  )
}
