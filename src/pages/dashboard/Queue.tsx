import { useEffect, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  RefreshCw, X, ChevronDown, CheckCircle, XCircle,
  AlertTriangle, MessageSquare, ArrowUpCircle, RotateCcw,
  Shield, Zap, User, Mail, Globe, Monitor, Activity,
  CheckCircle2, ShieldCheck, ThumbsUp, ThumbsDown,
  Eye, Clock, Wifi, Smartphone,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import { buildRiskReasons, calcConfidence } from '../../lib/riskEngine'
import { can } from '../../lib/permissions'
import type { RiskEvent, ReviewStatus, Profile } from '../../types'
import type { RiskReason, ConfidenceLevel } from '../../lib/riskEngine'
import FeedbackSection from '../../components/FeedbackSection'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string
  organization_id: string
  risk_event_id: string
  status: ReviewStatus
  assigned_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
  risk_events: RiskEvent | null
}

interface Signal {
  code: string
  label: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

interface RelatedEvent {
  id: string
  external_user_id: string
  event_type: string
  risk_level: string
  fraud_score: number
  decision: string
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  low: '#16C784', medium: '#F59E0B', high: '#F97316', critical: '#EF4444',
}

const STATUS_META: Record<ReviewStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: '#F59E0B', bg: 'rgba(245,158,11,0.10)'  },
  in_review: { label: 'In Review', color: '#38BDF8', bg: 'rgba(56,189,248,0.10)'  },
  approved:  { label: 'Approved',  color: '#16C784', bg: 'rgba(22,199,132,0.10)'  },
  rejected:  { label: 'Blocked',   color: '#EF4444', bg: 'rgba(239,68,68,0.10)'   },
  escalated: { label: 'Escalated', color: '#F97316', bg: 'rgba(249,115,22,0.10)'  },
}

const RISK_ACCENT: Record<string, string> = {
  low: '#16C784', medium: '#F59E0B', high: '#F97316', critical: '#EF4444',
}

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

function trustColor(score: number) {
  return score >= 70 ? '#16C784' : score >= 45 ? '#F59E0B' : '#EF4444'
}

function fraudColor(score: number) {
  return score >= 70 ? '#EF4444' : score >= 40 ? '#F59E0B' : '#16C784'
}

function parseNotes(raw: string | null): { ts: string; text: string }[] {
  if (!raw?.trim()) return []
  const parts = raw.split(/\n\n(?=\[)/)
  return parts.map(entry => {
    const m = entry.match(/^\[([^\]]+)\]\n([\s\S]*)/)
    return m ? { ts: m[1], text: m[2].trim() } : { ts: '', text: entry.trim() }
  }).filter(e => e.text)
}

function parseRiskReasons(raw: unknown, signals: Signal[]): RiskReason[] {
  if (Array.isArray(raw) && raw.length > 0) return raw as RiskReason[]
  return buildRiskReasons(signals as Parameters<typeof buildRiskReasons>[0])
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  const T = useT()
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs" style={{ color: T.textSec }}>{label}</span>
        <span className="text-2xl font-bold mono" style={{ color }}>{score}</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 4, background: T.border }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

function SignalChip({ label, severity }: { label: string; severity: string }) {
  const c = SEV_COLORS[severity] ?? '#475569'
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded mono whitespace-nowrap"
      style={{ background: `${c}15`, color: c, border: `1px solid ${c}28` }}>
      {label}
    </span>
  )
}

function CollapsibleSection({
  title, icon, expanded, onToggle, badge, children,
}: {
  title: string; icon: ReactNode; expanded: boolean
  onToggle: () => void; badge?: number; children: ReactNode
}) {
  const T = useT()
  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3.5 transition-colors"
        onMouseEnter={e => (e.currentTarget.style.background = T.card)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="flex items-center gap-2.5">
          <span style={{ color: T.textDim }}>{icon}</span>
          <span className="text-xs font-semibold" style={{ color: T.textSec }}>{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className="text-[10px] mono px-1.5 py-0.5 rounded"
              style={{ background: T.card, color: T.textDim, border: `1px solid ${T.border}` }}>
              {badge}
            </span>
          )}
        </div>
        <ChevronDown size={12} style={{
          color: T.textDim, flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
        }} />
      </button>
      {expanded && <div className="px-6 pb-5">{children}</div>}
    </div>
  )
}

// ─── Risk Reasons section ─────────────────────────────────────────────────────

function QueueRiskReasons({ ev }: { ev: RiskEvent }) {
  const T          = useT()
  const signals    = parseSignals(ev.signals_json)
  const reasons    = parseRiskReasons(ev.risk_reasons_json, signals)
  const confidence = ev.confidence_level ?? calcConfidence(
    signals as Parameters<typeof calcConfidence>[0], ev.fraud_score,
  )
  if (reasons.length === 0) return null
  const conf = CONFIDENCE_META[confidence]
  return (
    <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={12} style={{ color: '#818CF8' }} />
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textDim }}>
            Why flagged?
          </p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: conf.bg, color: conf.color, border: `1px solid ${conf.color}28` }}>
          {conf.label}
        </span>
      </div>
      {ev.recommended_action && (
        <p className="text-xs leading-relaxed mb-3" style={{ color: T.textSec }}>
          {ev.recommended_action}
        </p>
      )}
      <div className="space-y-2">
        {reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
            style={{ background: T.bg, border: `1px solid ${T.border}` }}>
            <span className="flex-shrink-0 mt-0.5" style={{ color: SEV_COLORS[r.severity] ?? T.textDim }}>
              {CATEGORY_ICON[r.category] ?? <AlertTriangle size={11} />}
            </span>
            <p className="text-xs leading-relaxed flex-1" style={{ color: T.text }}>{r.reason}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 mono"
              style={{
                background: `${SEV_COLORS[r.severity] ?? T.textDim}18`,
                color: SEV_COLORS[r.severity] ?? T.textDim,
                border: `1px solid ${SEV_COLORS[r.severity] ?? T.textDim}30`,
              }}>
              {r.severity}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Related events mini-table ────────────────────────────────────────────────

function RelatedEventsTable({ events, loading, emptyMsg }: {
  events: RelatedEvent[] | null
  loading: boolean
  emptyMsg: string
}) {
  if (loading) return (
    <div className="flex items-center gap-2 py-3" style={{ color: '#2D4057' }}>
      <RefreshCw size={11} className="animate-spin" />
      <span className="text-xs">Loading…</span>
    </div>
  )
  if (!events || events.length === 0) return (
    <p className="text-xs py-2" style={{ color: '#2D4057' }}>{emptyMsg}</p>
  )
  return (
    <div className="space-y-1.5">
      {events.map(e => (
        <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
          style={{ background: '#050B14', border: '1px solid #1E2D3D' }}>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold badge-${e.risk_level}`}>
            {e.risk_level}
          </span>
          <span className="text-[10px] mono truncate flex-1" style={{ color: '#94A3B8' }}>
            {e.external_user_id}
          </span>
          <span className="text-[10px] mono" style={{ color: '#475569' }}>{e.event_type}</span>
          <span className="text-[10px] mono font-bold" style={{ color: fraudColor(e.fraud_score) }}>
            {e.fraud_score}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded mono badge-${e.decision}`}>
            {e.decision}
          </span>
          <span className="text-[9px] mono flex-shrink-0" style={{ color: '#2D4057' }}>
            {relativeTime(e.created_at)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Case Detail Panel ────────────────────────────────────────────────────────

type ActionType = 'claim' | 'approve' | 'block' | 'escalate' | 'reopen'

function CaseDetailPanel({
  item, userId, orgId, canAct, onClose, onUpdate,
}: {
  item: QueueItem
  userId: string | null
  orgId: string
  canAct: boolean
  onClose: () => void
  onUpdate: (id: string, updates: Partial<QueueItem>) => void
}) {
  const [acting,          setActing]          = useState(false)
  const [noteText,        setNoteText]        = useState('')
  const [addingNote,      setAddingNote]      = useState(false)
  const [err,             setErr]             = useState<string | null>(null)
  const [open,            setOpen]            = useState<string>('reasons')
  const [feedbackKey,     setFeedbackKey]     = useState(0)
  const [quickFbLoading,  setQuickFbLoading]  = useState<string | null>(null)
  const [relIpEvents,     setRelIpEvents]     = useState<RelatedEvent[] | null>(null)
  const [relDevEvents,    setRelDevEvents]    = useState<RelatedEvent[] | null>(null)
  const [loadingRelIp,    setLoadingRelIp]    = useState(false)
  const [loadingRelDev,   setLoadingRelDev]   = useState(false)

  const ev      = item.risk_events
  const signals = parseSignals(ev?.signals_json)
  const meta    = STATUS_META[item.status]
  const notes   = parseNotes(item.notes)

  const toggle = (s: string) => setOpen(p => p === s ? '' : s)

  // Lazy-load related events when section opens
  const loadRelIp = useCallback(async () => {
    if (!ev?.ip_address || relIpEvents !== null || loadingRelIp) return
    setLoadingRelIp(true)
    const { data } = await supabase
      .from('risk_events')
      .select('id, external_user_id, event_type, risk_level, fraud_score, decision, created_at')
      .eq('organization_id', orgId)
      .eq('ip_address', ev.ip_address)
      .neq('id', ev.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setRelIpEvents((data ?? []) as RelatedEvent[])
    setLoadingRelIp(false)
  }, [ev, orgId, relIpEvents, loadingRelIp])

  const loadRelDev = useCallback(async () => {
    if (!ev?.device_id || relDevEvents !== null || loadingRelDev) return
    setLoadingRelDev(true)
    const { data } = await supabase
      .from('risk_events')
      .select('id, external_user_id, event_type, risk_level, fraud_score, decision, created_at')
      .eq('organization_id', orgId)
      .eq('device_id', ev.device_id)
      .neq('id', ev.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setRelDevEvents((data ?? []) as RelatedEvent[])
    setLoadingRelDev(false)
  }, [ev, orgId, relDevEvents, loadingRelDev])

  useEffect(() => {
    if (open === 'rel_ip')  void loadRelIp()
    if (open === 'rel_dev') void loadRelDev()
  }, [open, loadRelIp, loadRelDev])

  // ── Queue actions ────────────────────────────────────────────────────────────

  const handleAction = async (action: ActionType) => {
    setActing(true); setErr(null)
    try {
      const newStatus: ReviewStatus =
        action === 'claim'    ? 'in_review' :
        action === 'approve'  ? 'approved'  :
        action === 'block'    ? 'rejected'  :
        action === 'reopen'   ? 'pending'   : 'escalated'

      const queueUpdate: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }
      if (action === 'claim')  queueUpdate['assigned_to'] = userId
      if (action === 'reopen') queueUpdate['assigned_to'] = null

      const { error: qErr } = await supabase
        .from('review_queue')
        .update(queueUpdate)
        .eq('id', item.id)
      if (qErr) throw new Error(qErr.message)

      if (action === 'approve' || action === 'block') {
        await supabase
          .from('risk_events')
          .update({ decision: action === 'approve' ? 'allow' : 'block' })
          .eq('id', item.risk_event_id)
      }

      await supabase.from('audit_logs').insert({
        organization_id: orgId,
        user_id:         userId,
        action:          `review.${action}`,
        target_type:     'review_queue',
        target_id:       item.id,
        user_agent:      navigator.userAgent,
        metadata_json: {
          queue_item_id:    item.id,
          risk_event_id:    item.risk_event_id,
          external_user_id: ev?.external_user_id ?? null,
          previous_status:  item.status,
          new_status:       newStatus,
        },
      })

      onUpdate(item.id, {
        status: newStatus,
        assigned_to: action === 'claim' ? userId : action === 'reopen' ? null : item.assigned_to,
        risk_events: ev && (action === 'approve' || action === 'block')
          ? { ...ev, decision: action === 'approve' ? 'allow' : 'block' }
          : ev,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  // ── Quick feedback shortcuts ──────────────────────────────────────────────────

  const handleQuickFeedback = async (type: 'genuine_user' | 'confirmed_fraud') => {
    if (!ev) return
    setQuickFbLoading(type); setErr(null)
    try {
      await supabase.from('event_feedback').insert({
        organization_id: orgId,
        risk_event_id:   ev.id,
        feedback_type:   type,
        notes:           null,
        submitted_by:    userId,
      })
      await supabase
        .from('risk_events')
        .update({ feedback_status: type })
        .eq('id', ev.id)
      await supabase.from('audit_logs').insert({
        organization_id: orgId,
        user_id:         userId,
        action:          'feedback.submitted',
        target_type:     'risk_event',
        target_id:       ev.id,
        user_agent:      navigator.userAgent,
        metadata_json:   { feedback_type: type, risk_event_id: ev.id },
      })
      setFeedbackKey(k => k + 1)
    } catch {
      setErr('Failed to submit feedback')
    } finally {
      setQuickFbLoading(null)
    }
  }

  // ── Note handling ─────────────────────────────────────────────────────────────

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    setAddingNote(true); setErr(null)
    try {
      const ts      = formatTs(new Date().toISOString())
      const block   = `[${ts}]\n${noteText.trim()}`
      const newNote = item.notes ? `${item.notes}\n\n${block}` : block

      const { error: nErr } = await supabase
        .from('review_queue')
        .update({ notes: newNote })
        .eq('id', item.id)
      if (nErr) throw new Error(nErr.message)

      await supabase.from('audit_logs').insert({
        organization_id: orgId,
        user_id:         userId,
        action:          'review.note_added',
        target_type:     'review_queue',
        target_id:       item.id,
        user_agent:      navigator.userAgent,
        metadata_json:   { queue_item_id: item.id, note: noteText.trim() },
      })
      onUpdate(item.id, { notes: newNote })
      setNoteText('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save note')
    } finally {
      setAddingNote(false)
    }
  }

  const isResolved = item.status === 'approved' || item.status === 'rejected' || item.status === 'escalated'

  return (
    <>
      <div className="fixed inset-0 z-40"
        style={{ background: 'rgba(5,11,20,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      <div className="fixed top-0 right-0 h-screen z-50 flex flex-col"
        style={{ width: 520, background: '#07111F', borderLeft: '1px solid #1E2D3D' }}>

        {/* ── Top bar ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #1E2D3D' }}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
              style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
            {ev && (
              <p className="text-sm font-semibold mono truncate" style={{ color: '#E2E8F0' }}>
                {ev.external_user_id}
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ml-3 transition-colors"
            style={{ background: '#0B1220', border: '1px solid #1E2D3D', color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#E2E8F0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
            <X size={13} />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Event summary row */}
          <div className="px-6 py-4 flex items-center gap-3 flex-wrap"
            style={{ borderBottom: '1px solid #0D1B2A' }}>
            {ev ? (
              <>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold badge-${ev.risk_level}`}>
                  {ev.risk_level}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full mono badge-${ev.decision}`}>
                  {ev.decision}
                </span>
                <span className="text-xs px-2 py-1 rounded-md mono"
                  style={{ background: '#0B1220', color: '#94A3B8', border: '1px solid #1E2D3D' }}>
                  {ev.event_type}
                </span>
                <span className="text-[10px] ml-auto mono flex-shrink-0" style={{ color: '#2D4057' }}>
                  {formatTs(ev.created_at)}
                </span>
              </>
            ) : (
              <span className="text-xs" style={{ color: '#475569' }}>Event not found</span>
            )}
          </div>

          {/* Rule banner */}
          {ev?.applied_rule_name && (
            <div className="px-6 py-3 flex items-center gap-2.5"
              style={{ borderBottom: '1px solid #0D1B2A', background: 'rgba(129,140,248,0.05)' }}>
              <ShieldCheck size={12} style={{ color: '#818CF8', flexShrink: 0 }} />
              <p className="text-xs" style={{ color: '#818CF8' }}>
                Decision influenced by rule:{' '}
                <span className="font-semibold" style={{ color: '#A5B4FC' }}>{ev.applied_rule_name}</span>
              </p>
            </div>
          )}

          {/* Scores */}
          {ev && (
            <div className="px-6 py-5 grid grid-cols-2 gap-6"
              style={{ borderBottom: '1px solid #0D1B2A' }}>
              <ScoreBar label="Trust Score" score={ev.trust_score} color={trustColor(ev.trust_score)} />
              <ScoreBar label="Fraud Score" score={ev.fraud_score} color={fraudColor(ev.fraud_score)} />
            </div>
          )}

          {/* AI Summary */}
          {ev?.ai_summary && (
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #0D1B2A' }}>
              <div className="flex items-center gap-2 mb-2.5">
                <Zap size={12} style={{ color: '#16C784' }} />
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
                  AI Summary
                </p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>{ev.ai_summary}</p>
            </div>
          )}

          {/* Risk reasons */}
          {ev && <QueueRiskReasons ev={ev} />}

          {/* Feedback */}
          {ev && <FeedbackSection key={feedbackKey} event={ev} />}

          {/* User & Session */}
          <CollapsibleSection
            title="User & Session"
            icon={<User size={12} />}
            expanded={open === 'user'}
            onToggle={() => toggle('user')}
          >
            {ev ? (
              <div className="space-y-2.5">
                {([
                  ['User ID',    ev.external_user_id],
                  ['Email',      ev.email],
                  ['IP Address', ev.ip_address],
                  ['Device ID',  ev.device_id],
                  ['Country',    ev.country],
                  ['User Agent', ev.user_agent],
                ] as [string, string | null][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="flex items-start gap-3">
                    <span className="text-[10px] flex-shrink-0 pt-px"
                      style={{ color: '#475569', minWidth: 76 }}>
                      {label}
                    </span>
                    <span className="text-xs mono break-all" style={{ color: '#94A3B8' }}>{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: '#2D4057' }}>No event data.</p>
            )}
          </CollapsibleSection>

          {/* Related: Same IP */}
          <CollapsibleSection
            title="Same IP Activity"
            icon={<Wifi size={12} />}
            expanded={open === 'rel_ip'}
            onToggle={() => toggle('rel_ip')}
            badge={relIpEvents?.length}
          >
            {!ev?.ip_address ? (
              <p className="text-xs" style={{ color: '#2D4057' }}>No IP data for this event.</p>
            ) : (
              <RelatedEventsTable
                events={relIpEvents}
                loading={loadingRelIp}
                emptyMsg="No other events from this IP address."
              />
            )}
          </CollapsibleSection>

          {/* Related: Same Device */}
          <CollapsibleSection
            title="Same Device Activity"
            icon={<Smartphone size={12} />}
            expanded={open === 'rel_dev'}
            onToggle={() => toggle('rel_dev')}
            badge={relDevEvents?.length}
          >
            {!ev?.device_id ? (
              <p className="text-xs" style={{ color: '#2D4057' }}>No device data for this event.</p>
            ) : (
              <RelatedEventsTable
                events={relDevEvents}
                loading={loadingRelDev}
                emptyMsg="No other events from this device."
              />
            )}
          </CollapsibleSection>

          {/* Detected Signals */}
          <CollapsibleSection
            title="Detected Signals"
            icon={<AlertTriangle size={12} />}
            expanded={open === 'signals'}
            onToggle={() => toggle('signals')}
            badge={signals.length}
          >
            {signals.length === 0 ? (
              <p className="text-xs" style={{ color: '#2D4057' }}>No signals detected.</p>
            ) : (
              <div className="space-y-2">
                {signals.map((s, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: '#050B14', border: '1px solid #1E2D3D' }}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold" style={{ color: '#E2E8F0' }}>{s.label}</p>
                      <p className="text-[10px] mono mt-0.5" style={{ color: '#475569' }}>{s.code}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 mono"
                      style={{
                        background: `${SEV_COLORS[s.severity] ?? '#475569'}18`,
                        color: SEV_COLORS[s.severity] ?? '#475569',
                        border: `1px solid ${SEV_COLORS[s.severity] ?? '#475569'}30`,
                      }}>
                      {s.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Internal Notes */}
          <CollapsibleSection
            title="Internal Notes"
            icon={<MessageSquare size={12} />}
            expanded={open === 'notes'}
            onToggle={() => toggle('notes')}
            badge={notes.length}
          >
            <div className="space-y-3">
              {notes.length > 0 ? (
                <div className="space-y-2">
                  {notes.map((n, i) => (
                    <div key={i} className="rounded-lg overflow-hidden"
                      style={{ border: '1px solid #1E2D3D' }}>
                      {n.ts && (
                        <div className="flex items-center gap-2 px-3 py-1.5"
                          style={{ background: '#050B14', borderBottom: '1px solid #1E2D3D' }}>
                          <Clock size={9} style={{ color: '#2D4057' }} />
                          <span className="text-[9px] mono" style={{ color: '#2D4057' }}>{n.ts}</span>
                        </div>
                      )}
                      <p className="text-xs leading-relaxed whitespace-pre-wrap px-3 py-2.5"
                        style={{ color: '#94A3B8' }}>
                        {n.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs" style={{ color: '#2D4057' }}>No notes yet.</p>
              )}

              {canAct && (
                <div>
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Add an internal note…"
                    rows={3}
                    className="g-input text-xs resize-none w-full"
                    style={{ fontFamily: 'inherit', lineHeight: 1.5 }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px]" style={{ color: '#2D4057' }}>
                      Internal only — not visible to end users.
                    </p>
                    <button
                      onClick={() => void handleAddNote()}
                      disabled={!noteText.trim() || addingNote}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{
                        background: noteText.trim() ? '#16C784' : '#1E2D3D',
                        color:      noteText.trim() ? '#000'    : '#475569',
                      }}>
                      {addingNote ? <RefreshCw size={10} className="animate-spin" /> : <MessageSquare size={10} />}
                      Save note
                    </button>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Error */}
          {err && (
            <div className="mx-6 my-3 px-3 py-2.5 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              {err}
            </div>
          )}

          <div style={{ height: 32 }} />
        </div>

        {/* ── Action footer ──────────────────────────────────────── */}
        {canAct && (
          <div className="flex-shrink-0 px-6 py-4 space-y-3"
            style={{ borderTop: '1px solid #1E2D3D', background: '#050B14' }}>

            {/* Quick feedback row */}
            {ev && (
              <div className="flex items-center gap-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold flex-shrink-0"
                  style={{ color: '#2D4057' }}>
                  Quick label
                </p>
                <button
                  onClick={() => void handleQuickFeedback('genuine_user')}
                  disabled={!!quickFbLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: 'rgba(22,199,132,0.08)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(22,199,132,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(22,199,132,0.08)')}>
                  {quickFbLoading === 'genuine_user'
                    ? <RefreshCw size={10} className="animate-spin" />
                    : <ThumbsUp size={10} />}
                  Genuine
                </button>
                <button
                  onClick={() => void handleQuickFeedback('confirmed_fraud')}
                  disabled={!!quickFbLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}>
                  {quickFbLoading === 'confirmed_fraud'
                    ? <RefreshCw size={10} className="animate-spin" />
                    : <ThumbsDown size={10} />}
                  Confirmed fraud
                </button>
              </div>
            )}

            {/* Main decision actions */}
            {!isResolved ? (
              <>
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#2D4057' }}>
                  {item.status === 'pending' ? 'Decision required' : 'Update decision'}
                </p>
                <div className="flex items-center gap-2">
                  {/* Claim — only when pending and not claimed */}
                  {item.status === 'pending' && (
                    <button
                      onClick={() => void handleAction('claim')}
                      disabled={acting}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                      style={{ border: '1px solid rgba(56,189,248,0.4)', color: '#38BDF8' }}
                      onMouseEnter={e => { if (!acting) e.currentTarget.style.background = 'rgba(56,189,248,0.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      {acting ? <RefreshCw size={12} className="animate-spin" /> : <Eye size={12} />}
                      Claim
                    </button>
                  )}

                  {/* Approve */}
                  <button
                    onClick={() => void handleAction('approve')}
                    disabled={acting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    style={{ background: '#16C784', color: '#000' }}
                    onMouseEnter={e => { if (!acting) e.currentTarget.style.opacity = '0.88' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
                    {acting ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    Approve
                  </button>

                  {/* Block */}
                  <button
                    onClick={() => void handleAction('block')}
                    disabled={acting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    style={{ background: '#EF4444', color: '#fff' }}
                    onMouseEnter={e => { if (!acting) e.currentTarget.style.opacity = '0.88' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
                    {acting ? <RefreshCw size={14} className="animate-spin" /> : <XCircle size={14} />}
                    Block
                  </button>

                  {/* Escalate */}
                  <button
                    onClick={() => void handleAction('escalate')}
                    disabled={acting}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                    style={{ border: '1px solid rgba(249,115,22,0.4)', color: '#F97316' }}
                    onMouseEnter={e => { if (!acting) e.currentTarget.style.background = 'rgba(249,115,22,0.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <ArrowUpCircle size={13} />
                    Escalate
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: '#2D4057' }}>
                    Resolved
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="text-xs" style={{ color: '#475569' }}>
                      {relativeTime(item.updated_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => void handleAction('reopen')}
                  disabled={acting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all"
                  style={{ border: '1px solid #1E2D3D', color: '#475569' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                  {acting ? <RefreshCw size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                  Re-open
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STATUS_TABS: { value: ReviewStatus | ''; label: string }[] = [
  { value: '',          label: 'All'       },
  { value: 'pending',   label: 'Pending'   },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved',  label: 'Approved'  },
  { value: 'rejected',  label: 'Blocked'   },
  { value: 'escalated', label: 'Escalated' },
]

export default function Queue() {
  const { user, profile } = useAuth()
  const orgId = profile?.organization_id ?? null
  const canAct = can(profile?.role, 'act_queue')

  const [items,    setItems]    = useState<QueueItem[]>([])
  const [members,  setMembers]  = useState<Profile[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [statusF,  setStatusF]  = useState<ReviewStatus | ''>('pending')
  const [selected, setSelected] = useState<QueueItem | null>(null)

  const memberMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    members.forEach(p => { m[p.user_id] = p.full_name ?? p.email })
    return m
  }, [members])

  const fetchItems = useCallback(async () => {
    if (!orgId) return
    const [qRes, mRes] = await Promise.all([
      supabase
        .from('review_queue')
        .select('*, risk_events(*)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .eq('organization_id', orgId),
    ])
    if (qRes.error) setError(qRes.error.message)
    else setItems((qRes.data ?? []) as QueueItem[])
    if (mRes.data) setMembers(mRes.data as Profile[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    void fetchItems()
  }, [orgId, fetchItems])

  useEffect(() => {
    if (!orgId) return
    if (!profile?.organization_id) return
    const ch = supabase
      .channel(`queue:${orgId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'review_queue', filter: `organization_id=eq.${orgId}`,
      }, () => { void fetchItems() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [orgId, fetchItems, profile?.organization_id])

  const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
    setSelected(prev => prev?.id === id ? { ...prev, ...updates } : prev)
  }, [])

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': items.length }
    items.forEach(i => { c[i.status] = (c[i.status] ?? 0) + 1 })
    return c
  }, [items])

  const filtered = useMemo(() =>
    statusF ? items.filter(i => i.status === statusF) : items
  , [items, statusF])

  if (loading && !orgId) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: '#475569' }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading queue…</span>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <div className="g-card p-5 text-sm" style={{ color: '#EF4444' }}>{error}</div>
    </div>
  )

  const pendingCount = counts['pending'] ?? 0
  const inReviewCount = counts['in_review'] ?? 0

  return (
    <div className="p-7">

      {/* Sub-header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          {pendingCount > 0 && (
            <span className="text-sm font-semibold" style={{ color: '#F59E0B' }}>
              {pendingCount} pending
            </span>
          )}
          {inReviewCount > 0 && (
            <span className="text-sm font-semibold" style={{ color: '#38BDF8' }}>
              {inReviewCount} in review
            </span>
          )}
          {pendingCount === 0 && inReviewCount === 0 && (
            <span className="text-sm" style={{ color: '#16C784' }}>All cases reviewed</span>
          )}
          <span className="text-sm" style={{ color: '#2D4057' }}>· {items.length} total</span>
        </div>
        <button
          onClick={() => void fetchItems()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{ border: '1px solid #1E2D3D', color: '#475569' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-0.5 mb-6 p-1 rounded-xl w-fit"
        style={{ background: '#07111F', border: '1px solid #1E2D3D' }}>
        {STATUS_TABS.map(tab => {
          const c   = counts[tab.value] ?? 0
          const m   = tab.value ? STATUS_META[tab.value as ReviewStatus] : null
          const act = statusF === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setStatusF(tab.value)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                background: act ? '#0B1220' : 'transparent',
                color:      act && m ? m.color : act ? '#94A3B8' : '#475569',
                border:     act ? '1px solid #1E2D3D' : '1px solid transparent',
                fontWeight: act ? 600 : 400,
              }}>
              {tab.label}
              {c > 0 && (
                <span className="text-[10px] mono px-1.5 py-0.5 rounded"
                  style={{ background: act && m ? m.bg : '#0B1220', color: act && m ? m.color : '#475569' }}>
                  {c}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Queue table */}
      <div className="g-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Shield size={24} className="mx-auto mb-3" style={{ color: '#1E2D3D' }} />
            <p className="text-sm font-semibold mb-1.5" style={{ color: '#475569' }}>
              {statusF === 'pending' ? 'No pending cases — queue is clear' : 'No cases found'}
            </p>
            <p className="text-xs" style={{ color: '#2D4057' }}>
              {statusF === 'pending' ? 'New cases appear here automatically.' : 'Try a different filter.'}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid gap-4 px-5 py-3"
              style={{
                gridTemplateColumns: '1fr 80px 90px 70px 70px 1fr 110px 80px',
                borderBottom: '1px solid #1E2D3D',
                background: '#07111F',
              }}>
              {['User', 'Type', 'Risk', 'Fraud', 'Trust', 'Signals', 'Status', 'Age'].map(h => (
                <p key={h} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#2D4057' }}>
                  {h}
                </p>
              ))}
            </div>

            {/* Rows */}
            {filtered.map((item, i) => {
              const ev         = item.risk_events
              const signals    = parseSignals(ev?.signals_json).slice(0, 2)
              const meta       = STATUS_META[item.status]
              const isSelected = selected?.id === item.id
              const assignee   = item.assigned_to ? memberMap[item.assigned_to] : null

              return (
                <div
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="grid gap-4 px-5 py-3.5 cursor-pointer items-center transition-colors"
                  style={{
                    gridTemplateColumns: '1fr 80px 90px 70px 70px 1fr 110px 80px',
                    borderBottom: i < filtered.length - 1 ? '1px solid #0D1B2A' : 'none',
                    background:   isSelected ? '#0B1220' : 'transparent',
                    borderLeft:   `3px solid ${ev ? (RISK_ACCENT[ev.risk_level] ?? '#2D4057') : '#2D4057'}`,
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#0A1828' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* User */}
                  <div className="min-w-0">
                    <p className="text-xs mono truncate font-medium" style={{ color: '#E2E8F0' }}>
                      {ev?.external_user_id ?? '—'}
                    </p>
                    {ev?.email && (
                      <p className="text-[10px] truncate mt-0.5" style={{ color: '#475569' }}>{ev.email}</p>
                    )}
                    {ev?.ip_address && (
                      <p className="text-[10px] mono mt-0.5" style={{ color: '#2D4057' }}>{ev.ip_address}</p>
                    )}
                  </div>

                  {/* Event type */}
                  <div>
                    {ev
                      ? <span className="text-[10px] px-2 py-0.5 rounded-md mono"
                          style={{ background: '#07111F', color: '#94A3B8', border: '1px solid #1E2D3D' }}>
                          {ev.event_type}
                        </span>
                      : <span style={{ color: '#2D4057' }}>—</span>}
                  </div>

                  {/* Risk level */}
                  <div>
                    {ev
                      ? <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium badge-${ev.risk_level}`}>
                          {ev.risk_level}
                        </span>
                      : <span style={{ color: '#2D4057' }}>—</span>}
                  </div>

                  {/* Fraud score */}
                  <div>
                    {ev
                      ? <span className="text-sm mono font-bold" style={{ color: fraudColor(ev.fraud_score) }}>
                          {ev.fraud_score}
                        </span>
                      : <span style={{ color: '#2D4057' }}>—</span>}
                  </div>

                  {/* Trust score */}
                  <div>
                    {ev
                      ? <span className="text-sm mono font-bold" style={{ color: trustColor(ev.trust_score) }}>
                          {ev.trust_score}
                        </span>
                      : <span style={{ color: '#2D4057' }}>—</span>}
                  </div>

                  {/* Signals */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {signals.length > 0
                      ? signals.map((s, si) => <SignalChip key={si} label={s.label} severity={s.severity} />)
                      : <span className="text-[10px]" style={{ color: '#2D4057' }}>—</span>}
                  </div>

                  {/* Status + assigned */}
                  <div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
                      style={{ background: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                    {assignee && (
                      <p className="text-[9px] mt-1 truncate" style={{ color: '#2D4057' }}>{assignee}</p>
                    )}
                  </div>

                  {/* Age */}
                  <div>
                    <p className="text-[10px] mono" style={{ color: '#475569' }}>
                      {relativeTime(item.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Detail panel */}
      {selected && orgId && (
        <CaseDetailPanel
          key={selected.id}
          item={selected}
          userId={user?.id ?? null}
          orgId={orgId}
          canAct={canAct}
          onClose={() => setSelected(null)}
          onUpdate={updateItem}
        />
      )}
    </div>
  )
}
