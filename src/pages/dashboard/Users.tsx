import { useEffect, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  Search, X, RefreshCw, ChevronDown,
  Users, Globe, Monitor, AlertTriangle, Shield, Zap,
  Activity, Network,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import type { UserChecked, RiskEvent, Decision } from '../../types'
import { getRelatedRiskEntities, SEV_COLORS as TG_SEV } from '../../lib/trustGraph'
import type { TrustGraphResult } from '../../lib/trustGraph'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  code: string
  label: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

interface EventSummary {
  id: string
  external_user_id: string
  event_type: string
  trust_score: number
  fraud_score: number
  risk_level: string
  decision: string
  ip_address: string | null
  device_id: string | null
  signals_json: unknown
  created_at: string
}

interface UserRow {
  user: UserChecked
  total_events: number
  highest_fraud_score: number
  latest_decision: Decision | null
  latest_event_at: string | null
  distinct_ips: string[]
  distinct_devices: string[]
  has_block: boolean
  is_suspicious: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSignals(raw: unknown): Signal[] {
  if (!Array.isArray(raw)) return []
  return raw as Signal[]
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function relativeTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const s = Math.floor(d / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fraudColor(score: number): string {
  if (score >= 70) return '#EF4444'
  if (score >= 40) return '#F59E0B'
  return '#16C784'
}

function trustColor(score: number): string {
  if (score >= 70) return '#16C784'
  if (score >= 45) return '#F59E0B'
  return '#EF4444'
}

const SEV_COLORS: Record<string, string> = {
  low: '#16C784', medium: '#F59E0B', high: '#F97316', critical: '#EF4444',
}

function buildUserRows(users: UserChecked[], events: EventSummary[]): UserRow[] {
  const byUser = new Map<string, EventSummary[]>()
  for (const ev of events) {
    const arr = byUser.get(ev.external_user_id) ?? []
    arr.push(ev)
    byUser.set(ev.external_user_id, arr)
  }

  return users.map(u => {
    const evs = byUser.get(u.external_user_id) ?? []
    const sorted = [...evs].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const highest_fraud_score = evs.reduce((max, e) => Math.max(max, e.fraud_score), 0)
    const latest_decision = (sorted[0]?.decision ?? null) as Decision | null
    const latest_event_at = sorted[0]?.created_at ?? null
    const distinct_ips = [...new Set(evs.map(e => e.ip_address).filter(Boolean) as string[])]
    const distinct_devices = [...new Set(evs.map(e => e.device_id).filter(Boolean) as string[])]
    const has_block = evs.some(e => e.decision === 'block')
    const is_suspicious =
      has_block || highest_fraud_score > 60 || distinct_ips.length > 2 || distinct_devices.length > 2

    return {
      user: u,
      total_events: evs.length,
      highest_fraud_score,
      latest_decision,
      latest_event_at,
      distinct_ips,
      distinct_devices,
      has_block,
      is_suspicious,
    }
  })
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

function CollapsibleSection({
  title, icon, expanded, onToggle, badge, children,
}: {
  title: string
  icon: ReactNode
  expanded: boolean
  onToggle: () => void
  badge?: number
  children: ReactNode
}) {
  const T = useT()
  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3.5 transition-colors duration-100"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = T.card)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="flex items-center gap-2.5">
          <span style={{ color: T.textDim }}>{icon}</span>
          <span className="text-xs font-semibold" style={{ color: T.textSec }}>{title}</span>
          {badge !== undefined && badge > 0 && (
            <span
              className="text-[10px] mono px-1.5 py-0.5 rounded"
              style={{ background: T.card, color: T.textDim, border: `1px solid ${T.border}` }}
            >
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          size={12}
          style={{
            color: T.textDim,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        />
      </button>
      {expanded && (
        <div className="px-6 pb-5">{children}</div>
      )}
    </div>
  )
}

// ─── UserDetailPanel ──────────────────────────────────────────────────────────

function UserDetailPanel({
  row, onClose,
}: {
  row: UserRow
  onClose: () => void
}) {
  const T = useT()
  const [events, setEvents] = useState<RiskEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string>('profile')
  const toggle = (s: string) => setOpen(p => p === s ? '' : s)

  useEffect(() => {
    setLoading(true)
    void (async () => {
      const { data } = await supabase
        .from('risk_events')
        .select('*')
        .eq('organization_id', row.user.organization_id)
        .eq('external_user_id', row.user.external_user_id)
        .order('created_at', { ascending: false })
        .limit(200)
      setEvents((data ?? []) as RiskEvent[])
      setLoading(false)
    })()
  }, [row.user.external_user_id, row.user.organization_id])

  // Derived aggregates from loaded events
  const ipCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ev of events) {
      if (ev.ip_address) map[ev.ip_address] = (map[ev.ip_address] ?? 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [events])

  const deviceCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ev of events) {
      if (ev.device_id) map[ev.device_id] = (map[ev.device_id] ?? 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [events])

  const decisionCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ev of events) {
      map[ev.decision] = (map[ev.decision] ?? 0) + 1
    }
    return map as Record<Decision, number>
  }, [events])

  const recurringSignals = useMemo(() => {
    const map: Record<string, { label: string; severity: string; count: number }> = {}
    for (const ev of events) {
      for (const sig of parseSignals(ev.signals_json)) {
        if (!map[sig.code]) {
          map[sig.code] = { label: sig.label, severity: sig.severity, count: 0 }
        }
        map[sig.code].count++
      }
    }
    return Object.entries(map)
      .filter(([, v]) => v.count > 1)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
  }, [events])

  const u = row.user

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(5,11,20,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      <div
        className="fixed top-0 right-0 h-screen z-50 flex flex-col"
        style={{ width: 520, background: T.card, borderLeft: `1px solid ${T.border}` }}
      >
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: `1px solid ${T.border}` }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: T.textDim }}>
              User Profile
            </p>
            <p className="text-sm mono truncate font-medium" style={{ color: T.text, maxWidth: 380 }}>
              {u.external_user_id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ml-4 transition-colors"
            style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.textDim }}
            onMouseEnter={e => (e.currentTarget.style.color = T.text)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
          >
            <X size={13} />
          </button>
        </div>

        {/* Stat bar */}
        <div
          className="grid grid-cols-4 flex-shrink-0"
          style={{ borderBottom: `1px solid ${T.border}` }}
        >
          {[
            { label: 'Events',      value: row.total_events.toString(),              color: T.textSec },
            { label: 'Fraud peak',  value: row.highest_fraud_score.toString(),       color: fraudColor(row.highest_fraud_score) },
            { label: 'IPs',         value: row.distinct_ips.length.toString(),       color: row.distinct_ips.length > 2 ? '#F59E0B' : T.textSec },
            { label: 'Devices',     value: row.distinct_devices.length.toString(),   color: row.distinct_devices.length > 2 ? '#F59E0B' : T.textSec },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-5 py-3.5 text-center" style={{ borderRight: `1px solid ${T.border}` }}>
              <p className="text-xl font-bold mono" style={{ color }}>{value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: T.textDim }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Suspicious banner */}
        {row.is_suspicious && (
          <div
            className="flex items-center gap-2.5 px-6 py-2.5 flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}
          >
            <AlertTriangle size={12} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span className="text-xs" style={{ color: '#EF4444' }}>
              {row.has_block
                ? 'User has been blocked at least once.'
                : row.highest_fraud_score > 60
                ? `High fraud peak (${row.highest_fraud_score}).`
                : `Multiple IPs or devices detected.`}
            </span>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Profile */}
          <CollapsibleSection
            title="Profile"
            icon={<Users size={12} />}
            expanded={open === 'profile'}
            onToggle={() => toggle('profile')}
          >
            <div className="space-y-2.5">
              {(
                [
                  ['User ID',    u.external_user_id],
                  ['Email',      u.email],
                  ['Phone',      u.phone],
                  ['Country',    u.country],
                  ['First seen', formatTs(u.created_at)],
                  ['Last event', row.latest_event_at ? formatTs(row.latest_event_at) : null],
                ] as [string, string | null][]
              ).filter(([, v]) => Boolean(v)).map(([label, value]) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="text-[10px] flex-shrink-0 pt-px" style={{ color: T.textDim, minWidth: 76 }}>
                    {label}
                  </span>
                  <span className="text-xs mono break-all" style={{ color: T.textSec }}>{value}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Decisions */}
          <CollapsibleSection
            title="Decision History"
            icon={<Shield size={12} />}
            expanded={open === 'decisions'}
            onToggle={() => toggle('decisions')}
            badge={row.total_events}
          >
            {loading ? <LoadingRows /> : (
              <div className="space-y-2">
                {(['allow', 'review', 'block'] as Decision[]).map(dec => {
                  const count = decisionCounts[dec] ?? 0
                  const pct = row.total_events > 0 ? Math.round((count / row.total_events) * 100) : 0
                  return (
                    <div key={dec} className="flex items-center gap-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full mono badge-${dec} flex-shrink-0`} style={{ minWidth: 48, textAlign: 'center' }}>
                        {dec}
                      </span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 3, background: T.border }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: dec === 'block' ? '#EF4444' : dec === 'review' ? '#F59E0B' : '#16C784',
                            transition: 'width 0.5s ease',
                          }}
                        />
                      </div>
                      <span className="text-xs mono flex-shrink-0" style={{ color: T.textDim, minWidth: 28, textAlign: 'right' }}>
                        {count}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CollapsibleSection>

          {/* Risk Timeline */}
          <CollapsibleSection
            title="Risk Timeline"
            icon={<Activity size={12} />}
            expanded={open === 'timeline'}
            onToggle={() => toggle('timeline')}
            badge={events.length}
          >
            {loading ? <LoadingRows /> : events.length === 0 ? (
              <p className="text-xs" style={{ color: T.textDim }}>No events found.</p>
            ) : (
              <div className="space-y-1.5">
                {events.slice(0, 30).map((ev, i) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
                    style={{ background: i % 2 === 0 ? T.bg : 'transparent', border: `1px solid ${T.border}` }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-md mono"
                          style={{ background: T.deep, color: T.textSec, border: `1px solid ${T.border}` }}
                        >
                          {ev.event_type}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full badge-${ev.risk_level}`}>
                          {ev.risk_level}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full mono badge-${ev.decision}`}>
                          {ev.decision}
                        </span>
                      </div>
                      <p className="text-[10px] mono mt-1" style={{ color: T.textDim }}>
                        {formatTs(ev.created_at)} · {relativeTime(ev.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-[10px]" style={{ color: T.textDim }}>T</p>
                        <p className="text-xs mono font-semibold" style={{ color: trustColor(ev.trust_score) }}>
                          {ev.trust_score}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px]" style={{ color: T.textDim }}>F</p>
                        <p className="text-xs mono font-semibold" style={{ color: fraudColor(ev.fraud_score) }}>
                          {ev.fraud_score}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {events.length > 30 && (
                  <p className="text-[10px] text-center pt-1" style={{ color: T.textDim }}>
                    +{events.length - 30} older events not shown
                  </p>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* IPs */}
          <CollapsibleSection
            title="IP Addresses"
            icon={<Globe size={12} />}
            expanded={open === 'ips'}
            onToggle={() => toggle('ips')}
            badge={ipCounts.length}
          >
            {loading ? <LoadingRows /> : ipCounts.length === 0 ? (
              <p className="text-xs" style={{ color: T.textDim }}>No IP data recorded.</p>
            ) : (
              <div className="space-y-1.5">
                {ipCounts.map(([ip, count]) => (
                  <div key={ip} className="flex items-center justify-between gap-3">
                    <span className="text-xs mono" style={{ color: T.textSec }}>{ip}</span>
                    <span
                      className="text-[10px] mono px-2 py-0.5 rounded"
                      style={{ background: T.bg, color: T.textDim, border: `1px solid ${T.border}` }}
                    >
                      {count} event{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Devices */}
          <CollapsibleSection
            title="Devices"
            icon={<Monitor size={12} />}
            expanded={open === 'devices'}
            onToggle={() => toggle('devices')}
            badge={deviceCounts.length}
          >
            {loading ? <LoadingRows /> : deviceCounts.length === 0 ? (
              <p className="text-xs" style={{ color: T.textDim }}>No device data recorded.</p>
            ) : (
              <div className="space-y-1.5">
                {deviceCounts.map(([dev, count]) => (
                  <div key={dev} className="flex items-center justify-between gap-3">
                    <span className="text-xs mono truncate" style={{ color: T.textSec, maxWidth: 320 }}>
                      {dev}
                    </span>
                    <span
                      className="text-[10px] mono px-2 py-0.5 rounded flex-shrink-0"
                      style={{ background: T.bg, color: T.textDim, border: `1px solid ${T.border}` }}
                    >
                      {count} event{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Risk Network */}
          <UserTrustGraphSection row={row} />

          {/* Recurring signals */}
          <CollapsibleSection
            title="Recurring Signals"
            icon={<Zap size={12} />}
            expanded={open === 'signals'}
            onToggle={() => toggle('signals')}
            badge={recurringSignals.length}
          >
            {loading ? <LoadingRows /> : recurringSignals.length === 0 ? (
              <p className="text-xs" style={{ color: T.textDim }}>
                No recurring signals — user appears clean across events.
              </p>
            ) : (
              <div className="space-y-2">
                {recurringSignals.map(([code, { label, severity, count }]) => (
                  <div
                    key={code}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: T.bg, border: `1px solid ${T.border}` }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium" style={{ color: T.text }}>{label}</p>
                      <p className="text-[10px] mono mt-0.5" style={{ color: T.textDim }}>{code}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium mono"
                        style={{
                          background: `${SEV_COLORS[severity] ?? '#475569'}18`,
                          color: SEV_COLORS[severity] ?? '#475569',
                          border: `1px solid ${SEV_COLORS[severity] ?? '#475569'}30`,
                        }}
                      >
                        {severity}
                      </span>
                      <span className="text-[10px] mono" style={{ color: T.textDim }}>×{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <div style={{ height: 48 }} />
        </div>
      </div>
    </>
  )
}

function LoadingRows() {
  const T = useT()
  return (
    <div className="flex items-center gap-2" style={{ color: T.textDim }}>
      <RefreshCw size={10} className="animate-spin" />
      <span className="text-xs">Loading…</span>
    </div>
  )
}

// ─── UserTrustGraphSection ────────────────────────────────────────────────────

function UserTrustGraphSection({ row }: { row: UserRow }) {
  const T = useT()
  const [open,    setOpen]    = useState(false)
  const [fetched, setFetched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<TrustGraphResult | null>(null)

  const load = async () => {
    if (fetched || loading) return
    setLoading(true)
    try {
      const data = await getRelatedRiskEntities({
        organization_id:  row.user.organization_id,
        external_user_id: row.user.external_user_id,
        ip_address:       row.distinct_ips[0]      ?? null,
        device_id:        row.distinct_devices[0]  ?? null,
        email:            row.user.email,
        country:          row.user.country,
      }, supabase)
      setResult(data)
    } finally {
      setFetched(true)
      setLoading(false)
    }
  }

  const toggle = () => {
    if (!open) void load()
    setOpen(o => !o)
  }

  const score   = result?.summary.network_risk_score ?? 0
  const topSev  = result?.summary.highest_severity ?? null
  const hasData = result && (
    result.suspicious_clusters.length > 0 ||
    result.related_users.length > 0 ||
    result.shared_ips.length > 0 ||
    result.shared_devices.length > 0
  )

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-6 py-3.5 transition-colors duration-100"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = T.card)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="flex items-center gap-2.5">
          <Network size={12} style={{ color: T.textDim }} />
          <span className="text-xs font-semibold" style={{ color: T.textSec }}>Risk Network</span>
          {fetched && result && result.summary.total_connections > 0 && (
            <span className="text-[10px] mono px-1.5 py-0.5 rounded"
              style={{ background: T.card, color: T.textDim, border: `1px solid ${T.border}` }}>
              {result.summary.total_connections}
            </span>
          )}
          {fetched && topSev && (
            <span className="text-[10px] mono px-1.5 py-0.5 rounded"
              style={{ background: TG_SEV[topSev].bg, color: TG_SEV[topSev].text, border: `1px solid ${TG_SEV[topSev].border}` }}>
              {topSev}
            </span>
          )}
        </div>
        <ChevronDown size={12}
          style={{ color: T.textDim, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div className="px-6 pb-5 space-y-4">
          {loading && (
            <div className="flex items-center gap-2" style={{ color: T.textDim }}>
              <RefreshCw size={10} className="animate-spin" />
              <span className="text-xs">Analyzing risk network…</span>
            </div>
          )}

          {fetched && !hasData && (
            <p className="text-xs" style={{ color: T.textDim }}>
              No cross-account connections detected.
            </p>
          )}

          {fetched && result && hasData && (
            <>
              {/* Score bar */}
              <div className="p-3 rounded-lg" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textDim }}>
                    Network Risk Score
                  </span>
                  <span className="text-sm font-bold mono"
                    style={{ color: score >= 70 ? '#EF4444' : score >= 40 ? '#F59E0B' : '#16C784' }}>
                    {score}
                  </span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 4, background: T.border }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${score}%`, background: score >= 70 ? '#EF4444' : score >= 40 ? '#F59E0B' : '#16C784' }} />
                </div>
                <p className="text-[10px] mono mt-2" style={{ color: T.textDim }}>
                  {result.summary.total_connections} connection{result.summary.total_connections !== 1 ? 's' : ''} · {result.suspicious_clusters.length} cluster{result.suspicious_clusters.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Clusters */}
              {result.suspicious_clusters.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textDim }}>
                    Suspicious Patterns
                  </p>
                  {result.suspicious_clusters.map((c, i) => (
                    <div key={i} className="rounded-lg overflow-hidden"
                      style={{ border: `1px solid ${TG_SEV[c.severity].border}`, borderLeft: `3px solid ${TG_SEV[c.severity].text}` }}>
                      <div className="px-3 py-2.5" style={{ background: TG_SEV[c.severity].bg }}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-xs font-semibold" style={{ color: T.text }}>{c.title}</p>
                          <span className="text-[9px] mono px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ color: TG_SEV[c.severity].text, border: `1px solid ${TG_SEV[c.severity].border}` }}>
                            {c.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed" style={{ color: T.textSec }}>
                          {c.description}
                        </p>
                        {c.evidence.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {c.evidence.map((e, j) => (
                              <li key={j} className="text-[10px] mono flex items-center gap-1.5" style={{ color: T.textDim }}>
                                <span style={{ color: TG_SEV[c.severity].text }}>›</span>
                                {e}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Connected accounts (condensed) */}
              {result.related_users.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textDim }}>
                    Connected Accounts ({result.related_users.length})
                  </p>
                  <div className="space-y-1.5">
                    {result.related_users.slice(0, 8).map(u => (
                      <div key={u.external_user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                        style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] mono truncate" style={{ color: T.textSec }}>
                            {u.external_user_id}
                          </p>
                          <p className="text-[9px] mt-0.5" style={{ color: T.textDim }}>
                            via {u.connection_type === 'shared_ip' ? 'IP' : u.connection_type === 'shared_device' ? 'device' : 'email'} · {u.event_count} events
                            {u.has_block ? ' · blocked' : ''}
                          </p>
                        </div>
                        <span className="text-xs mono font-semibold flex-shrink-0"
                          style={{ color: u.highest_fraud_score >= 70 ? '#EF4444' : u.highest_fraud_score >= 40 ? '#F59E0B' : '#16C784' }}>
                          F{u.highest_fraud_score}
                        </span>
                      </div>
                    ))}
                    {result.related_users.length > 8 && (
                      <p className="text-[10px] text-center" style={{ color: T.textDim }}>
                        +{result.related_users.length - 8} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FREE_HISTORY_HOURS = 48

export default function UsersPage() {
  const T = useT()
  const { user } = useAuth()
  const [orgId,    setOrgId]    = useState<string | null>(null)
  const [freePlan, setFreePlan] = useState(false)
  const [rows,     setRows]     = useState<UserRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const [search,      setSearch]      = useState('')
  const [susOnly,     setSusOnly]     = useState(false)
  const [selected,    setSelected]    = useState<UserRow | null>(null)

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, organizations(plan)')
        .eq('user_id', user.id)
        .single()
      if (profile?.organization_id) {
        setOrgId(profile.organization_id as string)
        const orgs = profile.organizations as unknown as { plan: string }[] | { plan: string } | null
        const plan = Array.isArray(orgs) ? orgs[0]?.plan : orgs?.plan
        setFreePlan(plan === 'free' || !plan)
      } else {
        setError('No organization linked to this account.')
        setLoading(false)
      }
    })()
  }, [user])

  const fetchData = useCallback(async () => {
    if (!orgId) return
    setLoading(true)

    const cutoff = freePlan
      ? new Date(Date.now() - FREE_HISTORY_HOURS * 60 * 60 * 1000).toISOString()
      : null

    let eventsQuery = supabase
      .from('risk_events')
      .select('id, external_user_id, event_type, trust_score, fraud_score, risk_level, decision, ip_address, device_id, signals_json, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (cutoff) eventsQuery = eventsQuery.gte('created_at', cutoff)

    const [usersRes, eventsRes] = await Promise.all([
      supabase
        .from('users_checked')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(500),

      eventsQuery,
    ])

    if (usersRes.error) {
      setError(usersRes.error.message)
      setLoading(false)
      return
    }

    const users  = (usersRes.data  ?? []) as UserChecked[]
    const events = (eventsRes.data ?? []) as EventSummary[]
    setRows(buildUserRows(users, events))
    setLoading(false)
  }, [orgId, freePlan])

  useEffect(() => { void fetchData() }, [fetchData])

  const filtered = useMemo(() => rows.filter(r => {
    if (susOnly && !r.is_suspicious) return false
    if (search) {
      const q = search.toLowerCase()
      const u = r.user
      const hit =
        u.external_user_id.toLowerCase().includes(q) ||
        (u.email?.toLowerCase().includes(q) ?? false) ||
        (u.phone?.toLowerCase().includes(q) ?? false) ||
        (u.ip_address?.toLowerCase().includes(q) ?? false) ||
        (u.device_id?.toLowerCase().includes(q) ?? false) ||
        r.distinct_ips.some(ip => ip.toLowerCase().includes(q)) ||
        r.distinct_devices.some(d => d.toLowerCase().includes(q))
      if (!hit) return false
    }
    return true
  }), [rows, search, susOnly])

  const suspiciousCount = useMemo(() => rows.filter(r => r.is_suspicious).length, [rows])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: T.textDim }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading users…</span>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <div className="g-card p-5 text-sm" style={{ color: '#EF4444' }}>{error}</div>
    </div>
  )

  return (
    <div className="p-7">

      {freePlan && (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg mb-5 text-xs"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#F59E0B' }}
        >
          <AlertTriangle size={12} />
          Free plan: showing last 48 hours of data only.
          <a href="/dashboard/settings?tab=billing" className="underline ml-1" style={{ color: '#F59E0B' }}>Upgrade for full history</a>
        </div>
      )}

      {/* Sub-header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: T.textDim }}>
          {filtered.length.toLocaleString()} user{filtered.length !== 1 ? 's' : ''}
          {filtered.length !== rows.length && ` (of ${rows.length.toLocaleString()})`}
          {suspiciousCount > 0 && (
            <span style={{ color: '#EF4444' }}> · {suspiciousCount} suspicious</span>
          )}
        </p>
        <button
          onClick={() => void fetchData()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{ border: `1px solid ${T.border}`, color: T.textDim }}
          onMouseEnter={e => (e.currentTarget.style.color = T.textSec)}
          onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
        >
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: T.textDim }}
          />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="User ID, email, phone, IP, device…"
            className="g-input text-xs"
            style={{ paddingLeft: 30, height: 32, width: 280, background: T.inputBg }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: T.textDim }}
            >
              <X size={10} />
            </button>
          )}
        </div>

        <button
          onClick={() => setSusOnly(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{
            border: susOnly ? '1px solid rgba(239,68,68,0.4)' : `1px solid ${T.border}`,
            background: susOnly ? 'rgba(239,68,68,0.08)' : 'transparent',
            color: susOnly ? '#EF4444' : T.textDim,
          }}
        >
          <AlertTriangle size={11} />
          Suspicious only
          {suspiciousCount > 0 && (
            <span className="mono text-[10px]">({suspiciousCount})</span>
          )}
        </button>
      </div>

      {/* Table */}
      <div className="g-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={24} className="mx-auto mb-3" style={{ color: T.border }} />
            <p className="text-sm font-semibold mb-1.5" style={{ color: T.textDim }}>
              {rows.length === 0 ? 'No users analyzed yet' : 'No users match your filters'}
            </p>
            {(search || susOnly) && (
              <button
                onClick={() => { setSearch(''); setSusOnly(false) }}
                className="text-xs"
                style={{ color: '#16C784' }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {['User','Email','Country','Events','Fraud peak','Latest decision','IPs','Devices','First seen'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: T.textDim, background: T.deep }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const u = row.user
                  const isSelected = selected?.user.id === u.id
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelected(row)}
                      className="cursor-pointer"
                      style={{
                        borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none',
                        background: isSelected ? T.elevated : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = T.dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {row.is_suspicious && (
                            <AlertTriangle size={10} style={{ color: '#EF4444', flexShrink: 0 }} />
                          )}
                          <p className="text-xs mono truncate" style={{ maxWidth: 140, color: T.textSec }}>
                            {u.external_user_id}
                          </p>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3">
                        <span className="text-xs truncate" style={{ maxWidth: 160, color: T.textDim, display: 'block' }}>
                          {u.email ?? '—'}
                        </span>
                      </td>

                      {/* Country */}
                      <td className="px-4 py-3">
                        <span className="text-xs mono" style={{ color: T.textDim }}>
                          {u.country ?? '—'}
                        </span>
                      </td>

                      {/* Events */}
                      <td className="px-4 py-3">
                        <span className="text-xs mono font-semibold" style={{ color: T.textSec }}>
                          {row.total_events}
                        </span>
                      </td>

                      {/* Fraud peak */}
                      <td className="px-4 py-3">
                        <span
                          className="text-xs mono font-semibold"
                          style={{ color: row.total_events > 0 ? fraudColor(row.highest_fraud_score) : T.textDim }}
                        >
                          {row.total_events > 0 ? row.highest_fraud_score : '—'}
                        </span>
                      </td>

                      {/* Latest decision */}
                      <td className="px-4 py-3">
                        {row.latest_decision ? (
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full mono badge-${row.latest_decision}`}>
                            {row.latest_decision}
                          </span>
                        ) : (
                          <span style={{ color: T.textDim }}>—</span>
                        )}
                      </td>

                      {/* IPs */}
                      <td className="px-4 py-3">
                        <span
                          className="text-xs mono"
                          style={{ color: row.distinct_ips.length > 2 ? '#F59E0B' : T.textDim }}
                        >
                          {row.distinct_ips.length}
                        </span>
                      </td>

                      {/* Devices */}
                      <td className="px-4 py-3">
                        <span
                          className="text-xs mono"
                          style={{ color: row.distinct_devices.length > 2 ? '#F59E0B' : T.textDim }}
                        >
                          {row.distinct_devices.length}
                        </span>
                      </td>

                      {/* First seen */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-[10px] mono" style={{ color: T.textSec }}>
                          {formatTs(u.created_at)}
                        </p>
                        <p className="text-[10px] mono mt-0.5" style={{ color: T.textDim }}>
                          {relativeTime(u.created_at)}
                        </p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <UserDetailPanel
          key={selected.user.id}
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
