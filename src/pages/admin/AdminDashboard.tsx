import { useState, useEffect } from 'react'
import { Building2, Users, Key, Zap, TrendingUp, Tag, Brain, AlertTriangle, CheckCircle, XCircle, MinusCircle, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'

const ACCENT = '#F59E0B'
const API    = import.meta.env.VITE_API_URL ?? ''

type Metrics = {
  orgs:       { total: number; active: number; suspended: number; by_plan: Record<string, number> }
  users:      { total: number | null }
  api_keys:   { active: number | null }
  events:     { today: number | null; month: number | null }
  labels:     { today: number | null }
  ml:         { today: number | null }
  slow_today: number | null
  system:     Record<string, string>
  generated_at: string
}

function KpiCard({ label, value, sub, icon: Icon, accent }: { label: string; value: string | number; sub?: string; icon: React.ElementType; accent?: string }) {
  const T = useT()
  const color = accent ?? ACCENT
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: T.textSec, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} color={color} />
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: T.text, fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1 }}>
        {value === null || value === undefined ? '—' : value.toLocaleString()}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'ok' ? '#16C784' : status === 'degraded' ? '#F59E0B' : status === 'unconfigured' ? '#64748B' : '#EF4444'
  const label = status === 'ok' ? 'Healthy' : status === 'degraded' ? 'Degraded' : status === 'unconfigured' ? 'Not configured' : 'Error'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontSize: 12, color }}>{label}</span>
    </span>
  )
}

export default function AdminDashboard() {
  const T = useT()
  const { session } = useAuth()
  const [data,    setData]    = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API}/api/admin/platform/metrics`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!r.ok) throw new Error((await r.json() as { error: string }).error)
      setData(await r.json() as Metrics)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', padding: 40 }}>
      <RefreshCw size={14} className="animate-spin" />
      Loading metrics…
    </div>
  )

  if (error) return (
    <div style={{ padding: 40, color: '#EF4444', fontSize: 13 }}>
      ⚠ {error} — run the v24 migration and grant yourself is_platform_admin first.
    </div>
  )

  const d = data!
  const planOrder = ['enterprise', 'pro', 'starter', 'free']

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Admin Dashboard</h1>
          <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>
            Platform-wide metrics · updated {new Date(d.generated_at).toLocaleTimeString()}
          </p>
        </div>
        <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textSec, fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Row 1 — Orgs & Users */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <KpiCard label="Total Organizations" value={d.orgs.total}  sub={`${d.orgs.active} active · ${d.orgs.suspended} suspended`} icon={Building2} />
        <KpiCard label="Total Users"         value={d.users.total ?? '—'} icon={Users} />
        <KpiCard label="Active API Keys"     value={d.api_keys.active ?? '—'} icon={Key} />
        <KpiCard label="Events Today"        value={d.events.today ?? '—'} sub={`${(d.events.month ?? 0).toLocaleString()} this month`} icon={Zap} accent="#16C784" />
      </div>

      {/* Row 2 — Intelligence */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <KpiCard label="Labels Today"        value={d.labels.today ?? '—'} icon={Tag} accent="#8B5CF6" />
        <KpiCard label="ML Predictions Today" value={d.ml.today ?? '—'} icon={Brain} accent="#8B5CF6" />
        <KpiCard label="Slow Requests Today" value={d.slow_today ?? '—'} sub=">1000ms" icon={AlertTriangle} accent={d.slow_today && d.slow_today > 10 ? '#EF4444' : '#F59E0B'} />
        <KpiCard label="Events This Month"   value={d.events.month ?? '—'} icon={TrendingUp} accent="#16C784" />
      </div>

      {/* Row 3 — Plans + System */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Plan breakdown */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Organizations by Plan
          </div>
          {planOrder.map(plan => {
            const count = d.orgs.by_plan[plan] ?? 0
            const pct   = d.orgs.total > 0 ? Math.round((count / d.orgs.total) * 100) : 0
            const colors: Record<string, string> = { enterprise: '#8B5CF6', pro: '#16C784', starter: ACCENT, free: '#64748B' }
            const color = colors[plan] ?? '#64748B'
            return (
              <div key={plan} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: T.text, textTransform: 'capitalize', fontWeight: 500 }}>{plan}</span>
                  <span style={{ fontSize: 12, color: T.textSec, fontFamily: 'IBM Plex Mono, monospace' }}>{count} · {pct}%</span>
                </div>
                <div style={{ height: 5, background: T.border, borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* System Health */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            System Health
          </div>
          {Object.entries(d.system).map(([svc, status]) => {
            const Icon = status === 'ok' ? CheckCircle : status === 'unconfigured' ? MinusCircle : XCircle
            const color = status === 'ok' ? '#16C784' : status === 'unconfigured' ? '#64748B' : '#EF4444'
            return (
              <div key={svc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={13} color={color} />
                  <span style={{ fontSize: 12, color: T.text, textTransform: 'capitalize', fontWeight: 500 }}>{svc}</span>
                </div>
                <StatusDot status={status} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
