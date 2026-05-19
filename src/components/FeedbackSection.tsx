import { useState, useEffect, useCallback } from 'react'
import {
  ThumbsUp, ThumbsDown, AlertCircle, CreditCard,
  MessageSquare, Check, RefreshCw, RotateCcw,
  UserX, CheckSquare, XSquare, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { applyFeedbackSignals } from '../lib/feedbackSignals'
import type { RiskEvent, FeedbackType, EventFeedback, Decision } from '../types'

// ─── Config ───────────────────────────────────────────────────────────────────

interface FeedbackOption {
  type:   FeedbackType
  label:  string
  icon:   React.ReactNode
  color:  string
  bg:     string
  border: string
  desc:   string
}

const PRIMARY_OPTIONS: FeedbackOption[] = [
  {
    type:   'genuine_user',
    label:  'Genuine User',
    icon:   <ThumbsUp size={13} />,
    color:  '#16C784',
    bg:     'rgba(22,199,132,0.08)',
    border: 'rgba(22,199,132,0.25)',
    desc:   'This user is legitimate',
  },
  {
    type:   'false_positive',
    label:  'False Positive',
    icon:   <AlertCircle size={13} />,
    color:  '#F59E0B',
    bg:     'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
    desc:   'Decision was too aggressive',
  },
  {
    type:   'confirmed_fraud',
    label:  'Confirmed Fraud',
    icon:   <ThumbsDown size={13} />,
    color:  '#EF4444',
    bg:     'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    desc:   'Verified fraudulent activity',
  },
  {
    type:   'chargeback_received',
    label:  'Chargeback',
    icon:   <CreditCard size={13} />,
    color:  '#F97316',
    bg:     'rgba(249,115,22,0.08)',
    border: 'rgba(249,115,22,0.25)',
    desc:   'Payment reversed / disputed',
  },
]

const SECONDARY_OPTIONS: FeedbackOption[] = [
  {
    type:   'account_abuse_confirmed',
    label:  'Account Abuse',
    icon:   <UserX size={12} />,
    color:  '#A78BFA',
    bg:     'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.25)',
    desc:   'Account used for abuse',
  },
  {
    type:   'manual_review_correct',
    label:  'Review Correct',
    icon:   <CheckSquare size={12} />,
    color:  '#38BDF8',
    bg:     'rgba(56,189,248,0.08)',
    border: 'rgba(56,189,248,0.25)',
    desc:   'Manual review decision was right',
  },
  {
    type:   'manual_review_wrong',
    label:  'Review Wrong',
    icon:   <XSquare size={12} />,
    color:  '#94A3B8',
    bg:     'rgba(148,163,184,0.08)',
    border: 'rgba(148,163,184,0.25)',
    desc:   'Manual review decision was wrong',
  },
]

const ALL_OPTIONS = [...PRIMARY_OPTIONS, ...SECONDARY_OPTIONS]

function feedbackLabel(type: FeedbackType): string {
  return ALL_OPTIONS.find(o => o.type === type)?.label ?? type
}

function feedbackColor(type: FeedbackType): string {
  return ALL_OPTIONS.find(o => o.type === type)?.color ?? '#94A3B8'
}

function relativeTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const s = Math.floor(d / 1000)
  if (s < 60)   return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FeedbackSectionProps {
  event: RiskEvent
}

export default function FeedbackSection({ event }: FeedbackSectionProps) {
  const { user } = useAuth()

  const [existing,    setExisting]    = useState<EventFeedback | null | undefined>(undefined)
  const [selected,    setSelected]    = useState<FeedbackType | null>(null)
  const [notes,       setNotes]       = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [showMore,    setShowMore]    = useState(false)
  const [changing,    setChanging]    = useState(false)

  const loadExisting = useCallback(async () => {
    // If feedback_status is already set on the event, still fetch the full record for notes/timestamp
    const { data } = await supabase
      .from('event_feedback')
      .select('*')
      .eq('risk_event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setExisting(data as EventFeedback | null ?? null)
  }, [event.id])

  useEffect(() => {
    void loadExisting()
  }, [loadExisting])

  const handleSubmit = async () => {
    if (!selected) return
    setSubmitting(true)

    try {
      // 1. Insert feedback record
      const { data: fb } = await supabase
        .from('event_feedback')
        .insert({
          organization_id: event.organization_id,
          risk_event_id:   event.id,
          feedback_type:   selected,
          notes:           notes.trim() || null,
          submitted_by:    user?.id ?? null,
        })
        .select()
        .single()

      // 2. Update feedback_status on the risk_event
      await supabase
        .from('risk_events')
        .update({ feedback_status: selected })
        .eq('id', event.id)

      // 3. Audit log
      void supabase.from('audit_logs').insert({
        organization_id: event.organization_id,
        user_id:         user?.id ?? null,
        action:          'feedback.submitted',
        target_type:     'risk_event',
        target_id:       event.id,
        user_agent:      navigator.userAgent,
        metadata_json: {
          feedback_type:    selected,
          risk_event_id:    event.id,
          external_user_id: event.external_user_id,
          notes:            notes.trim() || null,
        },
      })

      // 4. Foundation for future adaptive intelligence
      void applyFeedbackSignals({
        organization_id:   event.organization_id,
        risk_event_id:     event.id,
        external_user_id:  event.external_user_id,
        feedback_type:     selected,
        original_decision: event.decision as Decision,
        fraud_score:       event.fraud_score,
        trust_score:       event.trust_score,
      })

      setExisting(fb as EventFeedback)
      setChanging(false)
      setNotes('')
    } catch {
      // silent — user can retry
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    setSelected(null)
    setNotes('')
    setChanging(false)
  }

  // Still loading
  if (existing === undefined) {
    return (
      <div className="px-6 py-4" style={{ borderBottom: '1px solid #0D1B2A' }}>
        <div className="flex items-center gap-2">
          <RefreshCw size={11} className="animate-spin" style={{ color: '#2D4057' }} />
          <span className="text-[10px]" style={{ color: '#2D4057' }}>Loading feedback…</span>
        </div>
      </div>
    )
  }

  // Already submitted and not in "changing" mode
  if (existing && !changing) {
    const color = feedbackColor(existing.feedback_type)
    return (
      <div className="px-6 py-4" style={{ borderBottom: '1px solid #0D1B2A' }}>
        <div className="flex items-center gap-2 mb-2.5">
          <MessageSquare size={12} style={{ color: '#475569' }} />
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
            Outcome Feedback
          </p>
        </div>

        <div
          className="flex items-center justify-between px-3 py-2.5 rounded-lg"
          style={{ background: `${color}0D`, border: `1px solid ${color}33` }}
        >
          <div className="flex items-center gap-2.5">
            <Check size={12} style={{ color }} />
            <div>
              <p className="text-xs font-semibold" style={{ color }}>
                {feedbackLabel(existing.feedback_type)}
              </p>
              {existing.notes && (
                <p className="text-[10px] mt-0.5" style={{ color: '#475569' }}>{existing.notes}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <p className="text-[10px] mono" style={{ color: '#2D4057' }}>
              {relativeTime(existing.created_at)}
            </p>
            <button
              onClick={() => { setChanging(true); setSelected(null) }}
              className="flex items-center gap-1 text-[10px] transition-colors"
              style={{ color: '#2D4057' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#2D4057')}
            >
              <RotateCcw size={9} />
              Change
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Input form — idle or changing
  return (
    <div className="px-6 py-4" style={{ borderBottom: '1px solid #0D1B2A' }}>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={12} style={{ color: '#475569' }} />
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
          Outcome Feedback
        </p>
        <span className="text-[10px]" style={{ color: '#2D4057' }}>
          — help improve future decisions
        </span>
      </div>

      {/* Primary options: 2×2 grid */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        {PRIMARY_OPTIONS.map(opt => (
          <button
            key={opt.type}
            onClick={() => setSelected(selected === opt.type ? null : opt.type)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all text-left"
            style={{
              background: selected === opt.type ? opt.bg       : 'transparent',
              color:      selected === opt.type ? opt.color    : '#475569',
              border:     `1px solid ${selected === opt.type ? opt.border : '#1E2D3D'}`,
            }}
            onMouseEnter={e => {
              if (selected !== opt.type) {
                (e.currentTarget as HTMLElement).style.borderColor = opt.border
                ;(e.currentTarget as HTMLElement).style.color = opt.color
              }
            }}
            onMouseLeave={e => {
              if (selected !== opt.type) {
                (e.currentTarget as HTMLElement).style.borderColor = '#1E2D3D'
                ;(e.currentTarget as HTMLElement).style.color = '#475569'
              }
            }}
          >
            <span style={{ flexShrink: 0 }}>{opt.icon}</span>
            <span className="font-semibold">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* More options (secondary) */}
      <button
        onClick={() => setShowMore(v => !v)}
        className="flex items-center gap-1 text-[10px] mb-2 transition-colors"
        style={{ color: '#2D4057' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
        onMouseLeave={e => (e.currentTarget.style.color = '#2D4057')}
      >
        {showMore ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
        More options
      </button>

      {showMore && (
        <div className="flex flex-col gap-1 mb-2">
          {SECONDARY_OPTIONS.map(opt => (
            <button
              key={opt.type}
              onClick={() => setSelected(selected === opt.type ? null : opt.type)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all text-left"
              style={{
                background: selected === opt.type ? opt.bg       : 'transparent',
                color:      selected === opt.type ? opt.color    : '#475569',
                border:     `1px solid ${selected === opt.type ? opt.border : '#1E2D3D'}`,
              }}
            >
              <span style={{ flexShrink: 0 }}>{opt.icon}</span>
              <span className="font-semibold">{opt.label}</span>
              <span className="ml-auto" style={{ color: '#2D4057', fontWeight: 400 }}>{opt.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Notes + submit (when type selected) */}
      {selected && (
        <div className="mt-3 space-y-2">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional) — e.g. confirmed via support ticket #1234"
            rows={2}
            className="g-input text-xs w-full resize-none"
            style={{ lineHeight: 1.5 }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ border: '1px solid #1E2D3D', color: '#475569' }}
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              style={{ background: '#16C784', color: '#050B14' }}
            >
              {submitting && <RefreshCw size={10} className="animate-spin" />}
              Submit feedback
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
