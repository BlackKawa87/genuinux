import { useEffect, useState } from 'react'
import { RefreshCw, Server, Database, GitBranch, Clock, AlertTriangle, Activity, Cpu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import { supabase } from '../../lib/supabase'

interface SystemSummary {
  org_count:    number | null
  table_sizes: {
    risk_events:   number | null
    users_checked: number | null
    rules_active:  number | null
  }
  queue_size:   number | null
  webhook_deliveries: {
    retrying: number | null
    failed:   number | null
  }
  ai_cache: {
    entries:    number
    total_hits: number
  }
  generated_at: string
}

interface HealthData {
  status:      string
  database:    { status: string; response_ms?: number }
  redis:       { status: string }
  openai:      { status: string }
  stripe:      { status: string }
  version:     string
  environment: string
  timestamp:   string
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'ok' ? '#16C784' : status === 'degraded' ? '#F59E0B' : '#EF4444'
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
}

function MetricRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  const T = useT()
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
      <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold mono" style={{ color: T.text }}>{value}</span>
        {sub && <span className="ml-2 text-[10px]" style={{ color: T.textDim }}>{sub}</span>}
      </div>
    </div>
  )
}

export default function Ops() {
  const T = useT()
  const { profile, session } = useAuth()
  const [summary,    setSummary]    = useState<SystemSummary | null>(null)
  const [health,     setHealth]     = useState<HealthData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  const isOwner = profile?.role === 'owner'

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = session?.access_token
      const [healthRes, summaryRes] = await Promise.allSettled([
        fetch('/api/health'),
        token
          ? fetch('/api/admin/system-summary', { headers: { Authorization: `Bearer ${token}` } })
          : Promise.reject(new Error('No session')),
      ])

      if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
        setHealth(await healthRes.value.json() as HealthData)
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
        setSummary(await summaryRes.value.json() as SystemSummary)
      } else if (summaryRes.status === 'rejected') {
        setError(summaryRes.reason instanceof Error ? summaryRes.reason.message : 'Failed to load')
      }

      setLastFetched(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOwner) return
    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner])

  // Also count pending queue items via frontend client
  const [pendingQueue, setPendingQueue] = useState<number | null>(null)
  useEffect(() => {
    if (!profile?.organization_id) return
    void supabase
      .from('review_queue')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('status', 'pending')
      .then(({ count }) => setPendingQueue(count))
  }, [profile?.organization_id])

  if (!isOwner) {
    return (
      <div className="p-8">
        <div
          className="max-w-md mx-auto p-6 rounded-xl text-center"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          <AlertTriangle size={28} style={{ color: '#F59E0B', margin: '0 auto 12px' }} />
          <p className="text-sm font-semibold" style={{ color: T.text }}>Owner access required</p>
          <p className="text-xs mt-1" style={{ color: T.textSec }}>
            The Operations dashboard is restricted to organization owners.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-7 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: T.text }}>Operations</h1>
          <p className="text-xs mt-0.5" style={{ color: T.textSec }}>
            Runtime metrics and infrastructure status
            {lastFetched && (
              <span className="ml-2 mono" style={{ color: T.textDim }}>
                · last updated {lastFetched.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity"
          style={{
            background: T.elevated,
            border: `1px solid ${T.border}`,
            color: T.textSec,
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          className="mb-5 flex items-center gap-2 px-4 py-3 rounded-lg text-xs"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}
        >
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* Health row */}
      {health && (
        <div
          className="mb-5 p-4 rounded-xl"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} style={{ color: T.textSec }} />
            <p className="text-xs font-semibold" style={{ color: T.text }}>Service Health</p>
            <span
              className="ml-auto text-[10px] mono px-1.5 py-0.5 rounded"
              style={{
                background: health.status === 'ok' ? 'rgba(22,199,132,0.1)' : 'rgba(245,158,11,0.1)',
                color: health.status === 'ok' ? '#16C784' : '#F59E0B',
                border: `1px solid ${health.status === 'ok' ? 'rgba(22,199,132,0.2)' : 'rgba(245,158,11,0.2)'}`,
              }}
            >
              {health.status.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Database', data: health.database, sub: health.database.response_ms !== undefined ? `${health.database.response_ms}ms` : undefined },
              { label: 'Redis', data: health.redis, sub: undefined },
              { label: 'OpenAI', data: health.openai, sub: undefined },
              { label: 'Stripe', data: health.stripe, sub: undefined },
            ].map(({ label, data, sub }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: T.deep, border: `1px solid ${T.border}` }}
              >
                <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
                <div className="flex items-center gap-1.5">
                  <StatusDot status={data.status} />
                  {sub && <span className="text-[10px] mono" style={{ color: T.textDim }}>{sub}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
            <span className="text-[10px] mono" style={{ color: T.textDim }}>
              version: {health.version}
            </span>
            <span className="text-[10px] mono" style={{ color: T.textDim }}>
              env: {health.environment}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Table sizes */}
        {summary && (
          <div className="p-4 rounded-xl" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2 mb-3">
              <Database size={13} style={{ color: T.textSec }} />
              <p className="text-xs font-semibold" style={{ color: T.text }}>Database</p>
            </div>
            <div>
              <MetricRow label="Organizations" value={fmt(summary.org_count)} />
              <MetricRow label="Risk events (total)" value={fmt(summary.table_sizes.risk_events)} />
              <MetricRow label="Users checked" value={fmt(summary.table_sizes.users_checked)} />
              <MetricRow label="Active rules" value={fmt(summary.table_sizes.rules_active)} />
            </div>
          </div>
        )}

        {/* Queue & webhooks */}
        {summary && (
          <div className="p-4 rounded-xl" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2 mb-3">
              <Server size={13} style={{ color: T.textSec }} />
              <p className="text-xs font-semibold" style={{ color: T.text }}>Operations</p>
            </div>
            <div>
              <MetricRow
                label="Pending review queue"
                value={fmt(pendingQueue ?? summary.queue_size)}
                sub={pendingQueue !== null && pendingQueue > 50 ? '⚠ high' : undefined}
              />
              <MetricRow
                label="Webhooks retrying"
                value={fmt(summary.webhook_deliveries.retrying)}
                sub={summary.webhook_deliveries.retrying !== null && summary.webhook_deliveries.retrying > 10 ? '⚠' : undefined}
              />
              <MetricRow
                label="Webhooks failed"
                value={fmt(summary.webhook_deliveries.failed)}
                sub={summary.webhook_deliveries.failed !== null && summary.webhook_deliveries.failed > 0 ? 'needs attention' : undefined}
              />
              <MetricRow label="AI cache entries" value={fmt(summary.ai_cache.entries)} />
              <MetricRow label="AI cache total hits" value={fmt(summary.ai_cache.total_hits)} />
            </div>
          </div>
        )}

        {/* Build info */}
        <div className="p-4 rounded-xl" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-2 mb-3">
            <GitBranch size={13} style={{ color: T.textSec }} />
            <p className="text-xs font-semibold" style={{ color: T.text }}>Build & Deployment</p>
          </div>
          <div>
            <MetricRow label="Version" value={health?.version ?? '—'} />
            <MetricRow label="Environment" value={health?.environment ?? '—'} />
            <MetricRow label="Rate limiting" value={process.env.NODE_ENV === 'test' ? '—' : 'configured'} />
          </div>
        </div>

        {/* Cron schedule */}
        <div className="p-4 rounded-xl" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={13} style={{ color: T.textSec }} />
            <p className="text-xs font-semibold" style={{ color: T.text }}>Cron Jobs</p>
          </div>
          <div className="space-y-2">
            {[
              { name: 'Webhook retry', schedule: 'Every minute', path: '/api/webhooks/retry-due' },
              { name: 'Daily maintenance', schedule: '03:00 UTC daily', path: '/api/cron/maintenance' },
            ].map(({ name, schedule, path }) => (
              <div
                key={path}
                className="flex items-start justify-between gap-3 py-2.5"
                style={{ borderBottom: `1px solid ${T.border}` }}
              >
                <div>
                  <p className="text-xs font-medium" style={{ color: T.text }}>{name}</p>
                  <p className="text-[10px] mono mt-0.5" style={{ color: T.textDim }}>{path}</p>
                </div>
                <span
                  className="text-[9px] mono px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: 'rgba(22,199,132,0.08)', color: '#16C784', border: '1px solid rgba(22,199,132,0.15)' }}
                >
                  {schedule}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Load test flags */}
      <div className="mt-5 p-4 rounded-xl" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Cpu size={13} style={{ color: T.textSec }} />
          <p className="text-xs font-semibold" style={{ color: T.text }}>Load Test Flags</p>
          <span className="text-[10px] ml-auto" style={{ color: T.textDim }}>Set via Vercel env vars</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'LOAD_TEST_MODE',                      desc: 'No effect today — future per-key quota bypass' },
            { name: 'DISABLE_WEBHOOKS_DURING_LOAD_TEST',   desc: 'Skip webhook dispatch during load tests' },
            { name: 'DISABLE_AI_DURING_LOAD_TEST',         desc: 'Skip GPT-4o-mini enrichment during load tests' },
          ].map(({ name, desc }) => (
            <div
              key={name}
              className="px-3 py-2.5 rounded-lg"
              style={{ background: T.deep, border: `1px solid ${T.border}` }}
            >
              <p className="text-[10px] mono font-semibold mb-1" style={{ color: '#F59E0B' }}>{name}</p>
              <p className="text-[10px]" style={{ color: T.textDim }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
