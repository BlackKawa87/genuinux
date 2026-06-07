import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle, XCircle, MinusCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import { useWindowSize } from '../../hooks/useWindowSize'

const API = import.meta.env.VITE_API_URL ?? ''

type HealthData = {
  status: string
  database: { status: string; response_ms: number }
  redis:    { status: string }
  openai:   { status: string }
  stripe:   { status: string }
  version:  string
  timestamp: string
  environment: string
}

export default function AdminSystemHealth() {
  const T = useT()
  const { isMobile } = useWindowSize()
  const { session } = useAuth()
  const [data,    setData]    = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/health`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      setData(await r.json() as HealthData)
      setLastCheck(new Date())
    } catch { /* fail gracefully */ }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const StatusIcon = ({ s }: { s: string }) => {
    if (s === 'ok')           return <CheckCircle  size={16} color="#16C784" />
    if (s === 'unavailable')  return <MinusCircle  size={16} color="#64748B" />
    return <XCircle size={16} color="#EF4444" />
  }

  const statusColor = (s: string) =>
    s === 'ok' ? '#16C784' : s === 'unavailable' ? '#64748B' : '#EF4444'

  const services = data ? [
    { name: 'Supabase Database', status: data.database.status, detail: `${data.database.response_ms}ms`, link: 'https://supabase.com/dashboard' },
    { name: 'Redis (Upstash)',   status: data.redis.status,    detail: 'rate limiting + cache', link: 'https://console.upstash.com' },
    { name: 'OpenAI',           status: data.openai.status,   detail: 'AI summaries', link: null },
    { name: 'Stripe',           status: data.stripe.status,   detail: 'billing', link: 'https://dashboard.stripe.com' },
    { name: 'Sentry',           status: process.env.VITE_SENTRY_DSN ? 'ok' : 'unavailable', detail: 'error tracking', link: 'https://sentry.io' },
    { name: 'Vercel',           status: 'ok',                 detail: `env: ${data.environment}`, link: 'https://vercel.com/dashboard' },
  ] : []

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', padding: 40 }}><RefreshCw size={14} />Checking services…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>System Health</h1>
          <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>
            {lastCheck ? `Last checked: ${lastCheck.toLocaleTimeString()}` : 'Checking…'} · version {data?.version ?? '—'}
          </p>
        </div>
        <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textSec, fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} />Refresh
        </button>
      </div>

      {/* Overall status banner */}
      {data && (
        <div style={{ background: `${statusColor(data.status)}15`, border: `1px solid ${statusColor(data.status)}40`, borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusIcon s={data.status} />
          <span style={{ fontSize: 15, fontWeight: 700, color: statusColor(data.status) }}>
            {data.status === 'ok' ? 'All Systems Operational' : 'System Degraded'}
          </span>
        </div>
      )}

      {/* Service cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 12 }}>
        {services.map(svc => (
          <div key={svc.name} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{svc.name}</span>
              <StatusIcon s={svc.status} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: T.textDim }}>{svc.detail}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: statusColor(svc.status), textTransform: 'capitalize' }}>{svc.status}</span>
            </div>
            {svc.link && (
              <a href={svc.link} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 10, fontSize: 10, color: '#F59E0B', textDecoration: 'none' }}>Open Dashboard →</a>
            )}
          </div>
        ))}
      </div>

      {/* Env vars checklist */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Environment Checklist</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {[
            ['SUPABASE_URL', !!import.meta.env.VITE_SUPABASE_URL],
            ['SUPABASE_ANON_KEY', !!import.meta.env.VITE_SUPABASE_ANON_KEY],
            ['UPSTASH_REDIS', data?.redis.status === 'ok'],
            ['OPENAI_API_KEY', data?.openai.status === 'ok'],
            ['STRIPE', data?.stripe.status === 'ok'],
            ['SENTRY_DSN', false],
            ['RESEND_API_KEY', false],
            ['REDIS_COUNTERS_ENABLED', false],
          ].map(([name, ok]) => (
            <div key={String(name)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {ok ? <CheckCircle size={11} color="#16C784" /> : <MinusCircle size={11} color="#64748B" />}
              <span style={{ fontSize: 11, color: ok ? T.text : T.textDim, fontFamily: 'IBM Plex Mono, monospace' }}>{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
