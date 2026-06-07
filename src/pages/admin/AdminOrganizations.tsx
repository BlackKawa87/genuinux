import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search, CheckCircle, XCircle, MoreHorizontal, Building2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import { useWindowSize } from '../../hooks/useWindowSize'

const ACCENT = '#F59E0B'
const API    = import.meta.env.VITE_API_URL ?? ''

type OrgRow = {
  id: string; name: string; plan: string; plan_source: string
  shadow_mode: boolean; suspended_at: string | null; created_at: string
  user_count: number; key_count: number; events_month: number; last_activity: string | null
}

const PLANS = ['free', 'starter', 'pro', 'enterprise']
const PLAN_COLORS: Record<string, string> = { enterprise: '#8B5CF6', pro: '#16C784', starter: '#F59E0B', free: '#64748B' }

function PlanBadge({ plan }: { plan: string }) {
  const color = PLAN_COLORS[plan] ?? '#64748B'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
      background: `${color}20`, color, border: `1px solid ${color}40`,
    }}>{plan}</span>
  )
}

export default function AdminOrganizations() {
  const T = useT()
  const { isMobile } = useWindowSize()
  const { session } = useAuth()
  const [orgs,        setOrgs]        = useState<OrgRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [search,      setSearch]      = useState('')
  const [planFilter,  setPlanFilter]  = useState('all')
  const [statusFilter,setStatusFilter]= useState('all')
  const [actionRow,   setActionRow]   = useState<string | null>(null)
  const [saving,      setSaving]      = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API}/api/admin/platform/orgs`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await r.json() as { orgs?: OrgRow[]; error?: string }
      if (!r.ok) throw new Error(json.error ?? 'Failed')
      setOrgs(json.orgs ?? [])
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => orgs.filter(o => {
    if (search && !o.name.toLowerCase().includes(search.toLowerCase())) return false
    if (planFilter !== 'all' && o.plan !== planFilter) return false
    if (statusFilter === 'active'    && o.suspended_at) return false
    if (statusFilter === 'suspended' && !o.suspended_at) return false
    return true
  }), [orgs, search, planFilter, statusFilter])

  const patch = async (org_id: string, body: Record<string, unknown>) => {
    setSaving(org_id)
    try {
      const r = await fetch(`${API}/api/admin/platform/orgs`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id, ...body }),
      })
      if (!r.ok) throw new Error(((await r.json()) as { error: string }).error)
      await load()
    } catch (e) { alert((e as Error).message) }
    finally { setSaving(null); setActionRow(null) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', padding: 40 }}>
      <RefreshCw size={14} />Loading organizations…
    </div>
  )

  if (error) return <div style={{ padding: 40, color: '#EF4444', fontSize: 13 }}>⚠ {error}</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Organizations</h1>
          <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>{orgs.length} total · {orgs.filter(o => !o.suspended_at).length} active</p>
        </div>
        <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textSec, fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} />Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textDim }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search organizations…"
            style={{ width: '100%', paddingLeft: 32, height: 34, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, fontSize: 12, boxSizing: 'border-box', outline: 'none' }}
          />
        </div>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} style={{ height: 34, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textSec, fontSize: 12, padding: '0 10px' }}>
          <option value="all">All Plans</option>
          {PLANS.map(p => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 34, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textSec, fontSize: 12, padding: '0 10px' }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 700 : undefined }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {['Organization', 'Plan', 'Status', 'Users', 'API Keys', 'Events/mo', 'Last Activity', 'Created', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: T.textDim, fontSize: 13 }}>No organizations found</td></tr>
            )}
            {filtered.map(org => (
              <tr key={org.id} style={{ borderBottom: `1px solid ${T.border}`, opacity: org.suspended_at ? 0.6 : 1 }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: `${ACCENT}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building2 size={12} color={ACCENT} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{org.name}</div>
                      <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'IBM Plex Mono, monospace' }}>{org.id.slice(0, 8)}…</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PlanBadge plan={org.plan} />
                    <select
                      value={org.plan}
                      onChange={e => void patch(org.id, { plan: e.target.value, plan_source: 'admin_grant' })}
                      disabled={saving === org.id}
                      style={{ fontSize: 10, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 4, color: T.textSec, padding: '2px 4px', cursor: 'pointer' }}
                    >
                      {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {org.suspended_at
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444' }}><XCircle size={11} />Suspended</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#16C784' }}><CheckCircle size={11} />Active</span>
                  }
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: T.text, fontFamily: 'IBM Plex Mono, monospace' }}>{org.user_count}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: T.text, fontFamily: 'IBM Plex Mono, monospace' }}>{org.key_count}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: T.text, fontFamily: 'IBM Plex Mono, monospace' }}>{org.events_month.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: T.textDim }}>
                  {org.last_activity ? new Date(org.last_activity).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: T.textDim }}>
                  {new Date(org.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '10px 14px', position: 'relative' }}>
                  <button
                    onClick={() => setActionRow(actionRow === org.id ? null : org.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textDim, padding: 4 }}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {actionRow === org.id && (
                    <div style={{
                      position: 'absolute', right: 14, top: 36, zIndex: 50,
                      background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.2)', minWidth: 160, padding: 4,
                    }}>
                      {[
                        { label: org.suspended_at ? 'Reactivate' : 'Suspend', action: org.suspended_at ? 'reactivate' : 'suspend', color: org.suspended_at ? '#16C784' : '#EF4444' },
                      ].map(item => (
                        <button
                          key={item.label}
                          onClick={() => void patch(org.id, { action: item.action })}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: item.color, borderRadius: 5 }}
                        >
                          {item.label}
                        </button>
                      ))}
                      <div style={{ height: 1, background: T.border, margin: '4px 0' }} />
                      <div style={{ padding: '6px 12px' }}>
                        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Plan Source</div>
                        {['stripe', 'admin_grant', 'partner', 'internal', 'trial'].map(src => (
                          <button key={src} onClick={() => void patch(org.id, { plan: org.plan, plan_source: src })} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: org.plan_source === src ? ACCENT : T.textSec }}>
                            {src === org.plan_source ? '✓ ' : '  '}{src}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Plan source legend */}
      <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
        {[['stripe', '#16C784'], ['admin_grant', ACCENT], ['partner', '#8B5CF6'], ['internal', '#64748B'], ['trial', '#06B6D4']].map(([src, color]) => (
          <span key={src} style={{ fontSize: 10, color: T.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color as string, display: 'inline-block' }} />
            {src}
          </span>
        ))}
        <span style={{ fontSize: 10, color: T.textDim, marginLeft: 8 }}>Plan Source indicators</span>
      </div>

      {/* Dropdown close overlay */}
      {actionRow && <div onClick={() => setActionRow(null)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />}
    </div>
  )
}
