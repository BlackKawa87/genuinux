import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Users, CreditCard, BarChart2,
  Monitor, Activity, FileText, Heart, Shield, Flag,
  ArrowLeft, ChevronRight, Menu, X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import { useWindowSize } from '../../hooks/useWindowSize'

const NAV = [
  { path: '/admin',               label: 'Dashboard',        icon: LayoutDashboard, exact: true },
  { path: '/admin/organizations', label: 'Organizations',    icon: Building2 },
  { path: '/admin/users',         label: 'Users',            icon: Users },
  { path: '/admin/billing',       label: 'Billing',          icon: CreditCard },
  { path: '/admin/usage',         label: 'Usage & Limits',   icon: BarChart2 },
  { path: '/admin/go-live',       label: 'Go Live',          icon: Monitor },
  { path: '/admin/system',        label: 'System Health',    icon: Activity },
  { path: '/admin/audit',         label: 'Audit Logs',       icon: FileText },
  { path: '/admin/customers',     label: 'Customer Success', icon: Heart },
  { path: '/admin/security',      label: 'Security',         icon: Shield },
  { path: '/admin/features',      label: 'Feature Flags',    icon: Flag },
]

const ACCENT = '#F59E0B'

export default function AdminLayout() {
  const T   = useT()
  const nav = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const { isMobile } = useWindowSize()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg, fontFamily: 'Inter, sans-serif' }}>

      {/* ── Mobile Backdrop ──────────────────────────────────────── */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
      <aside style={{
        width: 220, flexShrink: 0, position: 'fixed', top: 0, left: 0, bottom: 0,
        background: T.deep, borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
        zIndex: isMobile ? 200 : 40,
        transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-220px)') : 'translateX(0)',
        transition: 'transform 0.25s ease',
      }}>
        {/* Logo / header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#000',
            }}>G</div>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: '0.04em' }}>GENUINUX</span>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: `${ACCENT}20`, border: `1px solid ${ACCENT}40`,
            borderRadius: 4, padding: '2px 8px',
          }}>
            <Shield size={9} color={ACCENT} />
            <span style={{ fontSize: 9, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em' }}>ADMIN CONSOLE</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {NAV.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 6, marginBottom: 1,
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                color: isActive ? ACCENT : T.textSec,
                background: isActive ? `${ACCENT}15` : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.12s',
              })}
            >
              <item.icon size={13} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}` }}>
          <button
            onClick={() => nav('/dashboard')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: T.textDim, fontSize: 11, padding: '6px 0', marginBottom: 4,
            }}
          >
            <ArrowLeft size={12} />
            Back to Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: `${ACCENT}30`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: ACCENT,
            }}>
              {(profile?.full_name ?? profile?.email ?? 'A')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.full_name ?? 'Admin'}
              </div>
              <div style={{ fontSize: 10, color: T.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.email}
              </div>
            </div>
            <button onClick={() => void signOut()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textDim }}>
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────────── */}
      <main style={{ marginLeft: isMobile ? 0 : 220, flex: 1, minHeight: '100vh' }}>
        {/* Top bar */}
        <div style={{
          height: 48, borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', background: T.card, position: 'sticky', top: 0, zIndex: 30,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(o => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text, display: 'flex', alignItems: 'center', marginRight: 4 }}
              >
                {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
            <Shield size={13} color={ACCENT} />
            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: '0.06em' }}>ADMIN CONSOLE</span>
          </div>
          <div style={{ fontSize: 11, color: T.textDim, display: isMobile ? 'none' : undefined }}>
            Genuinux Internal — Restricted Access
          </div>
        </div>

        {/* Page content */}
        <div style={{ padding: isMobile ? '16px' : '24px 28px', maxWidth: 1400 }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
