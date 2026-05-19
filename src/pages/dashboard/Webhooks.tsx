import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Globe, Copy, Eye, EyeOff, Trash2, Pencil, X, RefreshCw,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Send, RotateCcw,
  Info, AlertTriangle, Clock, List,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import type { Webhook } from '../../types'

// ─── Event catalogue ──────────────────────────────────────────────────────────

const ALL_EVENTS = [
  { id: 'risk.check.completed',  label: 'Check Completed',    color: '#38BDF8', bg: 'rgba(56,189,248,0.10)',  desc: 'Every risk check result'           },
  { id: 'risk.review.required',  label: 'Review Required',    color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  desc: 'Decision is manual review'          },
  { id: 'risk.event.blocked',    label: 'Event Blocked',      color: '#EF4444', bg: 'rgba(239,68,68,0.10)',   desc: 'Decision is block'                  },
  { id: 'risk.event.approved',   label: 'Event Approved',     color: '#16C784', bg: 'rgba(22,199,132,0.10)',  desc: 'Decision is approve'                },
  { id: 'feedback.submitted',    label: 'Feedback Submitted', color: '#A78BFA', bg: 'rgba(167,139,250,0.10)', desc: 'Analyst feedback recorded on event'  },
  { id: 'rule.triggered',        label: 'Rule Triggered',     color: '#F97316', bg: 'rgba(249,115,22,0.10)',  desc: 'Custom rule matched'                },
] as const

const EVENT_META = Object.fromEntries(
  ALL_EVENTS.map(e => [e.id, { label: e.label, color: e.color, bg: e.bg }])
) as Record<string, { label: string; color: string; bg: string }>

// ─── Local types ──────────────────────────────────────────────────────────────

interface DeliveryCardRow {
  id: string
  event_type: string
  response_status: number | null
  duration_ms: number | null
  success: boolean
  created_at: string
}

interface DeliveryLogRow {
  id: string
  webhook_id: string
  event_type: string
  delivery_status: string | null
  success: boolean
  response_status: number | null
  duration_ms: number | null
  created_at: string
}

interface TestResult {
  success: boolean
  status: number | null
  duration_ms: number
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return 'whsec_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

async function copyToClipboard(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text) } catch { /* silent */ }
}

function maskSecret(s: string): string {
  return s.slice(0, 12) + '•'.repeat(Math.max(0, s.length - 12))
}

// ─── WebhookModal ─────────────────────────────────────────────────────────────

interface ModalProps {
  webhook?: Webhook
  orgId: string
  onSave: (saved: Webhook) => void
  onClose: () => void
}

function WebhookModal({ webhook, orgId, onSave, onClose }: ModalProps) {
  const T = useT()
  const [url,     setUrl]     = useState(webhook?.endpoint_url ?? '')
  const [secret,  setSecret]  = useState(webhook?.secret ?? genSecret())
  const [rotated, setRotated] = useState(false)
  const [showSec, setShowSec] = useState(!webhook)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState<string | null>(null)
  const [copied,  setCopied]  = useState(false)

  const allEventIds = ALL_EVENTS.map(e => e.id)
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    webhook?.events_subscribed?.length ? webhook.events_subscribed : allEventIds
  )

  const isEdit  = Boolean(webhook)
  const isValid = url.trim().startsWith('http') && secret.length > 0 && selectedEvents.length > 0

  const toggleEvent = (id: string) => {
    setSelectedEvents(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
  }

  const handleRotate = () => {
    setSecret(genSecret())
    setRotated(true)
    setShowSec(true)
  }

  const handleCopy = async () => {
    await copyToClipboard(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setErr(null)

    let data: unknown
    let error: { message: string } | null

    if (isEdit) {
      const patch: Record<string, unknown> = { endpoint_url: url.trim(), events_subscribed: selectedEvents }
      if (rotated) patch['secret'] = secret
      ;({ data, error } = await supabase.from('webhooks').update(patch).eq('id', webhook!.id).select().single())
    } else {
      ;({ data, error } = await supabase.from('webhooks').insert({
        organization_id:   orgId,
        endpoint_url:      url.trim(),
        secret,
        status:            'active',
        events_subscribed: selectedEvents,
      }).select().single())
    }

    if (error) { setErr(error.message); setSaving(false); return }
    onSave(data as Webhook)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,11,20,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col"
        style={{ maxWidth: 520, background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: T.textDim }}>
              {isEdit ? 'Edit Webhook' : 'New Webhook'}
            </p>
            <p className="text-sm font-bold" style={{ color: T.text, fontFamily: 'Inter, sans-serif' }}>
              {isEdit ? 'Update endpoint' : 'Register an endpoint'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.textDim }}
            onMouseEnter={e => (e.currentTarget.style.color = T.text)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* URL */}
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: T.textSec }}>
              Endpoint URL
            </label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://api.yourapp.com/hooks/genuinux"
              className="g-input text-sm"
            />
          </div>

          {/* Events subscription */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold" style={{ color: T.textSec }}>
                Subscribe to events
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedEvents(allEventIds)}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ color: '#16C784', background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.15)' }}
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedEvents([])}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ color: T.textDim, background: T.elevated, border: `1px solid ${T.border}` }}
                >
                  None
                </button>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
              {ALL_EVENTS.map((ev, i) => {
                const checked = selectedEvents.includes(ev.id)
                return (
                  <button
                    key={ev.id}
                    onClick={() => toggleEvent(ev.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      background: checked ? `${ev.color}08` : T.bg,
                      borderTop: i > 0 ? `1px solid ${T.borderLight}` : 'none',
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = T.card }}
                    onMouseLeave={e => { if (!checked) e.currentTarget.style.background = T.bg }}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={{
                        background: checked ? ev.color : 'transparent',
                        border: `1.5px solid ${checked ? ev.color : '#1E2D3D'}`,
                      }}
                    >
                      {checked && <CheckCircle2 size={10} style={{ color: '#000' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold mono" style={{ color: checked ? ev.color : T.textSec }}>
                        {ev.id}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: T.textDim }}>
                        {ev.desc}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
            {selectedEvents.length === 0 && (
              <p className="text-[11px] mt-1.5" style={{ color: '#EF4444' }}>
                Select at least one event.
              </p>
            )}
          </div>

          {/* Secret */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold" style={{ color: T.textSec }}>
                Signing Secret
              </label>
              {isEdit && (
                <button
                  onClick={handleRotate}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors"
                  style={{ color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.10)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.05)')}
                >
                  <RotateCcw size={10} />
                  Rotate
                </button>
              )}
            </div>

            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: T.codeBg, border: `1px solid ${T.border}` }}
            >
              <code className="flex-1 text-xs mono truncate" style={{ color: T.textSec }}>
                {showSec ? secret : maskSecret(secret)}
              </code>
              <button
                onClick={() => setShowSec(v => !v)}
                className="flex-shrink-0 p-1"
                style={{ color: T.textDim }}
                onMouseEnter={e => (e.currentTarget.style.color = T.textSec)}
                onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
                title={showSec ? 'Hide' : 'Show'}
              >
                {showSec ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                onClick={() => void handleCopy()}
                className="flex-shrink-0 p-1"
                style={{ color: copied ? '#16C784' : T.textDim }}
                onMouseEnter={e => !copied && (e.currentTarget.style.color = T.textSec)}
                onMouseLeave={e => !copied && (e.currentTarget.style.color = T.textDim)}
                title="Copy"
              >
                {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
              </button>
            </div>

            {(!isEdit || rotated) && (
              <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <AlertTriangle size={12} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                <p className="text-[11px] leading-relaxed" style={{ color: T.textSec }}>
                  {rotated
                    ? 'New secret generated. Save changes and update your server — the previous secret is now invalid.'
                    : <>Save this secret now. Use it to verify <code className="mono" style={{ color: T.text }}>X-Genuinux-Signature</code> headers on your server.</>
                  }
                </p>
              </div>
            )}
          </div>

          {err && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              {err}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: `1px solid ${T.border}` }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ border: `1px solid ${T.border}`, color: T.textDim }}
            onMouseEnter={e => (e.currentTarget.style.color = T.textSec)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!isValid || saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: isValid ? '#16C784' : T.border, color: isValid ? '#000000' : T.textDim }}
          >
            {saving && <RefreshCw size={13} className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add Webhook'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DeliveryItem (per-card expandable section) ───────────────────────────────

function DeliveryItem({ d }: { d: DeliveryCardRow }) {
  const meta = EVENT_META[d.event_type] ?? { label: d.event_type, color: '#94A3B8', bg: 'rgba(148,163,184,0.10)' }
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      style={{ borderTop: '1px solid #0A1828' }}
    >
      {d.success
        ? <CheckCircle2 size={11} style={{ color: '#16C784', flexShrink: 0 }} />
        : <XCircle size={11} style={{ color: '#EF4444', flexShrink: 0 }} />
      }
      <span
        className="mono text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
        style={{ color: meta.color, background: meta.bg }}
      >
        {meta.label}
      </span>
      <span
        className="mono text-[11px] px-1.5 py-0.5 rounded font-semibold"
        style={{
          background: d.success ? 'rgba(22,199,132,0.08)' : 'rgba(239,68,68,0.08)',
          color:      d.success ? '#16C784' : '#EF4444',
          minWidth: 34,
          textAlign: 'center',
        }}
      >
        {d.response_status ?? '—'}
      </span>
      {d.duration_ms !== null && (
        <span className="mono text-[10px]" style={{ color: '#2D4057' }}>
          {d.duration_ms}ms
        </span>
      )}
      <span className="mono text-[10px] whitespace-nowrap ml-auto" style={{ color: '#2D4057' }}>
        {ago(d.created_at)}
      </span>
    </div>
  )
}

// ─── WebhookCard ──────────────────────────────────────────────────────────────

interface CardProps {
  webhook:        Webhook
  onEdit:         () => void
  onDelete:       () => void
  onTest:         () => void
  testResult:     TestResult | 'loading' | null
  secretVisible:  boolean
  onToggleSecret: () => void
  toggling:       boolean
  onToggleStatus: () => void
}

function WebhookCard({
  webhook, onEdit, onDelete, onTest, testResult,
  secretVisible, onToggleSecret, toggling, onToggleStatus,
}: CardProps) {
  const T = useT()
  const [expanded,       setExpanded]       = useState(false)
  const [deliveries,     setDeliveries]     = useState<DeliveryCardRow[] | null>(null)
  const [deliveriesErr,  setDeliveriesErr]  = useState<string | null>(null)
  const [deliveriesLoad, setDeliveriesLoad] = useState(false)
  const [delConfirm,     setDelConfirm]     = useState(false)
  const [copied,         setCopied]         = useState(false)

  const isActive = webhook.status === 'active'
  const subscribedEvents: string[] = webhook.events_subscribed?.length
    ? webhook.events_subscribed
    : ALL_EVENTS.map(e => e.id)
  const allSubscribed = subscribedEvents.length === ALL_EVENTS.length

  const handleExpand = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && deliveries === null && !deliveriesLoad) {
      setDeliveriesLoad(true)
      const { data, error } = await supabase
        .from('webhook_deliveries')
        .select('id, event_type, response_status, duration_ms, success, created_at')
        .eq('webhook_id', webhook.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) {
        setDeliveriesErr(
          (error as { code?: string }).code === '42P01' ? '__migration__' : error.message
        )
      } else {
        setDeliveries((data ?? []) as DeliveryCardRow[])
      }
      setDeliveriesLoad(false)
    }
  }

  const handleCopySecret = async () => {
    await copyToClipboard(webhook.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="g-card overflow-hidden">

      {/* ── Main row ────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">

          {/* Status + URL */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <button
              onClick={onToggleStatus}
              disabled={toggling}
              className="flex-shrink-0 mt-0.5"
              style={{ opacity: toggling ? 0.5 : 1, cursor: toggling ? 'not-allowed' : 'pointer' }}
              title={isActive ? 'Click to disable' : 'Click to enable'}
            >
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold mono px-2 py-0.5 rounded-full"
                style={{
                  background: isActive ? 'rgba(22,199,132,0.08)' : 'rgba(71,85,105,0.12)',
                  color:      isActive ? '#16C784' : T.textDim,
                  border: `1px solid ${isActive ? 'rgba(22,199,132,0.2)' : T.border}`,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? '#16C784' : T.textDim }} />
                {isActive ? 'Active' : 'Disabled'}
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold mono truncate" style={{ color: T.text }}>
                {webhook.endpoint_url}
              </p>

              {/* Meta line */}
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <p className="text-[11px] mono" style={{ color: T.textDim }}>
                  Created {new Date(webhook.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {webhook.last_delivery_status && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] mono"
                    style={{ color: webhook.last_delivery_status === 'success' ? '#16C784' : '#EF4444' }}
                  >
                    {webhook.last_delivery_status === 'success'
                      ? <CheckCircle2 size={9} />
                      : <XCircle size={9} />
                    }
                    Last: {webhook.last_delivery_status}
                    {webhook.last_delivery_at && ` · ${ago(webhook.last_delivery_at)}`}
                  </span>
                )}
              </div>

              {/* Subscribed events chips */}
              <div className="flex flex-wrap gap-1 mt-2">
                {allSubscribed ? (
                  <span
                    className="text-[9px] mono px-1.5 py-0.5 rounded"
                    style={{ color: T.textDim, background: T.elevated, border: `1px solid ${T.border}` }}
                  >
                    All events
                  </span>
                ) : (
                  subscribedEvents.map(evId => {
                    const meta = EVENT_META[evId]
                    if (!meta) return null
                    return (
                      <span
                        key={evId}
                        className="text-[9px] mono px-1.5 py-0.5 rounded font-semibold"
                        style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.color}28` }}
                      >
                        {evId}
                      </span>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={onTest}
              disabled={testResult === 'loading'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'rgba(22,199,132,0.08)', color: '#16C784', border: '1px solid rgba(22,199,132,0.2)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(22,199,132,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(22,199,132,0.08)')}
            >
              {testResult === 'loading'
                ? <RefreshCw size={11} className="animate-spin" />
                : <Send size={11} />
              }
              {testResult === 'loading' ? 'Testing…' : 'Test'}
            </button>

            <button
              onClick={onEdit}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ color: T.textDim, background: T.elevated, border: `1px solid ${T.border}` }}
              onMouseEnter={e => (e.currentTarget.style.color = T.textSec)}
              onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
              title="Edit"
            >
              <Pencil size={12} />
            </button>

            {!delConfirm ? (
              <button
                onClick={() => setDelConfirm(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ color: T.textDim, background: T.elevated, border: `1px solid ${T.border}` }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDelConfirm(false)}
                  className="text-[10px] px-2 py-1 rounded-md"
                  style={{ color: T.textDim, border: `1px solid ${T.border}` }}
                >
                  Cancel
                </button>
                <button
                  onClick={onDelete}
                  className="text-[10px] px-2 py-1 rounded-md font-semibold"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Test result */}
        {testResult && testResult !== 'loading' && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: T.bg, border: `1px solid ${T.borderLight}` }}>
            {testResult.success
              ? <CheckCircle2 size={12} style={{ color: '#16C784' }} />
              : <XCircle size={12} style={{ color: '#EF4444' }} />
            }
            <span className="text-xs mono" style={{ color: testResult.success ? '#16C784' : '#EF4444' }}>
              {testResult.success
                ? `✓ ${testResult.status} OK · ${testResult.duration_ms}ms`
                : `✗ ${testResult.error ?? `HTTP ${testResult.status}`}`
              }
            </span>
          </div>
        )}

        {/* Secret row */}
        <div
          className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: T.codeBg, border: `1px solid ${T.borderLight}` }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: T.textDim }}>
            Secret
          </span>
          <code className="flex-1 text-xs mono truncate" style={{ color: T.textDim }}>
            {secretVisible ? webhook.secret : maskSecret(webhook.secret)}
          </code>
          <button
            onClick={onToggleSecret}
            className="p-1 flex-shrink-0"
            style={{ color: T.textDim }}
            onMouseEnter={e => (e.currentTarget.style.color = T.textSec)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
            title={secretVisible ? 'Hide secret' : 'Show secret'}
          >
            {secretVisible ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button
            onClick={() => void handleCopySecret()}
            className="p-1 flex-shrink-0"
            style={{ color: copied ? '#16C784' : T.textDim }}
            onMouseEnter={e => !copied && (e.currentTarget.style.color = T.textSec)}
            onMouseLeave={e => !copied && (e.currentTarget.style.color = T.textDim)}
            title="Copy secret"
          >
            {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* ── Recent Deliveries (expandable) ──────────── */}
      <div style={{ borderTop: `1px solid ${T.borderLight}` }}>
        <button
          onClick={() => void handleExpand()}
          className="w-full flex items-center justify-between px-5 py-2.5 transition-colors"
          style={{ color: T.textDim }}
          onMouseEnter={e => (e.currentTarget.style.color = T.textSec)}
          onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider">Recent Deliveries</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {expanded && (
          <div>
            {deliveriesLoad && (
              <div className="flex items-center gap-2 px-5 py-3" style={{ color: T.textDim }}>
                <RefreshCw size={11} className="animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            )}
            {deliveriesErr === '__migration__' && (
              <div className="flex items-start gap-2 px-5 py-3">
                <AlertTriangle size={12} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                <p className="text-[11px]" style={{ color: T.textDim }}>
                  Run the SQL migration to enable delivery tracking.
                </p>
              </div>
            )}
            {deliveriesErr && deliveriesErr !== '__migration__' && (
              <p className="px-5 py-3 text-xs" style={{ color: '#EF4444' }}>{deliveriesErr}</p>
            )}
            {deliveries !== null && deliveries.length === 0 && !deliveriesErr && (
              <p className="px-5 py-3 text-xs" style={{ color: T.textDim }}>
                No deliveries yet. Send a test to verify your endpoint.
              </p>
            )}
            {deliveries && deliveries.map(d => <DeliveryItem key={d.id} d={d} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Delivery Logs tab ────────────────────────────────────────────────────────

function DeliveryLogs({ orgId, webhooks }: { orgId: string; webhooks: Webhook[] }) {
  const T = useT()
  const [logs,     setLogs]     = useState<DeliveryLogRow[] | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [err,      setErr]      = useState<string | null>(null)
  const [filterEv, setFilterEv] = useState<string>('all')
  const [filterSt, setFilterSt] = useState<'all' | 'success' | 'failed'>('all')

  const endpointMap = Object.fromEntries(webhooks.map(w => [w.id, w.endpoint_url]))

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('webhook_deliveries')
        .select('id, webhook_id, event_type, delivery_status, success, response_status, duration_ms, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) {
        setErr((error as { code?: string }).code === '42P01' ? '__migration__' : error.message)
      } else {
        setLogs((data ?? []) as DeliveryLogRow[])
      }
      setLoading(false)
    })()
  }, [orgId])

  const filtered = (logs ?? []).filter(d => {
    if (filterEv !== 'all' && d.event_type !== filterEv) return false
    if (filterSt !== 'all') {
      const ok = d.delivery_status === 'success' || d.success
      if (filterSt === 'success' && !ok) return false
      if (filterSt === 'failed'  && ok)  return false
    }
    return true
  })

  if (loading) return (
    <div className="flex items-center gap-2 py-12 justify-center" style={{ color: T.textDim }}>
      <RefreshCw size={14} className="animate-spin" />
      <span className="text-sm">Loading delivery logs…</span>
    </div>
  )

  if (err === '__migration__') return (
    <div className="g-card p-5 flex items-start gap-3">
      <AlertTriangle size={14} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
      <div>
        <p className="text-sm font-semibold mb-1" style={{ color: '#F59E0B' }}>Migration required</p>
        <p className="text-xs" style={{ color: T.textDim }}>
          Run the <code className="mono" style={{ color: T.textSec }}>webhook_deliveries</code> SQL migration to enable delivery logs.
        </p>
      </div>
    </div>
  )

  if (err) return <p className="text-sm g-card p-5" style={{ color: '#EF4444' }}>{err}</p>

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textDim }}>
            Event
          </span>
          <select
            value={filterEv}
            onChange={e => setFilterEv(e.target.value)}
            className="text-xs mono px-2 py-1 rounded-lg"
            style={{ background: T.deep, border: `1px solid ${T.border}`, color: T.textSec }}
          >
            <option value="all">All events</option>
            {ALL_EVENTS.map(e => (
              <option key={e.id} value={e.id}>{e.id}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          {(['all', 'success', 'failed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterSt(s)}
              className="text-[10px] px-2.5 py-1 rounded-lg capitalize font-semibold"
              style={{
                background: filterSt === s ? T.elevated : 'transparent',
                color: filterSt === s
                  ? (s === 'success' ? '#16C784' : s === 'failed' ? '#EF4444' : T.textSec)
                  : T.textDim,
                border: `1px solid ${filterSt === s ? T.border : 'transparent'}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[10px] mono" style={{ color: T.textDim }}>
          {filtered.length} {filtered.length === 1 ? 'delivery' : 'deliveries'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="g-card py-12 text-center">
          <Clock size={20} className="mx-auto mb-2" style={{ color: '#1E2D3D' }} />
          <p className="text-sm" style={{ color: '#2D4057' }}>
            {logs?.length === 0 ? 'No deliveries yet.' : 'No deliveries match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="g-card overflow-hidden">
          {/* Table header */}
          <div
            className="grid text-[10px] font-semibold uppercase tracking-wider px-5 py-2.5"
            style={{
              gridTemplateColumns: '140px 1fr 90px 55px 65px 75px',
              color: '#2D4057',
              borderBottom: '1px solid #0D1B2A',
            }}
          >
            <span>Event</span>
            <span>Endpoint</span>
            <span>Status</span>
            <span>Code</span>
            <span>Duration</span>
            <span className="text-right">Time</span>
          </div>

          {filtered.map(d => {
            const meta     = EVENT_META[d.event_type] ?? { label: d.event_type, color: '#94A3B8', bg: 'rgba(148,163,184,0.10)' }
            const isOk     = d.delivery_status === 'success' || d.success
            const endpoint = endpointMap[d.webhook_id] ?? d.webhook_id
            const hasCode  = d.response_status !== null

            return (
              <div
                key={d.id}
                className="grid items-center px-5 py-2.5"
                style={{
                  gridTemplateColumns: '140px 1fr 90px 55px 65px 75px',
                  borderTop: '1px solid #0A1828',
                }}
              >
                {/* Event badge */}
                <span
                  className="mono text-[10px] px-1.5 py-0.5 rounded font-semibold w-fit"
                  style={{ color: meta.color, background: meta.bg }}
                >
                  {meta.label}
                </span>

                {/* Endpoint */}
                <span className="text-xs mono truncate pr-3" style={{ color: '#475569' }}>
                  {endpoint}
                </span>

                {/* Status */}
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold"
                  style={{ color: isOk ? '#16C784' : '#EF4444' }}
                >
                  {isOk ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                  {isOk ? 'Success' : 'Failed'}
                </span>

                {/* HTTP code */}
                <span
                  className="mono text-[11px] font-semibold px-1.5 py-0.5 rounded text-center w-fit"
                  style={{
                    background: !hasCode
                      ? 'rgba(71,85,105,0.1)'
                      : d.response_status! < 300
                        ? 'rgba(22,199,132,0.08)'
                        : 'rgba(239,68,68,0.08)',
                    color: !hasCode
                      ? '#475569'
                      : d.response_status! < 300
                        ? '#16C784'
                        : '#EF4444',
                  }}
                >
                  {d.response_status ?? '—'}
                </span>

                {/* Duration */}
                <span className="mono text-[10px]" style={{ color: '#2D4057' }}>
                  {d.duration_ms != null ? `${d.duration_ms}ms` : '—'}
                </span>

                {/* Time */}
                <span className="mono text-[10px] text-right" style={{ color: '#2D4057' }}>
                  {ago(d.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Webhooks() {
  const { user, profile } = useAuth()
  const orgId = profile?.organization_id ?? null

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [tab,      setTab]      = useState<'endpoints' | 'logs'>('endpoints')

  const [showModal,      setShowModal]      = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<Webhook | undefined>(undefined)
  const [toggling,       setToggling]       = useState<Set<string>>(new Set())
  const [secretVisible,  setSecretVisible]  = useState<Set<string>>(new Set())
  const [testResults,    setTestResults]    = useState<Map<string, TestResult | 'loading'>>(new Map())

  const fetchWebhooks = useCallback(async () => {
    if (!orgId) return
    const { data, error: err } = await supabase
      .from('webhooks')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setWebhooks((data ?? []) as Webhook[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { void fetchWebhooks() }, [fetchWebhooks])

  // Handle profile-loaded-but-no-org edge case
  useEffect(() => {
    if (profile !== null && !orgId) {
      setError('No organization linked to this account.')
      setLoading(false)
    }
  }, [profile, orgId])

  // ── Actions ────────────────────────────────────────────────

  const handleToggleStatus = async (webhook: Webhook) => {
    setToggling(prev => new Set(prev).add(webhook.id))
    const next = webhook.status === 'active' ? 'disabled' : 'active'
    setWebhooks(prev => prev.map(w => w.id === webhook.id ? { ...w, status: next } : w))
    const { error } = await supabase.from('webhooks').update({ status: next }).eq('id', webhook.id)
    if (error) setWebhooks(prev => prev.map(w => w.id === webhook.id ? { ...w, status: webhook.status } : w))
    setToggling(prev => { const s = new Set(prev); s.delete(webhook.id); return s })
  }

  const handleDelete = async (id: string) => {
    const deleted = webhooks.find(w => w.id === id)
    await supabase.from('webhooks').delete().eq('id', id)
    if (orgId && deleted) {
      void supabase.from('audit_logs').insert({
        organization_id: orgId,
        user_id:         user?.id ?? null,
        action:          'webhook.deleted',
        metadata_json:   { webhook_id: id, endpoint_url: deleted.endpoint_url },
      })
    }
    setWebhooks(prev => prev.filter(w => w.id !== id))
  }

  const handleSaved = (saved: Webhook) => {
    setWebhooks(prev => {
      const idx    = prev.findIndex(w => w.id === saved.id)
      const action = idx >= 0 ? 'webhook.updated' : 'webhook.created'
      if (orgId) {
        void supabase.from('audit_logs').insert({
          organization_id: orgId,
          user_id:         user?.id ?? null,
          action,
          metadata_json:   { webhook_id: saved.id, endpoint_url: saved.endpoint_url },
        })
      }
      return idx >= 0
        ? prev.map(w => w.id === saved.id ? saved : w)
        : [...prev, saved]
    })
  }

  const handleTest = async (webhook: Webhook) => {
    setTestResults(prev => new Map(prev).set(webhook.id, 'loading'))
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setTestResults(prev => new Map(prev).set(webhook.id, { success: false, status: null, duration_ms: 0, error: 'Not authenticated' }))
      return
    }
    try {
      const res    = await fetch('/api/webhooks/test', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body:    JSON.stringify({ webhook_id: webhook.id }),
      })
      const result = await res.json() as TestResult
      // Refresh webhook to pick up last_delivery_status
      void fetchWebhooks()
      setTestResults(prev => new Map(prev).set(webhook.id, result))
    } catch (err) {
      setTestResults(prev => new Map(prev).set(webhook.id, {
        success: false, status: null, duration_ms: 0,
        error: err instanceof Error ? err.message : 'Request failed',
      }))
    }
    setTimeout(() => {
      setTestResults(prev => { const m = new Map(prev); m.delete(webhook.id); return m })
    }, 10_000)
  }

  const toggleSecret = (id: string) => {
    setSecretVisible(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: '#475569' }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading webhooks…</span>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <div className="g-card p-5 text-sm" style={{ color: '#EF4444' }}>{error}</div>
    </div>
  )

  const activeCount = webhooks.filter(w => w.status === 'active').length

  return (
    <div className="p-7" style={{ maxWidth: 960 }}>

      {/* ── Top bar ──────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          {/* Tab switcher */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-xl"
            style={{ background: '#07111F', border: '1px solid #1E2D3D' }}
          >
            {([
              { id: 'endpoints', label: 'Endpoints',     icon: Globe },
              { id: 'logs',      label: 'Delivery Logs', icon: List  },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: tab === t.id ? '#0F1929' : 'transparent',
                  color:      tab === t.id ? '#E2E8F0' : '#475569',
                }}
              >
                <t.icon size={11} />
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'endpoints' && (
            <p className="text-sm" style={{ color: '#475569' }}>
              {activeCount > 0
                ? <><span style={{ color: '#16C784', fontWeight: 600 }}>{activeCount} active</span></>
                : <span>No active webhooks</span>
              }
              <span style={{ color: '#2D4057' }}> · {webhooks.length} total</span>
            </p>
          )}
        </div>

        {tab === 'endpoints' && (
          <button
            onClick={() => { setEditingWebhook(undefined); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: '#16C784', color: '#000000' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Plus size={14} />
            New Webhook
          </button>
        )}
      </div>

      {/* ── Info banner (endpoints only) ─────────────── */}
      {tab === 'endpoints' && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6"
          style={{ background: 'rgba(22,199,132,0.05)', border: '1px solid rgba(22,199,132,0.12)' }}
        >
          <Info size={13} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
            Each delivery is signed with{' '}
            <code className="mono" style={{ color: '#94A3B8' }}>X-Genuinux-Signature</code>,{' '}
            <code className="mono" style={{ color: '#94A3B8' }}>X-Genuinux-Event</code>, and{' '}
            <code className="mono" style={{ color: '#94A3B8' }}>X-Genuinux-Timestamp</code>.{' '}
            Subscribe only to the events your system needs.
          </p>
        </div>
      )}

      {/* ── Endpoints tab ───────────────────────────── */}
      {tab === 'endpoints' && (
        <>
          {webhooks.length === 0 ? (
            <div className="g-card py-16 text-center">
              <Globe size={24} className="mx-auto mb-3" style={{ color: '#1E2D3D' }} />
              <p className="text-sm font-semibold mb-1.5" style={{ color: '#475569' }}>No webhooks yet</p>
              <p className="text-xs mb-5" style={{ color: '#2D4057' }}>
                Register an endpoint to receive real-time risk events.
              </p>
              <button
                onClick={() => { setEditingWebhook(undefined); setShowModal(true) }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
                style={{ background: '#16C784', color: '#000000' }}
              >
                <Plus size={13} />
                New Webhook
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {webhooks.map(webhook => (
                <WebhookCard
                  key={webhook.id}
                  webhook={webhook}
                  onEdit={() => { setEditingWebhook(webhook); setShowModal(true) }}
                  onDelete={() => void handleDelete(webhook.id)}
                  onTest={() => void handleTest(webhook)}
                  testResult={testResults.get(webhook.id) ?? null}
                  secretVisible={secretVisible.has(webhook.id)}
                  onToggleSecret={() => toggleSecret(webhook.id)}
                  toggling={toggling.has(webhook.id)}
                  onToggleStatus={() => void handleToggleStatus(webhook)}
                />
              ))}
            </div>
          )}

          {/* Signature snippet */}
          {webhooks.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#2D4057' }}>
                Signature Verification — Node.js
              </p>
              <pre
                className="mono text-[11px] p-4 rounded-xl overflow-x-auto"
                style={{ background: '#07111F', border: '1px solid #1E2D3D', color: '#475569', lineHeight: 1.75 }}
              >{`const crypto = require('crypto')

function verifyWebhook(rawBody, signature, secret) {
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  )
}

// Express example:
app.post('/hooks/genuinux', express.raw({ type: 'application/json' }), (req, res) => {
  const sig   = req.headers['x-genuinux-signature']
  const event = req.headers['x-genuinux-event']       // e.g. "risk.event.blocked"
  const ts    = req.headers['x-genuinux-timestamp']   // Unix seconds
  if (!verifyWebhook(req.body, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature')
  }
  const payload = JSON.parse(req.body)
  console.log('Received:', event, payload.decision)
  res.sendStatus(200)
})`}</pre>
            </div>
          )}
        </>
      )}

      {/* ── Delivery Logs tab ───────────────────────── */}
      {tab === 'logs' && orgId !== null && (
        <DeliveryLogs orgId={orgId} webhooks={webhooks} />
      )}

      {/* Modal */}
      {showModal && orgId !== null && (
        <WebhookModal
          webhook={editingWebhook}
          orgId={orgId}
          onSave={handleSaved}
          onClose={() => { setShowModal(false); setEditingWebhook(undefined) }}
        />
      )}
    </div>
  )
}
