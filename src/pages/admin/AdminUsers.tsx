import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search, Shield, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'

const ACCENT = '#F59E0B'
const API    = import.meta.env.VITE_API_URL ?? ''

type UserRow = {
  id: string; user_id: string; full_name: string | null; email: string
  role: string; is_platform_admin: boolean
  organization_id: string; org_name: string; org_plan: string
  created_at: string
}

const ROLES = ['owner', 'admin', 'analyst', 'viewer', 'member']
const ROLE_COLORS: Record<string, string> = { owner: '#F59E0B', admin: '#8B5CF6', analyst: '#16C784', viewer: '#64748B', member: '#475569' }

export default function AdminUsers() {
  const T = useT()
  const { session } = useAuth()
  const [users,   setUsers]   = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [search,  setSearch]  = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [saving,  setSaving]  = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API}/api/admin/platform/users`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await r.json() as { users?: UserRow[]; error?: string }
      if (!r.ok) throw new Error(json.error ?? 'Failed')
      setUsers(json.users ?? [])
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => users.filter(u => {
    if (search && !u.email.toLowerCase().includes(search.toLowerCase()) && !(u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) && !u.org_name.toLowerCase().includes(search.toLowerCase())) return false
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    return true
  }), [users, search, roleFilter])

  const patchUser = async (profile_id: string, updates: Record<string, unknown>) => {
    setSaving(profile_id)
    try {
      const r = await fetch(`${API}/api/admin/platform/users`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id, ...updates }),
      })
      if (!r.ok) throw new Error(((await r.json()) as { error: string }).error)
      await load()
    } catch (e) { alert((e as Error).message) }
    finally { setSaving(null) }
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', padding: 40 }}><RefreshCw size={14} />Loading users…</div>
  if (error)   return <div style={{ padding: 40, color: '#EF4444', fontSize: 13 }}>⚠ {error}</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Users</h1>
          <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>{users.length} total across all organizations</p>
        </div>
        <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textSec, fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} />Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textDim }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, or org…"
            style={{ width: '100%', paddingLeft: 32, height: 34, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, fontSize: 12, boxSizing: 'border-box', outline: 'none' }} />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ height: 34, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textSec, fontSize: 12, padding: '0 10px' }}>
          <option value="all">All Roles</option>
          {ROLES.map(r => <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r}</option>)}
        </select>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {['User', 'Organization', 'Role', 'Platform Admin', 'Joined', 'Change Role'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: T.textDim, fontSize: 13 }}>No users found</td></tr>
            )}
            {filtered.map(u => (
              <tr key={u.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${ACCENT}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {u.is_platform_admin ? <Shield size={12} color={ACCENT} /> : <User size={12} color={T.textDim} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{u.full_name ?? u.email.split('@')[0]}</div>
                      <div style={{ fontSize: 10, color: T.textDim }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ fontSize: 12, color: T.text }}>{u.org_name}</div>
                  <div style={{ fontSize: 10, color: T.textDim, textTransform: 'capitalize' }}>{u.org_plan}</div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: 'capitalize', background: `${ROLE_COLORS[u.role] ?? '#64748B'}20`, color: ROLE_COLORS[u.role] ?? '#64748B', border: `1px solid ${ROLE_COLORS[u.role] ?? '#64748B'}40` }}>{u.role}</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button
                    onClick={() => void patchUser(u.id, { is_platform_admin: !u.is_platform_admin })}
                    disabled={saving === u.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: u.is_platform_admin ? `${ACCENT}20` : T.elevated, border: `1px solid ${u.is_platform_admin ? ACCENT : T.border}`, borderRadius: 5, cursor: 'pointer', fontSize: 11, color: u.is_platform_admin ? ACCENT : T.textDim, fontWeight: u.is_platform_admin ? 600 : 400 }}
                  >
                    <Shield size={10} />
                    {u.is_platform_admin ? 'Admin' : 'Grant'}
                  </button>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: T.textDim }}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td style={{ padding: '10px 14px' }}>
                  <select
                    value={u.role}
                    onChange={e => void patchUser(u.id, { role: e.target.value })}
                    disabled={saving === u.id}
                    style={{ fontSize: 11, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 5, color: T.textSec, padding: '4px 8px', cursor: 'pointer' }}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
