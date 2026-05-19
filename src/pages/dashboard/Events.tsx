import { useEffect, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  Search, X, RefreshCw, ChevronDown,
  Shield, User, Globe, Monitor, AlertTriangle, Zap,
  Mail, Activity, CheckCircle2, ShieldCheck, Eye, Network,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import { buildRiskReasons, calcConfidence } from '../../lib/riskEngine'
import type { RiskEvent, RiskLevel, Decision, EventType } from '../../types'
import FeedbackSection from '../../components/FeedbackSection'
import type { RiskReason, ConfidenceLevel } from '../../lib/riskEngine'
import { getRelatedRiskEntities, SEV_COLORS as TG_SEV } from '../../lib/trustGraph'
import type { TrustGraphResult } from '../../lib/trustGraph'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  code: string
  label: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

interface RelatedData {
  sameUser:   Partial<RiskEvent>[]
  sameIP:     Partial<RiskEvent>[]
  sameDevice: Partial<RiskEvent>[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DATE_RANGES = [
  { label: 'Today',        hours: 24   },
  { label: 'Last 7 days',  hours: 168  },
  { label: 'Last 30 days', hours: 720  },
  { label: 'Last 90 days', hours: 2160 },
]

const SEV_COLORS: Record<string, string> = {
  low: '#16C784', medium: '#F59E0B', high: '#F97316', critical: '#EF4444',
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
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function trustColor(score: number): string {
  if (score >= 70) return '#16C784'
  if (score >= 45) return '#F59E0B'
  return '#EF4444'
}

function fraudColor(score: number): string {
  if (score >= 70) return '#EF4444'
  if (score >= 40) return '#F59E0B'
  return '#16C784'
}

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  const T = useT()
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
        <span className="text-2xl font-bold mono" style={{ color }}>{score}</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 4, background: T.border }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, background: color, transition: 'width 0.6s ease' }}
        />
      </div>
    </div>
  )
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
    <div style={{ borderBottom: `1px solid ${T.deep}` }}>
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
        <div className="px-6 pb-5">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── RelatedRow ───────────────────────────────────────────────────────────────

function RelatedRow({ ev, onSelect }: { ev: Partial<RiskEvent>; onSelect: () => void }) {
  const T = useT()
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center justify-between px-2 py-2.5 rounded-lg text-left transition-colors duration-100"
      style={{ background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = T.elevated)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div className="min-w-0">
        <p className="text-xs mono truncate" style={{ color: T.textSec, maxWidth: 170 }}>
          {ev.external_user_id ?? ev.id}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: T.textDim }}>
          {ev.event_type ?? '—'}
          {ev.created_at ? ` · ${relativeTime(ev.created_at)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
        {ev.risk_level && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full badge-${ev.risk_level}`}>
            {ev.risk_level}
          </span>
        )}
        {ev.decision && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full mono badge-${ev.decision}`}>
            {ev.decision}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Explainability helpers ───────────────────────────────────────────────────

const CATEGORY_ICON: Record<string, ReactNode> = {
  email:      <Mail     size={11} />,
  ip:         <Globe    size={11} />,
  device:     <Monitor  size={11} />,
  velocity:   <Zap      size={11} />,
  behavioral: <Activity size={11} />,
}

const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; color: string; bg: string }> = {
  high:   { label: 'High confidence',   color: '#16C784', bg: 'rgba(22,199,132,0.08)'  },
  medium: { label: 'Medium confidence', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)'  },
  low:    { label: 'Low confidence',    color: '#F97316', bg: 'rgba(249,115,22,0.08)'  },
}

function parseRiskReasons(raw: unknown, signals: Signal[]): RiskReason[] {
  if (Array.isArray(raw) && raw.length > 0) return raw as RiskReason[]
  // Fallback: derive from signals for events that pre-date this feature
  return buildRiskReasons(signals as Parameters<typeof buildRiskReasons>[0])
}

function RiskReasonsSection({
  event, signals,
}: {
  event: RiskEvent
  signals: Signal[]
}) {
  const T = useT()
  const reasons = parseRiskReasons(event.risk_reasons_json, signals)
  const confidence = event.confidence_level ?? calcConfidence(
    signals as Parameters<typeof calcConfidence>[0],
    event.fraud_score,
  )
  const recommendedAction = event.recommended_action

  if (reasons.length === 0 && !recommendedAction) return null

  const conf = CONFIDENCE_META[confidence]

  return (
    <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.deep}` }}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={12} style={{ color: '#818CF8' }} />
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textDim }}>
            Why this decision?
          </p>
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: conf.bg, color: conf.color, border: `1px solid ${conf.color}28` }}
        >
          {conf.label}
        </span>
      </div>

      {/* Recommended action */}
      {recommendedAction && (
        <p className="text-xs leading-relaxed mb-3" style={{ color: T.textSec }}>
          {recommendedAction}
        </p>
      )}

      {/* Reasons list */}
      {reasons.length > 0 && (
        <div className="space-y-2">
          {reasons.map((r, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: T.bg, border: `1px solid ${T.border}` }}
            >
              <span
                className="flex-shrink-0 mt-0.5"
                style={{ color: SEV_COLORS[r.severity] ?? T.textDim }}
              >
                {CATEGORY_ICON[r.category] ?? <AlertTriangle size={11} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed" style={{ color: T.text }}>{r.reason}</p>
              </div>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 mono"
                style={{
                  background: `${SEV_COLORS[r.severity] ?? T.textDim}18`,
                  color: SEV_COLORS[r.severity] ?? T.textDim,
                  border: `1px solid ${SEV_COLORS[r.severity] ?? T.textDim}30`,
                }}
              >
                {r.severity}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── TrustGraphSection ───────────────────────────────────────────────────────

function TrustGraphSection({ event }: { event: RiskEvent }) {
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
        organization_id:  event.organization_id,
        external_user_id: event.external_user_id,
        ip_address:       event.ip_address,
        device_id:        event.device_id,
        email:            event.email,
        country:          event.country,
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

  const score    = result?.summary.network_risk_score ?? 0
  const topSev   = result?.summary.highest_severity ?? null
  const hasData  = result && (
    result.suspicious_clusters.length > 0 ||
    result.related_users.length > 0 ||
    result.shared_ips.length > 0 ||
    result.shared_devices.length > 0
  )

  return (
    <div style={{ borderBottom: `1px solid ${T.deep}` }}>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-6 py-3.5 transition-colors duration-100"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = T.card)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="flex items-center gap-2.5">
          <Network size={12} style={{ color: T.textDim }} />
          <span className="text-xs font-semibold" style={{ color: T.textSec }}>
            Related Risk Network
          </span>
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
              No shared infrastructure or connected accounts detected.
            </p>
          )}

          {fetched && result && hasData && (
            <>
              {/* Network Risk Score */}
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
                <div className="flex items-center gap-3 mt-2 text-[10px] mono" style={{ color: T.textDim }}>
                  <span>{result.summary.total_connections} connection{result.summary.total_connections !== 1 ? 's' : ''}</span>
                  {result.suspicious_clusters.length > 0 && (
                    <><span>·</span><span>{result.suspicious_clusters.length} cluster{result.suspicious_clusters.length !== 1 ? 's' : ''}</span></>
                  )}
                  {result.countries_seen.length > 1 && (
                    <><span>·</span><span>{result.countries_seen.length} countries</span></>
                  )}
                </div>
              </div>

              {/* Suspicious Clusters */}
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
                          <p className="text-xs font-semibold leading-snug" style={{ color: T.text }}>
                            {c.title}
                          </p>
                          <span className="text-[9px] mono px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ background: TG_SEV[c.severity].bg, color: TG_SEV[c.severity].text, border: `1px solid ${TG_SEV[c.severity].border}` }}>
                            {c.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed" style={{ color: T.textSec }}>
                          {c.description}
                        </p>
                        {c.evidence.length > 0 && (
                          <ul className="mt-2 space-y-0.5">
                            {c.evidence.map((ev, j) => (
                              <li key={j} className="text-[10px] mono flex items-center gap-1.5" style={{ color: T.textDim }}>
                                <span style={{ color: TG_SEV[c.severity].text }}>›</span>
                                {ev}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Shared Infrastructure */}
              {(result.shared_ips.length > 0 || result.shared_devices.length > 0) && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textDim }}>
                    Shared Infrastructure
                  </p>
                  {result.shared_ips.map(ip => (
                    <div key={ip.ip_address} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                      style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                      <Globe size={11} style={{ color: T.textDim, flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs mono" style={{ color: T.textSec }}>{ip.ip_address}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: T.textDim }}>
                          {ip.distinct_user_count} users · {ip.total_events_24h} events (24h)
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {ip.signup_count_24h > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded mono"
                            style={{ background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)' }}>
                            {ip.signup_count_24h} signups
                          </span>
                        )}
                        {ip.block_count_24h > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded mono"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                            {ip.block_count_24h} blocks
                          </span>
                        )}
                        <span className="text-[9px] px-1.5 py-0.5 rounded mono"
                          style={{ background: TG_SEV[ip.severity].bg, color: TG_SEV[ip.severity].text, border: `1px solid ${TG_SEV[ip.severity].border}` }}>
                          {ip.severity}
                        </span>
                      </div>
                    </div>
                  ))}
                  {result.shared_devices.map(dev => (
                    <div key={dev.device_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                      style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                      <Monitor size={11} style={{ color: T.textDim, flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs mono truncate" style={{ color: T.textSec }}>
                          {dev.device_id.length > 20 ? `${dev.device_id.slice(0, 20)}…` : dev.device_id}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: T.textDim }}>
                          {dev.distinct_user_count} users · {dev.total_events} events
                          {dev.has_prior_block && ' · ⚑ prior block'}
                        </p>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded mono flex-shrink-0"
                        style={{ background: TG_SEV[dev.severity].bg, color: TG_SEV[dev.severity].text, border: `1px solid ${TG_SEV[dev.severity].border}` }}>
                        {dev.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Connected Accounts */}
              {result.related_users.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textDim }}>
                    Connected Accounts ({result.related_users.length})
                  </p>
                  <div className="space-y-1.5">
                    {result.related_users.slice(0, 10).map(u => (
                      <div key={u.external_user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                        style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] mono truncate" style={{ color: T.textSec }}>
                            {u.external_user_id}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded mono"
                              style={{ background: T.deep, color: T.textDim, border: `1px solid ${T.border}` }}>
                              via {u.connection_type === 'shared_ip' ? 'IP' : u.connection_type === 'shared_device' ? 'device' : 'email'}
                            </span>
                            <span className="text-[9px]" style={{ color: T.textDim }}>
                              {u.event_count} event{u.event_count !== 1 ? 's' : ''}
                            </span>
                            {u.has_block && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded mono"
                                style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                                blocked
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 space-y-0.5">
                          <p className="text-xs mono font-semibold"
                            style={{ color: u.highest_fraud_score >= 70 ? '#EF4444' : u.highest_fraud_score >= 40 ? '#F59E0B' : '#16C784' }}>
                            F{u.highest_fraud_score}
                          </p>
                          <p className="text-[9px] mono"
                            style={{ color: TG_SEV[u.severity].text }}>
                            {u.severity}
                          </p>
                        </div>
                      </div>
                    ))}
                    {result.related_users.length > 10 && (
                      <p className="text-[10px] text-center pt-1" style={{ color: T.textDim }}>
                        +{result.related_users.length - 10} more connected accounts
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

// ─── EventDetailPanel ─────────────────────────────────────────────────────────

function EventDetailPanel({
  event, onClose, onSelectRelated,
}: {
  event: RiskEvent
  onClose: () => void
  onSelectRelated: (id: string) => void
}) {
  const T = useT()
  const [related,        setRelated]        = useState<RelatedData | null>(null)
  const [loadingRelated, setLoadingRelated] = useState(false)
  const [open,           setOpen]           = useState<string>('user')

  const signals = parseSignals(event.signals_json)
  const toggle  = (s: string) => setOpen(p => p === s ? '' : s)

  useEffect(() => {
    setOpen('user')
    setLoadingRelated(true)
    const sel = 'id, external_user_id, event_type, risk_level, decision, created_at'
    const oid = event.organization_id

    void (async () => {
      const [userRes, ipRes, deviceRes] = await Promise.all([
        supabase
          .from('risk_events').select(sel)
          .eq('organization_id', oid)
          .eq('external_user_id', event.external_user_id)
          .neq('id', event.id)
          .order('created_at', { ascending: false }).limit(5),

        event.ip_address
          ? supabase
              .from('risk_events').select(sel)
              .eq('organization_id', oid)
              .eq('ip_address', event.ip_address)
              .neq('id', event.id)
              .order('created_at', { ascending: false }).limit(5)
          : Promise.resolve({ data: [] }),

        event.device_id
          ? supabase
              .from('risk_events').select(sel)
              .eq('organization_id', oid)
              .eq('device_id', event.device_id)
              .neq('id', event.id)
              .order('created_at', { ascending: false }).limit(5)
          : Promise.resolve({ data: [] }),
      ])

      setRelated({
        sameUser:   (userRes.data ?? [])                                  as Partial<RiskEvent>[],
        sameIP:     ((ipRes     as { data: unknown[] }).data ?? [])       as Partial<RiskEvent>[],
        sameDevice: ((deviceRes as { data: unknown[] }).data ?? [])       as Partial<RiskEvent>[],
      })
      setLoadingRelated(false)
    })()
  }, [event])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: T.dark ? 'rgba(5,11,20,0.55)' : 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-screen z-50 flex flex-col"
        style={{ width: 480, background: T.deep, borderLeft: `1px solid ${T.border}` }}
      >
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: `1px solid ${T.border}` }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: T.textDim }}>
              Event Detail
            </p>
            <p className="text-[11px] mono truncate" style={{ color: T.textDim, maxWidth: 340 }}>
              {event.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ml-4 transition-colors"
            style={{ background: T.card, border: `1px solid ${T.border}`, color: T.textDim }}
            onMouseEnter={e => (e.currentTarget.style.color = T.text)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
          >
            <X size={13} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Badges + timestamp */}
          <div
            className="px-6 py-4 flex items-center justify-between gap-3"
            style={{ borderBottom: `1px solid ${T.deep}` }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold badge-${event.risk_level}`}>
                {event.risk_level}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full mono badge-${event.decision}`}>
                {event.decision}
              </span>
              <span
                className="text-xs px-2 py-1 rounded-md mono"
                style={{ background: T.card, color: T.textSec, border: `1px solid ${T.border}` }}
              >
                {event.event_type}
              </span>
            </div>
            <p className="text-[10px] mono flex-shrink-0" style={{ color: T.textDim }}>
              {formatTs(event.created_at)}
            </p>
          </div>

          {/* Rule influence banner */}
          {event.applied_rule_name && (
            <div
              className="px-6 py-3 flex items-center gap-2.5"
              style={{ borderBottom: `1px solid ${T.deep}`, background: 'rgba(129,140,248,0.05)' }}
            >
              <ShieldCheck size={12} style={{ color: '#818CF8', flexShrink: 0 }} />
              <p className="text-xs" style={{ color: '#818CF8' }}>
                Decision influenced by rule:{' '}
                <span className="font-semibold" style={{ color: '#A5B4FC' }}>{event.applied_rule_name}</span>
              </p>
            </div>
          )}

          {/* Shadow mode banner */}
          {event.shadow_mode && (
            <div
              className="px-6 py-3 flex items-center gap-2.5"
              style={{ borderBottom: `1px solid ${T.deep}`, background: 'rgba(56,189,248,0.05)' }}
            >
              <Eye size={12} style={{ color: '#38BDF8', flexShrink: 0 }} />
              <p className="text-xs" style={{ color: '#38BDF8' }}>
                Shadow Mode —{' '}
                {event.suggested_decision && event.suggested_decision !== 'allow'
                  ? <>would have been <span className="font-semibold capitalize">{event.suggested_decision}</span> in Live Mode</>
                  : 'would have been Allowed in Live Mode'
                }
              </p>
            </div>
          )}

          {/* Score bars */}
          <div
            className="px-6 py-5 grid grid-cols-2 gap-6"
            style={{ borderBottom: `1px solid ${T.deep}` }}
          >
            <ScoreBar label="Trust Score" score={event.trust_score} color={trustColor(event.trust_score)} />
            <ScoreBar label="Fraud Score" score={event.fraud_score} color={fraudColor(event.fraud_score)} />
          </div>

          {/* AI Summary */}
          {event.ai_summary && (
            <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.deep}` }}>
              <div className="flex items-center gap-2 mb-2.5">
                <Zap size={12} style={{ color: '#16C784' }} />
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textDim }}>
                  AI Summary
                </p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: T.textSec }}>
                {event.ai_summary}
              </p>
            </div>
          )}

          {/* Explainability — Why this decision? */}
          <RiskReasonsSection event={event} signals={signals} />

          {/* Outcome Feedback */}
          <FeedbackSection event={event} />

          {/* User & Session */}
          <CollapsibleSection
            title="User & Session"
            icon={<User size={12} />}
            expanded={open === 'user'}
            onToggle={() => toggle('user')}
          >
            <div className="space-y-2.5">
              {(
                [
                  ['User ID',    event.external_user_id],
                  ['Email',      event.email],
                  ['IP Address', event.ip_address],
                  ['Device ID',  event.device_id],
                  ['Country',    event.country],
                  ['User Agent', event.user_agent],
                ] as [string, string | null][]
              ).filter(([, v]) => Boolean(v)).map(([label, value]) => (
                <div key={label} className="flex items-start gap-3">
                  <span
                    className="text-[10px] flex-shrink-0 pt-px"
                    style={{ color: T.textDim, minWidth: 76 }}
                  >
                    {label}
                  </span>
                  <span className="text-xs mono break-all" style={{ color: T.textSec }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Detected signals */}
          <CollapsibleSection
            title="Detected Signals"
            icon={<AlertTriangle size={12} />}
            expanded={open === 'signals'}
            onToggle={() => toggle('signals')}
            badge={signals.length}
          >
            {signals.length === 0 ? (
              <p className="text-xs" style={{ color: T.textDim }}>
                No suspicious signals — event appears clean.
              </p>
            ) : (
              <div className="space-y-2">
                {signals.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: T.bg, border: `1px solid ${T.border}` }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium" style={{ color: T.text }}>{s.label}</p>
                      <p className="text-[10px] mono mt-0.5" style={{ color: T.textDim }}>{s.code}</p>
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 mono"
                      style={{
                        background: `${SEV_COLORS[s.severity] ?? T.textDim}18`,
                        color: SEV_COLORS[s.severity] ?? T.textDim,
                        border: `1px solid ${SEV_COLORS[s.severity] ?? T.textDim}30`,
                      }}
                    >
                      {s.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Related: Same User */}
          <CollapsibleSection
            title="Same User — other events"
            icon={<User size={12} />}
            expanded={open === 'rel-user'}
            onToggle={() => toggle('rel-user')}
            badge={related?.sameUser.length}
          >
            {loadingRelated ? (
              <LoadingRelated />
            ) : !related?.sameUser.length ? (
              <Empty msg="No other events from this user." />
            ) : (
              <div className="-mx-2 space-y-0.5">
                {related.sameUser.map(ev => (
                  <RelatedRow
                    key={ev.id}
                    ev={ev}
                    onSelect={() => { if (ev.id) onSelectRelated(ev.id) }}
                  />
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Related: Same IP */}
          {event.ip_address && (
            <CollapsibleSection
              title={`Same IP · ${event.ip_address}`}
              icon={<Globe size={12} />}
              expanded={open === 'rel-ip'}
              onToggle={() => toggle('rel-ip')}
              badge={related?.sameIP.length}
            >
              {loadingRelated ? (
                <LoadingRelated />
              ) : !related?.sameIP.length ? (
                <Empty msg="No other users from this IP." />
              ) : (
                <div className="-mx-2 space-y-0.5">
                  {related.sameIP.map(ev => (
                    <RelatedRow
                      key={ev.id}
                      ev={ev}
                      onSelect={() => { if (ev.id) onSelectRelated(ev.id) }}
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* Related: Same Device */}
          {event.device_id && (
            <CollapsibleSection
              title="Same Device — other users"
              icon={<Monitor size={12} />}
              expanded={open === 'rel-device'}
              onToggle={() => toggle('rel-device')}
              badge={related?.sameDevice.length}
            >
              {loadingRelated ? (
                <LoadingRelated />
              ) : !related?.sameDevice.length ? (
                <Empty msg="No other users on this device." />
              ) : (
                <div className="-mx-2 space-y-0.5">
                  {related.sameDevice.map(ev => (
                    <RelatedRow
                      key={ev.id}
                      ev={ev}
                      onSelect={() => { if (ev.id) onSelectRelated(ev.id) }}
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* Trust Graph */}
          <TrustGraphSection event={event} />

          {/* Raw metadata */}
          <CollapsibleSection
            title="Raw Payload"
            icon={<Shield size={12} />}
            expanded={open === 'raw'}
            onToggle={() => toggle('raw')}
          >
            <pre
              className="text-[10px] mono leading-relaxed rounded-lg overflow-x-auto p-3"
              style={{ background: T.bg, color: T.textDim, border: `1px solid ${T.border}` }}
            >
              {JSON.stringify({
                id:               event.id,
                external_user_id: event.external_user_id,
                event_type:       event.event_type,
                ip_address:       event.ip_address,
                device_id:        event.device_id,
                email:            event.email,
                user_agent:       event.user_agent,
                country:          event.country,
                trust_score:      event.trust_score,
                fraud_score:      event.fraud_score,
                risk_level:       event.risk_level,
                decision:         event.decision,
                created_at:       event.created_at,
              }, null, 2)}
            </pre>
          </CollapsibleSection>

          <div style={{ height: 48 }} />
        </div>
      </div>
    </>
  )
}

function LoadingRelated() {
  const T = useT()
  return (
    <div className="flex items-center gap-2" style={{ color: T.textDim }}>
      <RefreshCw size={10} className="animate-spin" />
      <span className="text-xs">Loading…</span>
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  const T = useT()
  return <p className="text-xs" style={{ color: T.textDim }}>{msg}</p>
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FREE_HISTORY_HOURS = 48 // 2-day history for free plan

export default function Events() {
  const T = useT()
  const { user } = useAuth()
  const [orgId,    setOrgId]    = useState<string | null>(null)
  const [freePlan, setFreePlan] = useState(false)
  const [events,   setEvents]   = useState<RiskEvent[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  // Filters
  const [search,   setSearch]   = useState('')
  const [riskF,    setRiskF]    = useState<RiskLevel | ''>('')
  const [decF,     setDecF]     = useState<Decision | ''>('')
  const [typeF,    setTypeF]    = useState<EventType | ''>('')
  const [rangeIdx, setRangeIdx] = useState(1)

  // Detail panel
  const [selected, setSelected] = useState<RiskEvent | null>(null)

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
        setFreePlan(plan === 'free')
      } else {
        setError('No organization linked to this account.')
        setLoading(false)
      }
    })()
  }, [user])

  const fetchEvents = useCallback(async () => {
    if (!orgId) return
    // Free plan: cap to 2-day history regardless of selected range
    const hours = freePlan
      ? Math.min(DATE_RANGES[rangeIdx].hours, FREE_HISTORY_HOURS)
      : DATE_RANGES[rangeIdx].hours
    const since = new Date(Date.now() - hours * 3_600_000).toISOString()
    const { data, error: err } = await supabase
      .from('risk_events')
      .select('*')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)
    if (err) setError(err.message)
    else setEvents((data ?? []) as RiskEvent[])
    setLoading(false)
  }, [orgId, rangeIdx, freePlan])

  useEffect(() => { void fetchEvents() }, [fetchEvents])

  const filtered = useMemo(() => events.filter(ev => {
    if (search) {
      const q = search.toLowerCase()
      const hit =
        ev.external_user_id.toLowerCase().includes(q) ||
        (ev.email?.toLowerCase().includes(q) ?? false) ||
        (ev.ip_address?.toLowerCase().includes(q) ?? false) ||
        (ev.device_id?.toLowerCase().includes(q) ?? false)
      if (!hit) return false
    }
    if (riskF && ev.risk_level !== riskF) return false
    if (decF  && ev.decision   !== decF)  return false
    if (typeF && ev.event_type !== typeF)  return false
    return true
  }), [events, search, riskF, decF, typeF])

  const activeFilters = [search, riskF, decF, typeF].filter(Boolean).length

  const clearFilters = () => { setSearch(''); setRiskF(''); setDecF(''); setTypeF('') }

  const handleSelectRelated = useCallback(async (id: string) => {
    const local = events.find(e => e.id === id)
    if (local) { setSelected(local); return }
    const { data } = await supabase.from('risk_events').select('*').eq('id', id).single()
    if (data) setSelected(data as RiskEvent)
  }, [events])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: T.textDim }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading events…</span>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <div className="g-card p-5 text-sm" style={{ color: '#EF4444' }}>{error}</div>
    </div>
  )

  return (
    <div className="p-7">

      {/* Free plan history cap banner */}
      {freePlan && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl mb-5"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={13} style={{ color: '#F59E0B', flexShrink: 0 }} />
            <p className="text-xs" style={{ color: T.textSec }}>
              <strong style={{ color: '#F59E0B' }}>Free plan:</strong> event history limited to the last 2 days.
              Upgrade to Growth for 90-day history.
            </p>
          </div>
          <a href="mailto:sales@genuinux.io"
            className="text-xs font-semibold whitespace-nowrap"
            style={{ color: '#F59E0B' }}>
            Upgrade →
          </a>
        </div>
      )}

      {/* Sub-header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: T.textDim }}>
          {filtered.length.toLocaleString()} events
          {filtered.length !== events.length && ` (of ${events.length.toLocaleString()})`}
          {' · '}{DATE_RANGES[rangeIdx].label}
        </p>
        <div className="flex items-center gap-2">
          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
              style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444' }}
            >
              <X size={10} />
              Clear ({activeFilters})
            </button>
          )}
          <button
            onClick={() => void fetchEvents()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ border: `1px solid ${T.border}`, color: T.textDim }}
            onMouseEnter={e => (e.currentTarget.style.color = T.textSec)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
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
            placeholder="User ID, email, IP, device…"
            className="g-input text-xs"
            style={{ paddingLeft: 30, height: 32, width: 256 }}
          />
        </div>

        <select
          value={riskF}
          onChange={e => setRiskF(e.target.value as RiskLevel | '')}
          className="g-input text-xs"
          style={{ height: 32, width: 140 }}
        >
          <option value="">All risk levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>

        <select
          value={decF}
          onChange={e => setDecF(e.target.value as Decision | '')}
          className="g-input text-xs"
          style={{ height: 32, width: 130 }}
        >
          <option value="">All decisions</option>
          <option value="allow">Allow</option>
          <option value="review">Review</option>
          <option value="block">Block</option>
        </select>

        <select
          value={typeF}
          onChange={e => setTypeF(e.target.value as EventType | '')}
          className="g-input text-xs"
          style={{ height: 32, width: 148 }}
        >
          <option value="">All event types</option>
          <option value="signup">Signup</option>
          <option value="login">Login</option>
          <option value="transaction">Transaction</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="referral">Referral</option>
          <option value="checkout">Checkout</option>
          <option value="custom">Custom</option>
        </select>

        <select
          value={rangeIdx}
          onChange={e => setRangeIdx(Number(e.target.value))}
          className="g-input text-xs"
          style={{ height: 32, width: 130 }}
        >
          {DATE_RANGES.map((r, i) => (
            <option key={r.label} value={i}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="g-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Shield size={24} className="mx-auto mb-3" style={{ color: T.border }} />
            <p className="text-sm font-semibold mb-1.5" style={{ color: T.textDim }}>
              {events.length === 0 ? 'No events yet' : 'No events match your filters'}
            </p>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="text-xs" style={{ color: '#16C784' }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {['Event ID','User','Type','IP','Device','Trust','Fraud','Risk Level','Decision','Created at'].map(h => (
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
                {filtered.map((ev, i) => (
                  <tr
                    key={ev.id}
                    onClick={() => setSelected(ev)}
                    className="cursor-pointer"
                    style={{
                      borderBottom: i < filtered.length - 1 ? `1px solid ${T.deep}` : 'none',
                      background: selected?.id === ev.id ? T.card : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (selected?.id !== ev.id) e.currentTarget.style.background = T.dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
                    }}
                    onMouseLeave={e => {
                      if (selected?.id !== ev.id) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Event ID */}
                    <td className="px-4 py-3">
                      <span className="text-[10px] mono" style={{ color: T.textDim }}>
                        {ev.id.slice(0, 8)}…
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-4 py-3">
                      <p className="text-xs mono truncate" style={{ maxWidth: 130, color: T.textSec }}>
                        {ev.external_user_id}
                      </p>
                      {ev.email && (
                        <p className="text-[10px] truncate mt-0.5" style={{ maxWidth: 130, color: T.textDim }}>
                          {ev.email}
                        </p>
                      )}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-md mono whitespace-nowrap"
                        style={{ background: T.deep, color: T.textSec, border: `1px solid ${T.border}` }}
                      >
                        {ev.event_type}
                      </span>
                    </td>

                    {/* IP */}
                    <td className="px-4 py-3">
                      <span className="text-[11px] mono" style={{ color: T.textDim }}>
                        {ev.ip_address ?? '—'}
                      </span>
                    </td>

                    {/* Device */}
                    <td className="px-4 py-3">
                      <span className="text-[10px] mono" style={{ color: T.textDim }}>
                        {ev.device_id ? `${ev.device_id.slice(0, 8)}…` : '—'}
                      </span>
                    </td>

                    {/* Trust */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="rounded-full overflow-hidden flex-shrink-0"
                          style={{ width: 30, height: 2, background: T.border }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${ev.trust_score}%`, background: trustColor(ev.trust_score) }}
                          />
                        </div>
                        <span className="text-xs mono font-semibold" style={{ color: trustColor(ev.trust_score) }}>
                          {ev.trust_score}
                        </span>
                      </div>
                    </td>

                    {/* Fraud */}
                    <td className="px-4 py-3">
                      <span className="text-xs mono font-semibold" style={{ color: fraudColor(ev.fraud_score) }}>
                        {ev.fraud_score}
                      </span>
                    </td>

                    {/* Risk level */}
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium badge-${ev.risk_level}`}>
                        {ev.risk_level}
                      </span>
                    </td>

                    {/* Decision */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full mono badge-${ev.decision}`}>
                          {ev.decision}
                        </span>
                        {ev.shadow_mode && (
                          <span title={`Shadow mode — would have been: ${ev.suggested_decision ?? '—'}`}>
                            <Eye size={10} style={{ color: '#38BDF8', flexShrink: 0 }} />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Created at */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-[10px] mono" style={{ color: T.textSec }}>
                        {formatTs(ev.created_at)}
                      </p>
                      <p className="text-[10px] mono mt-0.5" style={{ color: T.textDim }}>
                        {relativeTime(ev.created_at)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panel — key forces remount on event change */}
      {selected && (
        <EventDetailPanel
          key={selected.id}
          event={selected}
          onClose={() => setSelected(null)}
          onSelectRelated={id => void handleSelectRelated(id)}
        />
      )}
    </div>
  )
}
