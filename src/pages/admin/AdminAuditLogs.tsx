import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search, FileText } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'

const API = import.meta.env.VITE_API_URL ?? ''

type LogRow = {
  id: string; organization_id: string; org_name: string
  actor_id: string | null; action: string
  metadata: Record<string, unknown> | null; created_at: string
}

const ACTION_COLORS: Record<string, string> = {
  'org.plan_changed': '#F59E0B',
  'org.suspend':      '#EF4444',
  'org.reactivate':   '#16C784',
  'user.role_changed':'#8B5CF6',
  'api_key.created':  '#16C784',
  'api_key.revoked':  '#EF4444',
  'rule.created':     '#16C784',
  'rule.deleted':     '#EF4444',
  'rule.updated':     '#F59E0B',
  'webhook.created':  '#16C784',
  'risk.check.slow':  '#F59E0B',
  'auth.login':       '#64748B',
  'auth.logout':      '#64748B',
}

export default function AdminAuditLogs() {
  const T = useT()
  const { session } = useAuth()
  const [logs,    setLogs]    = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/admin/platform/audit?limit=100`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await r.json() as { logs?: LogRow[] }
      setLogs(json.logs ?? [])
    } catch { /* */ }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => logs.filter(l =>
    !search || l.action.toLowerCase().includes(search.toLowerCase()) || l.org_name.toLowerCase().includes(search.toLowerCase())
  ), [logs, search])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', padding: 40 }}><RefreshCw size={14} />Loading audit logs…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Audit Logs</h1>
          <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>All platform events across organizations</p>
        </div>
        <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textSec, fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} />Refresh
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textDim }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by action or organization…"
          style={{ width: '100%', paddingLeft: 32, height: 34, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, fontSize: 12, boxSizing: 'border-box', outline: 'none' }} />
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: T.textDim, fontSize: 13 }}>
            <FileText size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
            No audit logs found
          </div>
        ) : (
          filtered.map(log => {
            const color = ACTION_COLORS[log.action] ?? '#64748B'
            const isOpen = expanded === log.id
            return (
              <div key={log.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer' }}
                >
                  {/* Time */}
                  <div style={{ fontSize: 11, color: T.textDim, fontFamily: 'IBM Plex Mono, monospace', minWidth: 140 }}>
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                  {/* Action badge */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}30`, minWidth: 180, fontFamily: 'IBM Plex Mono, monospace' }}>
                    {log.action}
                  </span>
                  {/* Org */}
                  <div style={{ fontSize: 12, color: T.text, flex: 1 }}>{log.org_name}</div>
                  {/* Actor */}
                  <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'IBM Plex Mono, monospace' }}>
                    {log.actor_id ? `${log.actor_id.slice(0, 8)}…` : 'system'}
                  </div>
                  {/* Expand */}
                  <span style={{ fontSize: 10, color: T.textDim }}>{isOpen ? '▲' : '▼'}</span>
                </div>
                {isOpen && log.metadata && (
                  <div style={{ padding: '0 16px 12px 168px' }}>
                    <pre style={{ background: T.elevated, borderRadius: 6, padding: '10px 12px', fontSize: 11, color: T.textSec, margin: 0, overflow: 'auto', fontFamily: 'IBM Plex Mono, monospace' }}>
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
