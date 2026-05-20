import { useState, useEffect, useCallback } from 'react'
import {
  Database, Shield, Globe, Cpu, Clock, AlertTriangle,
  CheckCircle, XCircle, MinusCircle, RefreshCw, ChevronDown, ChevronUp,
  AlertOctagon, Zap, FileDown, Activity,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatusBadgeProps { status: string; size?: 'sm' | 'md' }
interface SectionCardProps { title: string; children: React.ReactNode }
interface TabItem { id: string; label: string; icon: React.ElementType }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'healthy':     return '#16C784'
    case 'degraded':    return '#F59E0B'
    case 'missing':     return '#F59E0B'
    case 'critical':    return '#EF4444'
    case 'error':       return '#EF4444'
    default:            return '#94A3B8'
  }
}

function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const color = statusColor(status)
  const px = size === 'sm' ? '6px' : '8px'
  const py = size === 'sm' ? '2px' : '3px'
  const fs = size === 'sm' ? '9px' : '10px'
  const Icon = status === 'healthy'  ? CheckCircle  :
               status === 'missing'  ? MinusCircle  :
               status === 'loading'  ? RefreshCw    :
               XCircle
  return (
    <span
      className="inline-flex items-center gap-1 rounded font-semibold mono"
      style={{
        color,
        background: `${color}14`,
        border: `1px solid ${color}30`,
        padding: `${py} ${px}`,
        fontSize: fs,
      }}
    >
      <Icon size={size === 'sm' ? 9 : 10} />
      {status.toUpperCase()}
    </span>
  )
}

function SectionCard({ title, children }: SectionCardProps) {
  const T = useT()
  return (
    <div
      className="rounded-xl p-5 mb-4"
      style={{ background: T.card, border: `1px solid ${T.border}` }}
    >
      <p className="text-xs font-semibold mb-4 mono" style={{ color: T.textSec }}>{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  const T = useT()
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${T.border}` }}>
      <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
      <span className="text-xs font-medium mono" style={{ color: accent ?? T.text }}>{value}</span>
    </div>
  )
}

function WarningList({ warnings }: { warnings: string[] }) {
  const T = useT()
  if (!warnings || warnings.length === 0) return null
  return (
    <div className="mt-3 space-y-1.5">
      {warnings.map((w, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', color: '#B45309' }}
        >
          <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
          <span>{w}</span>
        </div>
      ))}
      {warnings.length === 0 && (
        <div className="text-xs" style={{ color: T.textDim }}>No warnings.</div>
      )}
    </div>
  )
}

// ─── Readiness score ──────────────────────────────────────────────────────────

interface ReadinessCategory {
  name: string
  points: number
  max: number
  status: 'ok' | 'partial' | 'fail'
  detail: string
}

function computeReadiness(data: Record<string, { status?: string; configured?: boolean; [k: string]: unknown }>): ReadinessCategory[] {
  const s = (key: string) => (data[key]?.status as string | undefined) ?? 'loading'
  const ok = (key: string) => s(key) === 'healthy'

  return [
    {
      name: 'Environment',
      points: ok('env') ? 15 : 0,
      max: 15,
      status: ok('env') ? 'ok' : s('env') === 'degraded' ? 'partial' : 'fail',
      detail: ok('env') ? 'All required env vars set' : 'Missing critical or required env vars',
    },
    {
      name: 'Database',
      points: ok('db') ? 15 : s('db') === 'degraded' ? 8 : 0,
      max: 15,
      status: ok('db') ? 'ok' : s('db') === 'degraded' ? 'partial' : 'fail',
      detail: ok('db') ? 'All tables healthy' : 'Warnings or missing tables',
    },
    {
      name: 'Rate Limiting',
      points: ok('rateLimit') ? 15 : 0,
      max: 15,
      status: ok('rateLimit') ? 'ok' : s('rateLimit') === 'missing' ? 'fail' : 'partial',
      detail: ok('rateLimit') ? 'Redis connected, all plans configured' : 'Redis not reachable or not configured',
    },
    {
      name: 'Monitoring',
      points: ok('health') ? 10 : 5,
      max: 10,
      status: ok('health') ? 'ok' : 'partial',
      detail: ok('health') ? 'Health endpoint reachable' : 'Health endpoint degraded',
    },
    {
      name: 'Webhooks',
      points: ok('webhooks') ? 10 : s('webhooks') === 'degraded' ? 5 : 0,
      max: 10,
      status: ok('webhooks') ? 'ok' : s('webhooks') === 'degraded' ? 'partial' : 'fail',
      detail: ok('webhooks') ? 'Delivery table available, success rate good' : 'Delivery failures or table missing',
    },
    {
      name: 'AI Cost Control',
      points: ok('ai') ? 10 : 5,
      max: 10,
      status: ok('ai') ? 'ok' : 'partial',
      detail: ok('ai') ? 'OpenAI configured with spend cap' : 'OpenAI unconfigured or no spend cap',
    },
    {
      name: 'Cron Jobs',
      points: ok('cron') ? 10 : s('cron') === 'missing' ? 0 : 5,
      max: 10,
      status: ok('cron') ? 'ok' : s('cron') === 'missing' ? 'fail' : 'partial',
      detail: ok('cron') ? 'All maintenance tasks running' : 'Maintenance logs missing or tasks not running',
    },
    {
      name: 'Security Events',
      points: ok('security') ? 10 : s('security') === 'missing' ? 0 : 5,
      max: 10,
      status: ok('security') ? 'ok' : s('security') === 'missing' ? 'fail' : 'partial',
      detail: ok('security') ? 'Security events table live, no critical events' : 'Security table missing or critical events detected',
    },
    {
      name: 'Billing',
      points: ok('export') ? 5 : 3,
      max: 5,
      status: ok('export') ? 'ok' : 'partial',
      detail: ok('export') ? 'All tables present, export ready' : 'Some tables missing',
    },
  ]
}

// ─── Tabs definition ──────────────────────────────────────────────────────────

const TABS: TabItem[] = [
  { id: 'overview',    label: 'Overview',     icon: Activity  },
  { id: 'env',         label: 'Environment',  icon: Zap       },
  { id: 'db',          label: 'Database',     icon: Database  },
  { id: 'rateLimit',   label: 'Rate Limits',  icon: Shield    },
  { id: 'webhooks',    label: 'Webhooks',     icon: Globe     },
  { id: 'ai',          label: 'AI',           icon: Cpu       },
  { id: 'cron',        label: 'Cron',         icon: Clock     },
  { id: 'security',    label: 'Security',     icon: Shield    },
  { id: 'incidents',   label: 'Incidents',    icon: AlertOctagon },
  { id: 'readiness',   label: 'Readiness',    icon: CheckCircle  },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function Infrastructure() {
  const T = useT()
  const { session } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(false)

  const [envData,      setEnvData]      = useState<Record<string, unknown> | null>(null)
  const [dbData,       setDbData]       = useState<Record<string, unknown> | null>(null)
  const [rateLimitData,setRateLimitData]= useState<Record<string, unknown> | null>(null)
  const [webhookData,  setWebhookData]  = useState<Record<string, unknown> | null>(null)
  const [aiData,       setAiData]       = useState<Record<string, unknown> | null>(null)
  const [cronData,     setCronData]     = useState<Record<string, unknown> | null>(null)
  const [securityData, setSecurityData] = useState<Record<string, unknown> | null>(null)
  const [exportData,   setExportData]   = useState<Record<string, unknown> | null>(null)
  const [healthData,   setHealthData]   = useState<Record<string, unknown> | null>(null)
  const [incidents,    setIncidents]    = useState<Record<string, unknown>[]>([])
  const [incidentError,setIncidentError]= useState<string | null>(null)
  const [newIncident,  setNewIncident]  = useState({ title: '', description: '', severity: 'medium', affected_system: '' })
  const [savingIncident, setSavingIncident] = useState(false)
  const [showCreateIncident, setShowCreateIncident] = useState(false)
  const [expandedLogs, setExpandedLogs] = useState(false)

  const token = session?.access_token

  const fetchAll = useCallback(async () => {
    if (!token) return
    setLoading(true)

    const headers = { Authorization: `Bearer ${token}` }

    const [env, db, rl, wh, ai, cron, sec, exp, health] = await Promise.allSettled([
      fetch('/api/admin/env-check',       { headers }).then(r => r.json()),
      fetch('/api/admin/db-health',       { headers }).then(r => r.json()),
      fetch('/api/admin/rate-limit-status',{ headers }).then(r => r.json()),
      fetch('/api/admin/webhook-health',  { headers }).then(r => r.json()),
      fetch('/api/admin/ai-health',       { headers }).then(r => r.json()),
      fetch('/api/admin/cron-health',     { headers }).then(r => r.json()),
      fetch('/api/admin/security-health', { headers }).then(r => r.json()),
      fetch('/api/admin/export-summary',  { headers }).then(r => r.json()),
      fetch('/api/health').then(r => r.json()),
    ])

    if (env.status      === 'fulfilled') setEnvData(env.value as Record<string, unknown>)
    if (db.status       === 'fulfilled') setDbData(db.value as Record<string, unknown>)
    if (rl.status       === 'fulfilled') setRateLimitData(rl.value as Record<string, unknown>)
    if (wh.status       === 'fulfilled') setWebhookData(wh.value as Record<string, unknown>)
    if (ai.status       === 'fulfilled') setAiData(ai.value as Record<string, unknown>)
    if (cron.status     === 'fulfilled') setCronData(cron.value as Record<string, unknown>)
    if (sec.status      === 'fulfilled') setSecurityData(sec.value as Record<string, unknown>)
    if (exp.status      === 'fulfilled') setExportData(exp.value as Record<string, unknown>)
    if (health.status   === 'fulfilled') setHealthData(health.value as Record<string, unknown>)

    // Incidents (from Supabase directly)
    try {
      const { supabase } = await import('../../lib/supabase')
      const { data, error } = await supabase
        .from('incidents')
        .select('id, severity, status, title, description, affected_system, started_at, resolved_at, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) setIncidentError(error.message)
      else setIncidents((data ?? []) as Record<string, unknown>[])
    } catch { setIncidentError('incidents table not found — run v10 migration') }

    setLoading(false)
  }, [token])

  useEffect(() => { void fetchAll() }, [fetchAll])

  const statusMap: Record<string, { status?: string; configured?: boolean }> = {
    env:       { status: (envData?.status as string | undefined) ?? 'loading' },
    db:        { status: (dbData?.status  as string | undefined) ?? 'loading' },
    rateLimit: { status: (rateLimitData?.status as string | undefined) ?? 'loading' },
    webhooks:  { status: (webhookData?.status   as string | undefined) ?? 'loading' },
    ai:        { status: (aiData?.status         as string | undefined) ?? 'loading' },
    cron:      { status: (cronData?.status       as string | undefined) ?? 'loading' },
    security:  { status: (securityData?.status   as string | undefined) ?? 'loading' },
    export:    { status: (exportData?.status     as string | undefined) ?? 'loading' },
    health:    { status: (healthData?.status     as string | undefined) ?? 'loading' },
  }

  const readinessCategories = computeReadiness(statusMap)
  const totalScore = readinessCategories.reduce((s, c) => s + c.points, 0)
  const maxScore   = readinessCategories.reduce((s, c) => s + c.max,    0)
  const scoreColor = totalScore >= 85 ? '#16C784' : totalScore >= 60 ? '#F59E0B' : '#EF4444'

  // Create incident handler
  const handleCreateIncident = async () => {
    if (!newIncident.title.trim()) return
    setSavingIncident(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      const { error } = await supabase.from('incidents').insert({
        title:            newIncident.title.trim(),
        description:      newIncident.description.trim() || null,
        severity:         newIncident.severity,
        affected_system:  newIncident.affected_system.trim() || null,
        status:           'open',
      })
      if (!error) {
        setNewIncident({ title: '', description: '', severity: 'medium', affected_system: '' })
        setShowCreateIncident(false)
        void fetchAll()
      }
    } finally { setSavingIncident(false) }
  }

  const updateIncidentStatus = async (id: string, status: string) => {
    const { supabase } = await import('../../lib/supabase')
    await supabase.from('incidents').update({
      status,
      ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
    }).eq('id', id)
    void fetchAll()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-7" style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: T.text }}>Infrastructure Control Center</h1>
          <p className="text-xs mt-1" style={{ color: T.textSec }}>
            Real-time health of every infrastructure layer. Owner access only.
          </p>
        </div>
        <button
          onClick={() => void fetchAll()}
          disabled={loading}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
          style={{ color: T.textSec, border: `1px solid ${T.border}`, background: T.card }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Tab Bar */}
      <div
        className="flex gap-0.5 mb-6 overflow-x-auto"
        style={{ borderBottom: `1px solid ${T.border}` }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium flex-shrink-0 transition-colors duration-150"
              style={{
                color:       isActive ? '#16C784' : T.textSec,
                borderBottom: isActive ? '2px solid #16C784' : '2px solid transparent',
                background:  'transparent',
              }}
            >
              <tab.icon size={12} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── OVERVIEW tab ─────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'API',           data: healthData,    key: 'health'    },
              { label: 'Environment',   data: envData,       key: 'env'       },
              { label: 'Database',      data: dbData,        key: 'db'        },
              { label: 'Rate Limiting', data: rateLimitData, key: 'rateLimit' },
              { label: 'Webhooks',      data: webhookData,   key: 'webhooks'  },
              { label: 'AI',            data: aiData,        key: 'ai'        },
              { label: 'Cron',          data: cronData,      key: 'cron'      },
              { label: 'Security',      data: securityData,  key: 'security'  },
              { label: 'Export',        data: exportData,    key: 'export'    },
            ].map(({ label, data, key }) => {
              const st = (data?.status as string | undefined) ?? 'loading'
              const color = statusColor(st)
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key === 'health' ? 'overview' : key)}
                  className="text-left rounded-xl p-4 transition-opacity hover:opacity-80"
                  style={{ background: T.card, border: `1px solid ${color}30` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium" style={{ color: T.text }}>{label}</span>
                    <StatusBadge status={st} size="sm" />
                  </div>
                  <div className="text-[10px] mono" style={{ color: T.textDim }}>
                    {data?.checked_at
                      ? new Date(data.checked_at as string).toLocaleTimeString()
                      : loading ? 'Loading…' : '—'}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Production Readiness Score preview */}
          <div
            className="rounded-xl p-5"
            style={{ background: T.card, border: `1px solid ${T.border}` }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold mono" style={{ color: T.textSec }}>PRODUCTION READINESS</p>
              <div className="text-right">
                <span className="text-2xl font-bold mono" style={{ color: scoreColor }}>{totalScore}</span>
                <span className="text-xs ml-1" style={{ color: T.textDim }}>/ {maxScore}</span>
              </div>
            </div>
            <div className="w-full rounded-full h-2 mb-4" style={{ background: T.border }}>
              <div
                className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${(totalScore / maxScore) * 100}%`, background: scoreColor }}
              />
            </div>
            <p className="text-xs" style={{ color: T.textSec }}>
              {totalScore >= 85
                ? 'Ready for production. All critical systems operational.'
                : totalScore >= 60
                  ? 'Close to production-ready. Resolve degraded systems before public launch.'
                  : 'Not production-ready. Critical systems missing. Do not go live.'}
            </p>
          </div>
        </div>
      )}

      {/* ── ENV tab ──────────────────────────────────────────────── */}
      {activeTab === 'env' && envData && (
        <div>
          <SectionCard title="ENVIRONMENT SUMMARY">
            <Row label="Status"             value={<StatusBadge status={envData.status as string} />} />
            <Row label="Database reachable" value={envData.db_reachable ? 'Yes' : 'No'} accent={envData.db_reachable ? '#16C784' : '#EF4444'} />
            <Row label="Configured vars"    value={`${String(envData.configured_count)} / ${String(envData.total_count)}`} />
          </SectionCard>

          {(envData.missing_critical as unknown[])?.length > 0 && (
            <SectionCard title="CRITICAL — App will not work">
              <div className="space-y-2">
                {(envData.missing_critical as Array<{ key: string; impact: string }>).map(v => (
                  <div key={v.key} className="text-xs rounded-lg px-3 py-2.5" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <div className="font-semibold mono mb-0.5" style={{ color: '#EF4444' }}>{v.key}</div>
                    <div style={{ color: '#94A3B8' }}>{v.impact}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {(envData.missing_required as unknown[])?.length > 0 && (
            <SectionCard title="REQUIRED — Degraded without">
              <div className="space-y-2">
                {(envData.missing_required as Array<{ key: string; impact: string }>).map(v => (
                  <div key={v.key} className="text-xs rounded-lg px-3 py-2.5" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div className="font-semibold mono mb-0.5" style={{ color: '#F59E0B' }}>{v.key}</div>
                    <div style={{ color: '#94A3B8' }}>{v.impact}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="ALL ENVIRONMENT VARIABLES">
            <div className="space-y-1.5">
              {(envData.vars as Array<{ key: string; configured: boolean; category: string; severity: string; impact: string }>).map(v => (
                <div key={v.key} className="flex items-start justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
                  <div>
                    <div className="text-xs mono font-medium" style={{ color: v.configured ? T.text : '#EF4444' }}>{v.key}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: T.textDim }}>{v.impact}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[9px] mono px-1.5 py-0.5 rounded" style={{ color: T.textDim, border: `1px solid ${T.border}` }}>{v.category}</span>
                    <StatusBadge status={v.configured ? 'healthy' : v.severity === 'critical' ? 'critical' : 'missing'} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── DB tab ───────────────────────────────────────────────── */}
      {activeTab === 'db' && dbData && (
        <div>
          <SectionCard title="DATABASE SUMMARY">
            <Row label="Status"                 value={<StatusBadge status={dbData.status as string} />} />
            <Row label="Query response time"    value={`${String(dbData.response_ms)}ms`} accent={Number(dbData.response_ms) < 300 ? '#16C784' : '#F59E0B'} />
            <Row label="Review queue pending"   value={String(dbData.review_queue_pending)}  accent={Number(dbData.review_queue_pending) > 100 ? '#EF4444' : '#16C784'} />
            <Row label="Webhook failures"       value={String(dbData.webhook_failures)}      accent={Number(dbData.webhook_failures) > 100 ? '#EF4444' : '#16C784'} />
            <Row label="AI cache expired rows"  value={dbData.ai_cache_expired === -1 ? 'table missing' : String(dbData.ai_cache_expired)} />
          </SectionCard>

          <SectionCard title="TABLE ROW COUNTS">
            {(dbData.tables as Array<{ table: string; count: number; warning?: string }>).map(t => (
              <div key={t.table} className="py-2" style={{ borderBottom: `1px solid ${T.border}` }}>
                <div className="flex justify-between text-xs">
                  <span className="mono" style={{ color: T.text }}>{t.table}</span>
                  <span className="mono" style={{ color: t.warning ? '#F59E0B' : T.textSec }}>{t.count.toLocaleString()}</span>
                </div>
                {t.warning && <div className="text-[10px] mt-0.5" style={{ color: '#B45309' }}>{t.warning}</div>}
              </div>
            ))}
          </SectionCard>
          <WarningList warnings={dbData.warnings as string[]} />
        </div>
      )}

      {/* ── RATE LIMIT tab ───────────────────────────────────────── */}
      {activeTab === 'rateLimit' && rateLimitData && (
        <div>
          <SectionCard title="REDIS STATUS">
            <Row label="Status"         value={<StatusBadge status={rateLimitData.status as string} />} />
            <Row label="Configured"     value={rateLimitData.configured ? 'Yes' : 'No'} accent={rateLimitData.configured ? '#16C784' : '#EF4444'} />
            <Row label="Redis reachable" value={rateLimitData.redis_reachable ? 'Yes' : 'No'} accent={rateLimitData.redis_reachable ? '#16C784' : '#EF4444'} />
            <Row label="Latency"        value={rateLimitData.redis_latency_ms !== null ? `${String(rateLimitData.redis_latency_ms)}ms` : '—'} />
            <Row label="Fail-open"      value="Yes (rate limiting disabled if Redis is down)" />
            {Boolean(rateLimitData.redis_error) && (
              <Row label="Error" value={String(rateLimitData.redis_error)} accent="#EF4444" />
            )}
          </SectionCard>

          <SectionCard title="PER-PLAN WINDOWS (req / 10 seconds)">
            {(rateLimitData.plans as Array<{ plan: string; requests_per_10s: number; window_seconds: number }>).map(p => (
              <Row key={p.plan} label={p.plan.toUpperCase()} value={`${p.requests_per_10s} req / ${p.window_seconds}s`} />
            ))}
          </SectionCard>
        </div>
      )}

      {/* ── WEBHOOKS tab ─────────────────────────────────────────── */}
      {activeTab === 'webhooks' && webhookData && (
        <div>
          <SectionCard title="WEBHOOK INFRASTRUCTURE">
            <Row label="Status"                    value={<StatusBadge status={webhookData.status as string} />} />
            <Row label="Total webhooks"            value={String(webhookData.total_webhooks)} />
            <Row label="Active webhooks"           value={String(webhookData.active_webhooks)} />
            <Row label="Delivery table available"  value={webhookData.deliveries_table_available ? 'Yes' : 'No'} accent={webhookData.deliveries_table_available ? '#16C784' : '#F59E0B'} />
            <Row label="Sample size"               value={`${String(webhookData.total_deliveries)} deliveries`} />
            <Row label="Success rate"              value={webhookData.success_rate !== null ? `${String(webhookData.success_rate)}%` : '—'} accent={Number(webhookData.success_rate) >= 95 ? '#16C784' : '#F59E0B'} />
            <Row label="Failed deliveries"         value={String(webhookData.failed_deliveries)} accent={Number(webhookData.failed_deliveries) > 50 ? '#EF4444' : '#16C784'} />
            <Row label="Avg duration"              value={webhookData.avg_duration_ms !== null ? `${String(webhookData.avg_duration_ms)}ms` : '—'} />
            <Row label="Last delivery"             value={webhookData.last_delivery_at ? new Date(webhookData.last_delivery_at as string).toLocaleString() : '—'} />
            <Row label="Last delivery success"     value={webhookData.last_delivery_success === null ? '—' : webhookData.last_delivery_success ? 'Yes' : 'No'} accent={webhookData.last_delivery_success ? '#16C784' : '#EF4444'} />
          </SectionCard>
          <WarningList warnings={webhookData.warnings as string[]} />
        </div>
      )}

      {/* ── AI tab ───────────────────────────────────────────────── */}
      {activeTab === 'ai' && aiData && (
        <div>
          <SectionCard title="AI INFRASTRUCTURE">
            <Row label="Status"              value={<StatusBadge status={aiData.status as string} />} />
            <Row label="OpenAI configured"   value={aiData.openai_configured ? 'Yes' : 'No'} accent={aiData.openai_configured ? '#16C784' : '#F59E0B'} />
            <Row label="Spend cap set"       value={aiData.cost_cap_set ? 'Yes' : 'No'} accent={aiData.cost_cap_set ? '#16C784' : '#F59E0B'} />
            <Row label="Monthly limit"       value={aiData.monthly_limit !== null ? String(aiData.monthly_limit) : 'None set'} />
            <Row label="Cache table"         value={aiData.cache_table_available ? 'Available' : 'Missing'} accent={aiData.cache_table_available ? '#16C784' : '#F59E0B'} />
            <Row label="Cache total"         value={aiData.cache_total !== null ? String(aiData.cache_total) : '—'} />
            <Row label="Cache valid"         value={aiData.cache_valid !== null ? String(aiData.cache_valid) : '—'} />
            <Row label="Cache expired"       value={aiData.cache_expired !== null ? String(aiData.cache_expired) : '—'} accent={Number(aiData.cache_expired) > 10000 ? '#F59E0B' : undefined} />
            <Row label="Load test AI bypass" value={aiData.ai_disabled_for_load_test ? 'ACTIVE' : 'Off'} accent={aiData.ai_disabled_for_load_test ? '#F59E0B' : undefined} />
          </SectionCard>
          <WarningList warnings={aiData.warnings as string[]} />
        </div>
      )}

      {/* ── CRON tab ─────────────────────────────────────────────── */}
      {activeTab === 'cron' && cronData && (
        <div>
          <SectionCard title="CRON STATUS">
            <Row label="Status"          value={<StatusBadge status={cronData.status as string} />} />
            <Row label="Table available" value={cronData.table_available ? 'Yes' : 'No'} accent={cronData.table_available ? '#16C784' : '#F59E0B'} />
          </SectionCard>

          <SectionCard title="EXPECTED TASKS">
            {(cronData.task_status as Array<{
              task: string; last_run: string | null; status: string;
              hours_since: number | null; duration_ms?: number | null; rows_affected?: number | null
            }>).map(t => (
              <div key={t.task} className="py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs mono" style={{ color: T.text }}>{t.task}</span>
                  <StatusBadge size="sm" status={
                    t.status === 'never_run' ? 'missing' :
                    t.status === 'error'     ? 'critical' :
                    (t.hours_since ?? 0) > 26 ? 'degraded' :
                    'healthy'
                  } />
                </div>
                <div className="flex gap-4 mt-1 text-[10px]" style={{ color: T.textDim }}>
                  {t.last_run && <span>Last: {new Date(t.last_run).toLocaleString()}</span>}
                  {t.hours_since !== null && <span>{t.hours_since}h ago</span>}
                  {t.duration_ms != null && <span>{t.duration_ms}ms</span>}
                  {t.rows_affected != null && <span>{t.rows_affected} rows</span>}
                </div>
              </div>
            ))}
          </SectionCard>

          {(cronData.last_50_runs as unknown[])?.length > 0 && (
            <SectionCard title="RECENT RUNS">
              <button
                onClick={() => setExpandedLogs(v => !v)}
                className="flex items-center gap-1.5 text-xs mb-3 hover:opacity-70"
                style={{ color: T.textSec }}
              >
                {expandedLogs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expandedLogs ? 'Collapse' : 'Show all'}
              </button>
              {((cronData.last_50_runs as Array<{
                id: string; task: string; status: string;
                rows_affected: number | null; duration_ms: number | null; ran_at: string; error_message: string | null
              }>).slice(0, expandedLogs ? 50 : 10)).map(log => (
                <div key={log.id} className="flex items-center justify-between py-1.5 text-[11px]" style={{ borderBottom: `1px solid ${T.border}` }}>
                  <div className="flex gap-3">
                    <span className="mono" style={{ color: T.textSec }}>{new Date(log.ran_at).toLocaleString()}</span>
                    <span style={{ color: T.text }}>{log.task}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    {log.rows_affected !== null && <span style={{ color: T.textDim }}>{log.rows_affected} rows</span>}
                    {log.duration_ms   !== null && <span style={{ color: T.textDim }}>{log.duration_ms}ms</span>}
                    <StatusBadge size="sm" status={log.status === 'ok' ? 'healthy' : 'critical'} />
                  </div>
                </div>
              ))}
            </SectionCard>
          )}

          <WarningList warnings={cronData.warnings as string[]} />
        </div>
      )}

      {/* ── SECURITY tab ─────────────────────────────────────────── */}
      {activeTab === 'security' && securityData && (
        <div>
          <SectionCard title="SECURITY OVERVIEW">
            <Row label="Status"           value={<StatusBadge status={securityData.status as string} />} />
            <Row label="Table available"  value={securityData.table_available ? 'Yes' : 'No'} accent={securityData.table_available ? '#16C784' : '#F59E0B'} />
            <Row label="Total events"     value={String(securityData.total_events)} />
            <Row label="Last 24h"         value={String(securityData.events_last_24h)} />
          </SectionCard>

          <SectionCard title="BY SEVERITY">
            {Object.entries((securityData.by_severity as Record<string, number>) ?? {}).map(([sev, count]) => (
              <Row
                key={sev}
                label={sev.toUpperCase()}
                value={String(count)}
                accent={count > 0 && (sev === 'critical' || sev === 'high') ? '#EF4444' : undefined}
              />
            ))}
          </SectionCard>

          {(securityData.by_type as Record<string, number>) && Object.keys(securityData.by_type as Record<string, number>).length > 0 && (
            <SectionCard title="BY EVENT TYPE">
              {Object.entries(securityData.by_type as Record<string, number>).map(([type, count]) => (
                <Row key={type} label={type} value={String(count)} />
              ))}
            </SectionCard>
          )}

          {(securityData.recent_events as unknown[])?.length > 0 && (
            <SectionCard title="RECENT EVENTS (last 24h)">
              {(securityData.recent_events as Array<{
                id: string; event_type: string; severity: string;
                ip_address: string | null; created_at: string
              }>).map(e => (
                <div key={e.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
                  <div className="flex gap-3 text-xs">
                    <span className="mono" style={{ color: T.textDim }}>{new Date(e.created_at).toLocaleString()}</span>
                    <span style={{ color: T.text }}>{e.event_type}</span>
                    {e.ip_address && <span style={{ color: T.textSec }}>{e.ip_address}</span>}
                  </div>
                  <StatusBadge size="sm" status={
                    e.severity === 'critical' ? 'critical' :
                    e.severity === 'high'     ? 'degraded' :
                    'healthy'
                  } />
                </div>
              ))}
            </SectionCard>
          )}

          <WarningList warnings={securityData.warnings as string[]} />
        </div>
      )}

      {/* ── INCIDENTS tab ────────────────────────────────────────── */}
      {activeTab === 'incidents' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: T.text }}>Incidents</p>
            <button
              onClick={() => setShowCreateIncident(v => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: '#16C784', color: '#ffffff' }}
            >
              + Log Incident
            </button>
          </div>

          {incidentError && (
            <div className="rounded-lg px-4 py-3 text-xs mb-4" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', color: '#B45309' }}>
              {incidentError}
            </div>
          )}

          {showCreateIncident && (
            <div className="rounded-xl p-5 mb-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
              <p className="text-xs font-semibold mono mb-4" style={{ color: T.textSec }}>LOG INCIDENT</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: T.textSec }}>Title *</label>
                  <input
                    value={newIncident.title}
                    onChange={e => setNewIncident(v => ({ ...v, title: e.target.value }))}
                    placeholder="e.g. Redis connection failures"
                    className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                    style={{ background: T.deep, border: `1px solid ${T.border}`, color: T.text }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: T.textSec }}>Severity</label>
                    <select
                      value={newIncident.severity}
                      onChange={e => setNewIncident(v => ({ ...v, severity: e.target.value }))}
                      className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                      style={{ background: T.deep, border: `1px solid ${T.border}`, color: T.text }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: T.textSec }}>Affected system</label>
                    <input
                      value={newIncident.affected_system}
                      onChange={e => setNewIncident(v => ({ ...v, affected_system: e.target.value }))}
                      placeholder="e.g. webhooks, redis, db"
                      className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                      style={{ background: T.deep, border: `1px solid ${T.border}`, color: T.text }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: T.textSec }}>Description</label>
                  <textarea
                    value={newIncident.description}
                    onChange={e => setNewIncident(v => ({ ...v, description: e.target.value }))}
                    rows={3}
                    placeholder="What happened? What's affected?"
                    className="w-full text-xs px-3 py-2 rounded-lg outline-none resize-none"
                    style={{ background: T.deep, border: `1px solid ${T.border}`, color: T.text }}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowCreateIncident(false)}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ color: T.textSec, border: `1px solid ${T.border}` }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleCreateIncident()}
                    disabled={savingIncident || !newIncident.title.trim()}
                    className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                    style={{ background: '#16C784', color: '#ffffff' }}
                  >
                    {savingIncident ? 'Saving…' : 'Log Incident'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {incidents.length === 0 && !incidentError ? (
            <div className="text-xs py-8 text-center" style={{ color: T.textDim }}>No incidents logged.</div>
          ) : (
            <div className="space-y-3">
              {incidents.map(inc => {
                const sev    = inc.severity as string
                const status = inc.status   as string
                const sevColor =
                  sev === 'critical' ? '#EF4444' :
                  sev === 'high'     ? '#F59E0B' :
                  sev === 'medium'   ? '#3B82F6' :
                  '#16C784'
                return (
                  <div
                    key={inc.id as string}
                    className="rounded-xl p-4"
                    style={{ background: T.card, border: `1px solid ${T.border}` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[9px] mono px-1.5 py-0.5 rounded font-semibold"
                            style={{ color: sevColor, background: `${sevColor}14`, border: `1px solid ${sevColor}30` }}
                          >
                            {sev.toUpperCase()}
                          </span>
                          {Boolean(inc.affected_system) && (
                            <span className="text-[9px] mono px-1.5 py-0.5 rounded" style={{ color: T.textDim, border: `1px solid ${T.border}` }}>
                              {inc.affected_system as string}
                            </span>
                          )}
                          <span className="text-[9px]" style={{ color: T.textDim }}>
                            {new Date(inc.created_at as string).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm font-medium mb-1" style={{ color: T.text }}>{inc.title as string}</p>
                        {Boolean(inc.description) && (
                          <p className="text-xs" style={{ color: T.textSec }}>{inc.description as string}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <StatusBadge size="sm" status={
                          status === 'resolved' ? 'healthy' :
                          status === 'open' || status === 'investigating' ? 'degraded' :
                          'missing'
                        } />
                        {status !== 'resolved' && status !== 'ignored' && (
                          <select
                            value={status}
                            onChange={e => void updateIncidentStatus(inc.id as string, e.target.value)}
                            className="text-[9px] px-1.5 py-0.5 rounded outline-none mono"
                            style={{ background: T.deep, border: `1px solid ${T.border}`, color: T.textSec }}
                          >
                            <option value="open">Open</option>
                            <option value="investigating">Investigating</option>
                            <option value="resolved">Resolved</option>
                            <option value="ignored">Ignored</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── READINESS tab ────────────────────────────────────────── */}
      {activeTab === 'readiness' && (
        <div>
          <div className="rounded-xl p-6 mb-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold" style={{ color: T.text }}>Production Readiness Score</h2>
              <div>
                <span className="text-3xl font-bold mono" style={{ color: scoreColor }}>{totalScore}</span>
                <span className="text-sm ml-1" style={{ color: T.textDim }}>/ {maxScore}</span>
              </div>
            </div>
            <div className="w-full rounded-full h-2 mb-3" style={{ background: T.border }}>
              <div
                className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${(totalScore / maxScore) * 100}%`, background: scoreColor }}
              />
            </div>
            <p className="text-xs" style={{ color: T.textSec }}>
              {totalScore >= 85
                ? 'Ready for production launch. All critical systems are operational and configured.'
                : totalScore >= 60
                  ? 'Approaching production-ready. Address degraded systems before launching publicly.'
                  : 'Not production-ready. Critical infrastructure gaps detected. Resolve before going live.'}
            </p>
          </div>

          <div className="space-y-3">
            {readinessCategories.map(cat => {
              const catColor = cat.status === 'ok' ? '#16C784' : cat.status === 'partial' ? '#F59E0B' : '#EF4444'
              return (
                <div
                  key={cat.name}
                  className="rounded-xl p-4 flex items-center gap-4"
                  style={{ background: T.card, border: `1px solid ${cat.status === 'fail' ? '#EF444430' : T.border}` }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold mono flex-shrink-0"
                    style={{ background: `${catColor}14`, color: catColor }}
                  >
                    {cat.points}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: T.text }}>{cat.name}</span>
                      <span className="text-xs mono" style={{ color: T.textDim }}>{cat.points} / {cat.max} pts</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: T.textSec }}>{cat.detail}</p>
                    <div className="w-full rounded-full h-1 mt-2" style={{ background: T.border }}>
                      <div
                        className="h-1 rounded-full"
                        style={{ width: `${(cat.points / cat.max) * 100}%`, background: catColor }}
                      />
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <StatusBadge size="sm" status={
                      cat.status === 'ok'      ? 'healthy'  :
                      cat.status === 'partial' ? 'degraded' :
                      'critical'
                    } />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── EXPORT tab fallback ──────────────────────────────────── */}
      {activeTab === 'export' && exportData && (
        <div>
          <SectionCard title="BACKUP / EXPORT READINESS">
            <Row label="Status"            value={<StatusBadge status={exportData.status as string} />} />
            <Row label="Available tables"  value={`${String(exportData.available_tables)} / ${String(exportData.total_tables)}`} />
            <Row label="Total rows"        value={Number(exportData.total_rows).toLocaleString()} />
            <Row label="PITR note"         value={exportData.supabase_backup_note as string} />
          </SectionCard>
          {Boolean(exportData.missing_tables) && (exportData.missing_tables as string[]).length > 0 && (
            <SectionCard title="MISSING TABLES">
              {(exportData.missing_tables as string[]).map(t => (
                <Row key={t} label={t} value="Not found" accent="#F59E0B" />
              ))}
            </SectionCard>
          )}
          <SectionCard title="TABLE DETAILS">
            {(exportData.tables as Array<{ table: string; count: number | null; available: boolean }>).map(t => (
              <Row
                key={t.table}
                label={t.table}
                value={t.available ? (t.count ?? 0).toLocaleString() : 'Missing'}
                accent={t.available ? undefined : '#F59E0B'}
              />
            ))}
          </SectionCard>
        </div>
      )}

      {/* ── Docs link at bottom ───────────────────────────────────── */}
      <div className="mt-8 flex items-center gap-2 text-xs" style={{ color: T.textDim }}>
        <FileDown size={12} />
        <span>All endpoints require owner JWT. Run schema migrations v8–v10 in Supabase for full coverage.</span>
      </div>
    </div>
  )
}
