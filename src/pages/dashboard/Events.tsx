import { useEffect, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  Search, X, RefreshCw, ChevronDown,
  Shield, User, Globe, Monitor, AlertTriangle, Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { RiskEvent, RiskLevel, Decision, EventType } from '../../types'

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
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs" style={{ color: '#94A3B8' }}>{label}</span>
        <span className="text-2xl font-bold mono" style={{ color }}>{score}</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 4, background: '#1E2D3D' }}>
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
  return (
    <div style={{ borderBottom: '1px solid #0D1B2A' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3.5 transition-colors duration-100"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#0B1220')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="flex items-center gap-2.5">
          <span style={{ color: '#475569' }}>{icon}</span>
          <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>{title}</span>
          {badge !== undefined && badge > 0 && (
            <span
              className="text-[10px] mono px-1.5 py-0.5 rounded"
              style={{ background: '#0B1220', color: '#475569', border: '1px solid #1E2D3D' }}
            >
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          size={12}
          style={{
            color: '#475569',
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
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center justify-between px-2 py-2.5 rounded-lg text-left transition-colors duration-100"
      style={{ background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#0F1929')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div className="min-w-0">
        <p className="text-xs mono truncate" style={{ color: '#94A3B8', maxWidth: 170 }}>
          {ev.external_user_id ?? ev.id}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: '#2D4057' }}>
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

// ─── EventDetailPanel ─────────────────────────────────────────────────────────

function EventDetailPanel({
  event, onClose, onSelectRelated,
}: {
  event: RiskEvent
  onClose: () => void
  onSelectRelated: (id: string) => void
}) {
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
        style={{ background: 'rgba(5,11,20,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-screen z-50 flex flex-col"
        style={{ width: 480, background: '#07111F', borderLeft: '1px solid #1E2D3D' }}
      >
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #1E2D3D' }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#2D4057' }}>
              Event Detail
            </p>
            <p className="text-[11px] mono truncate" style={{ color: '#475569', maxWidth: 340 }}>
              {event.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ml-4 transition-colors"
            style={{ background: '#0B1220', border: '1px solid #1E2D3D', color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#E2E8F0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >
            <X size={13} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Badges + timestamp */}
          <div
            className="px-6 py-4 flex items-center justify-between gap-3"
            style={{ borderBottom: '1px solid #0D1B2A' }}
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
                style={{ background: '#0B1220', color: '#94A3B8', border: '1px solid #1E2D3D' }}
              >
                {event.event_type}
              </span>
            </div>
            <p className="text-[10px] mono flex-shrink-0" style={{ color: '#2D4057' }}>
              {formatTs(event.created_at)}
            </p>
          </div>

          {/* Score bars */}
          <div
            className="px-6 py-5 grid grid-cols-2 gap-6"
            style={{ borderBottom: '1px solid #0D1B2A' }}
          >
            <ScoreBar label="Trust Score" score={event.trust_score} color={trustColor(event.trust_score)} />
            <ScoreBar label="Fraud Score" score={event.fraud_score} color={fraudColor(event.fraud_score)} />
          </div>

          {/* AI Summary */}
          {event.ai_summary && (
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #0D1B2A' }}>
              <div className="flex items-center gap-2 mb-2.5">
                <Zap size={12} style={{ color: '#16C784' }} />
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
                  AI Summary
                </p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>
                {event.ai_summary}
              </p>
            </div>
          )}

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
                    style={{ color: '#475569', minWidth: 76 }}
                  >
                    {label}
                  </span>
                  <span className="text-xs mono break-all" style={{ color: '#94A3B8' }}>
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
              <p className="text-xs" style={{ color: '#2D4057' }}>
                No suspicious signals — event appears clean.
              </p>
            ) : (
              <div className="space-y-2">
                {signals.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: '#050B14', border: '1px solid #1E2D3D' }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium" style={{ color: '#E2E8F0' }}>{s.label}</p>
                      <p className="text-[10px] mono mt-0.5" style={{ color: '#475569' }}>{s.code}</p>
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 mono"
                      style={{
                        background: `${SEV_COLORS[s.severity] ?? '#475569'}18`,
                        color: SEV_COLORS[s.severity] ?? '#475569',
                        border: `1px solid ${SEV_COLORS[s.severity] ?? '#475569'}30`,
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

          {/* Raw metadata */}
          <CollapsibleSection
            title="Raw Payload"
            icon={<Shield size={12} />}
            expanded={open === 'raw'}
            onToggle={() => toggle('raw')}
          >
            <pre
              className="text-[10px] mono leading-relaxed rounded-lg overflow-x-auto p-3"
              style={{ background: '#050B14', color: '#475569', border: '1px solid #1E2D3D' }}
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
  return (
    <div className="flex items-center gap-2" style={{ color: '#475569' }}>
      <RefreshCw size={10} className="animate-spin" />
      <span className="text-xs">Loading…</span>
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-xs" style={{ color: '#2D4057' }}>{msg}</p>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Events() {
  const { user } = useAuth()
  const [orgId,   setOrgId]   = useState<string | null>(null)
  const [events,  setEvents]  = useState<RiskEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

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
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
      if (profile?.organization_id) {
        setOrgId(profile.organization_id as string)
      } else {
        setError('No organization linked to this account.')
        setLoading(false)
      }
    })()
  }, [user])

  const fetchEvents = useCallback(async () => {
    if (!orgId) return
    const since = new Date(Date.now() - DATE_RANGES[rangeIdx].hours * 3_600_000).toISOString()
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
  }, [orgId, rangeIdx])

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
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: '#475569' }}>
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

      {/* Sub-header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: '#475569' }}>
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
            style={{ border: '1px solid #1E2D3D', color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
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
            style={{ color: '#475569' }}
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
            <Shield size={24} className="mx-auto mb-3" style={{ color: '#1E2D3D' }} />
            <p className="text-sm font-semibold mb-1.5" style={{ color: '#475569' }}>
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
                <tr style={{ borderBottom: '1px solid #1E2D3D' }}>
                  {['Event ID','User','Type','IP','Device','Trust','Fraud','Risk Level','Decision','Created at'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: '#2D4057', background: '#07111F' }}
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
                      borderBottom: i < filtered.length - 1 ? '1px solid #0D1B2A' : 'none',
                      background: selected?.id === ev.id ? '#0B1220' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (selected?.id !== ev.id) e.currentTarget.style.background = '#0A1828'
                    }}
                    onMouseLeave={e => {
                      if (selected?.id !== ev.id) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Event ID */}
                    <td className="px-4 py-3">
                      <span className="text-[10px] mono" style={{ color: '#2D4057' }}>
                        {ev.id.slice(0, 8)}…
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-4 py-3">
                      <p className="text-xs mono truncate" style={{ maxWidth: 130, color: '#94A3B8' }}>
                        {ev.external_user_id}
                      </p>
                      {ev.email && (
                        <p className="text-[10px] truncate mt-0.5" style={{ maxWidth: 130, color: '#475569' }}>
                          {ev.email}
                        </p>
                      )}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-md mono whitespace-nowrap"
                        style={{ background: '#07111F', color: '#94A3B8', border: '1px solid #1E2D3D' }}
                      >
                        {ev.event_type}
                      </span>
                    </td>

                    {/* IP */}
                    <td className="px-4 py-3">
                      <span className="text-[11px] mono" style={{ color: '#475569' }}>
                        {ev.ip_address ?? '—'}
                      </span>
                    </td>

                    {/* Device */}
                    <td className="px-4 py-3">
                      <span className="text-[10px] mono" style={{ color: '#475569' }}>
                        {ev.device_id ? `${ev.device_id.slice(0, 8)}…` : '—'}
                      </span>
                    </td>

                    {/* Trust */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="rounded-full overflow-hidden flex-shrink-0"
                          style={{ width: 30, height: 2, background: '#1E2D3D' }}
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
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full mono badge-${ev.decision}`}>
                        {ev.decision}
                      </span>
                    </td>

                    {/* Created at */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-[10px] mono" style={{ color: '#94A3B8' }}>
                        {formatTs(ev.created_at)}
                      </p>
                      <p className="text-[10px] mono mt-0.5" style={{ color: '#2D4057' }}>
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
