import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Globe, Copy, Eye, EyeOff, Trash2, Pencil, X, RefreshCw,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Send, RotateCcw,
  Info, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Webhook } from '../../types'

// ─── Local types ──────────────────────────────────────────────────────────────

interface DeliveryRow {
  id: string
  event_type: string
  response_status: number | null
  duration_ms: number | null
  success: boolean
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
  const [url,     setUrl]     = useState(webhook?.endpoint_url ?? '')
  const [secret,  setSecret]  = useState(webhook?.secret ?? genSecret())
  const [rotated, setRotated] = useState(false)
  const [showSec, setShowSec] = useState(!webhook)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState<string | null>(null)
  const [copied,  setCopied]  = useState(false)

  const isEdit  = Boolean(webhook)
  const isValid = url.trim().startsWith('http') && secret.length > 0

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
      const patch: Record<string, string> = { endpoint_url: url.trim() }
      if (rotated) patch['secret'] = secret
      ;({ data, error } = await supabase.from('webhooks').update(patch).eq('id', webhook!.id).select().single())
    } else {
      ;({ data, error } = await supabase.from('webhooks').insert({
        organization_id: orgId,
        endpoint_url:    url.trim(),
        secret,
        status:          'active',
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
        style={{ maxWidth: 500, background: '#07111F', border: '1px solid #1E2D3D', borderRadius: 20, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #1E2D3D' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#2D4057' }}>
              {isEdit ? 'Edit Webhook' : 'New Webhook'}
            </p>
            <p className="text-sm font-bold" style={{ color: '#E2E8F0', fontFamily: 'Syne, sans-serif' }}>
              {isEdit ? 'Update endpoint' : 'Register an endpoint'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: '#0B1220', border: '1px solid #1E2D3D', color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#E2E8F0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* URL */}
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>
              Endpoint URL
            </label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://api.yourapp.com/hooks/genuinux"
              className="g-input text-sm"
            />
          </div>

          {/* Secret */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold" style={{ color: '#94A3B8' }}>
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
              style={{ background: '#050B14', border: '1px solid #1E2D3D' }}
            >
              <code className="flex-1 text-xs mono truncate" style={{ color: '#94A3B8' }}>
                {showSec ? secret : maskSecret(secret)}
              </code>
              <button
                onClick={() => setShowSec(v => !v)}
                className="flex-shrink-0 p-1"
                style={{ color: '#2D4057' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
                onMouseLeave={e => (e.currentTarget.style.color = '#2D4057')}
                title={showSec ? 'Hide' : 'Show'}
              >
                {showSec ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                onClick={() => void handleCopy()}
                className="flex-shrink-0 p-1"
                style={{ color: copied ? '#16C784' : '#2D4057' }}
                onMouseEnter={e => !copied && (e.currentTarget.style.color = '#475569')}
                onMouseLeave={e => !copied && (e.currentTarget.style.color = '#2D4057')}
                title="Copy"
              >
                {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
              </button>
            </div>

            {(!isEdit || rotated) && (
              <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <AlertTriangle size={12} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                <p className="text-[11px] leading-relaxed" style={{ color: '#94A3B8' }}>
                  {rotated
                    ? 'New secret generated. Save changes and update your server — the previous secret is now invalid.'
                    : <>Save this secret now. Use it to verify <code className="mono" style={{ color: '#E2E8F0' }}>X-Genuinux-Signature</code> headers on your server.</>
                  }
                </p>
              </div>
            )}
          </div>

          {/* Sample payload */}
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>
              Sample Payload
            </label>
            <pre
              className="text-[11px] mono p-3 rounded-xl overflow-x-auto"
              style={{ background: '#050B14', border: '1px solid #1E2D3D', color: '#475569', lineHeight: 1.65 }}
            >{`{
  "event": "risk.check.completed",
  "event_id": "evt_...",
  "external_user_id": "user_123",
  "trust_score": 82,
  "fraud_score": 18,
  "risk_level": "low",
  "decision": "approve",
  "created_at": "2026-01-15T12:00:00Z"
}`}</pre>
          </div>

          {err && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              {err}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #1E2D3D' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ border: '1px solid #1E2D3D', color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!isValid || saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: isValid ? '#16C784' : '#1E2D3D', color: isValid ? '#000000' : '#475569' }}
          >
            {saving && <RefreshCw size={13} className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add Webhook'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DeliveryRow component ────────────────────────────────────────────────────

function DeliveryItem({ d }: { d: DeliveryRow }) {
  return (
    <div
      className="flex items-center gap-3 px-5 py-2.5"
      style={{ borderTop: '1px solid #0A1828' }}
    >
      {d.success
        ? <CheckCircle2 size={11} style={{ color: '#16C784', flexShrink: 0 }} />
        : <XCircle size={11} style={{ color: '#EF4444', flexShrink: 0 }} />
      }
      <span
        className="mono text-[11px] px-1.5 py-0.5 rounded font-semibold"
        style={{
          background: d.success ? 'rgba(22,199,132,0.08)' : 'rgba(239,68,68,0.08)',
          color: d.success ? '#16C784' : '#EF4444',
          minWidth: 34,
          textAlign: 'center',
        }}
      >
        {d.response_status ?? '—'}
      </span>
      <span className="text-xs flex-1 truncate" style={{ color: '#475569' }}>
        {d.event_type}
      </span>
      {d.duration_ms !== null && (
        <span className="mono text-[10px]" style={{ color: '#2D4057' }}>
          {d.duration_ms}ms
        </span>
      )}
      <span className="mono text-[10px] whitespace-nowrap" style={{ color: '#2D4057', minWidth: 50, textAlign: 'right' }}>
        {ago(d.created_at)}
      </span>
    </div>
  )
}

// ─── WebhookCard ──────────────────────────────────────────────────────────────

interface CardProps {
  webhook:         Webhook
  onEdit:          () => void
  onDelete:        () => void
  onTest:          () => void
  testResult:      TestResult | 'loading' | null
  secretVisible:   boolean
  onToggleSecret:  () => void
  toggling:        boolean
  onToggleStatus:  () => void
}

function WebhookCard({
  webhook, onEdit, onDelete, onTest, testResult,
  secretVisible, onToggleSecret, toggling, onToggleStatus,
}: CardProps) {
  const [expanded,         setExpanded]         = useState(false)
  const [deliveries,       setDeliveries]       = useState<DeliveryRow[] | null>(null)
  const [deliveriesErr,    setDeliveriesErr]    = useState<string | null>(null)
  const [deliveriesLoad,   setDeliveriesLoad]   = useState(false)
  const [delConfirm,       setDelConfirm]       = useState(false)
  const [copied,           setCopied]           = useState(false)

  const isActive = webhook.status === 'active'

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
          (error as { code?: string }).code === '42P01'
            ? '__migration__'
            : error.message
        )
      } else {
        setDeliveries((data ?? []) as DeliveryRow[])
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

      {/* ── Main row ──────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">

          {/* Status pill + URL */}
          <div className="flex items-start gap-3 min-w-0">
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
                  color: isActive ? '#16C784' : '#475569',
                  border: `1px solid ${isActive ? 'rgba(22,199,132,0.2)' : '#1E2D3D'}`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: isActive ? '#16C784' : '#475569' }}
                />
                {isActive ? 'Active' : 'Disabled'}
              </span>
            </button>

            <div className="min-w-0">
              <p className="text-sm font-semibold mono truncate" style={{ color: '#E2E8F0' }}>
                {webhook.endpoint_url}
              </p>
              <p className="text-[11px] mt-0.5 mono" style={{ color: '#2D4057' }}>
                Created {new Date(webhook.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
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
              style={{ color: '#475569', background: '#0B1220', border: '1px solid #1E2D3D' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
              title="Edit"
            >
              <Pencil size={12} />
            </button>

            {!delConfirm ? (
              <button
                onClick={() => setDelConfirm(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ color: '#475569', background: '#0B1220', border: '1px solid #1E2D3D' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDelConfirm(false)}
                  className="text-[10px] px-2 py-1 rounded-md"
                  style={{ color: '#475569', border: '1px solid #1E2D3D' }}
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
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#050B14', border: '1px solid #0D1B2A' }}>
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
          style={{ background: '#050B14', border: '1px solid #0D1B2A' }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: '#2D4057' }}>
            Secret
          </span>
          <code className="flex-1 text-xs mono truncate" style={{ color: '#475569' }}>
            {secretVisible ? webhook.secret : maskSecret(webhook.secret)}
          </code>
          <button
            onClick={onToggleSecret}
            className="p-1 flex-shrink-0"
            style={{ color: '#2D4057' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
            onMouseLeave={e => (e.currentTarget.style.color = '#2D4057')}
            title={secretVisible ? 'Hide secret' : 'Show secret'}
          >
            {secretVisible ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button
            onClick={() => void handleCopySecret()}
            className="p-1 flex-shrink-0"
            style={{ color: copied ? '#16C784' : '#2D4057' }}
            onMouseEnter={e => !copied && (e.currentTarget.style.color = '#475569')}
            onMouseLeave={e => !copied && (e.currentTarget.style.color = '#2D4057')}
            title="Copy secret"
          >
            {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* ── Deliveries section ─────────────────────────── */}
      <div style={{ borderTop: '1px solid #0D1B2A' }}>
        <button
          onClick={() => void handleExpand()}
          className="w-full flex items-center justify-between px-5 py-2.5 transition-colors"
          style={{ color: '#2D4057' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
          onMouseLeave={e => (e.currentTarget.style.color = '#2D4057')}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider">
            Recent Deliveries
          </span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {expanded && (
          <div>
            {deliveriesLoad && (
              <div className="flex items-center gap-2 px-5 py-3" style={{ color: '#2D4057' }}>
                <RefreshCw size={11} className="animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            )}

            {deliveriesErr === '__migration__' && (
              <div className="flex items-start gap-2 px-5 py-3">
                <AlertTriangle size={12} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: '#F59E0B' }}>
                    Migration required
                  </p>
                  <p className="text-[11px]" style={{ color: '#475569' }}>
                    Run the <code className="mono" style={{ color: '#94A3B8' }}>webhook_deliveries</code> migration in{' '}
                    <code className="mono" style={{ color: '#94A3B8' }}>supabase/schema.sql</code> to enable delivery tracking.
                  </p>
                </div>
              </div>
            )}

            {deliveriesErr && deliveriesErr !== '__migration__' && (
              <p className="px-5 py-3 text-xs" style={{ color: '#EF4444' }}>{deliveriesErr}</p>
            )}

            {deliveries !== null && deliveries.length === 0 && !deliveriesErr && (
              <p className="px-5 py-3 text-xs" style={{ color: '#2D4057' }}>
                No deliveries yet. Send a test to verify your endpoint.
              </p>
            )}

            {deliveries && deliveries.map(d => (
              <DeliveryItem key={d.id} d={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Webhooks() {
  const { user } = useAuth()
  const [orgId,    setOrgId]    = useState<string | null>(null)
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const [showModal,      setShowModal]      = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<Webhook | undefined>(undefined)
  const [toggling,       setToggling]       = useState<Set<string>>(new Set())
  const [secretVisible,  setSecretVisible]  = useState<Set<string>>(new Set())
  const [testResults,    setTestResults]    = useState<Map<string, TestResult | 'loading'>>(new Map())

  // ── Resolve org ───────────────────────────────────────────
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

  // ── Toggle active/disabled ────────────────────────────────
  const handleToggleStatus = async (webhook: Webhook) => {
    setToggling(prev => new Set(prev).add(webhook.id))
    const next = webhook.status === 'active' ? 'disabled' : 'active'
    setWebhooks(prev => prev.map(w => w.id === webhook.id ? { ...w, status: next } : w))
    const { error } = await supabase.from('webhooks').update({ status: next }).eq('id', webhook.id)
    if (error) setWebhooks(prev => prev.map(w => w.id === webhook.id ? { ...w, status: webhook.status } : w))
    setToggling(prev => { const s = new Set(prev); s.delete(webhook.id); return s })
  }

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    await supabase.from('webhooks').delete().eq('id', id)
    setWebhooks(prev => prev.filter(w => w.id !== id))
  }

  // ── Save (create / edit) ──────────────────────────────────
  const handleSaved = (saved: Webhook) => {
    setWebhooks(prev => {
      const idx = prev.findIndex(w => w.id === saved.id)
      return idx >= 0
        ? prev.map(w => w.id === saved.id ? saved : w)
        : [...prev, saved]
    })
  }

  // ── Test delivery ─────────────────────────────────────────
  const handleTest = async (webhook: Webhook) => {
    setTestResults(prev => new Map(prev).set(webhook.id, 'loading'))

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setTestResults(prev => new Map(prev).set(webhook.id, {
        success: false, status: null, duration_ms: 0, error: 'Not authenticated',
      }))
      return
    }

    try {
      const res  = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ webhook_id: webhook.id }),
      })
      const result = await res.json() as TestResult
      setTestResults(prev => new Map(prev).set(webhook.id, result))
    } catch (err) {
      setTestResults(prev => new Map(prev).set(webhook.id, {
        success: false, status: null, duration_ms: 0,
        error: err instanceof Error ? err.message : 'Request failed',
      }))
    }

    // Auto-clear after 10s
    setTimeout(() => {
      setTestResults(prev => { const m = new Map(prev); m.delete(webhook.id); return m })
    }, 10_000)
  }

  // ── Secret visibility ─────────────────────────────────────
  const toggleSecret = (id: string) => {
    setSecretVisible(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Loading / error states ────────────────────────────────
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

      {/* Sub-header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: '#475569' }}>
          {activeCount > 0
            ? <><span style={{ color: '#16C784', fontWeight: 600 }}>{activeCount} active</span></>
            : <span>No active webhooks</span>
          }
          <span style={{ color: '#2D4057' }}> · {webhooks.length} total</span>
        </p>
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
      </div>

      {/* Info banner */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6"
        style={{ background: 'rgba(22,199,132,0.05)', border: '1px solid rgba(22,199,132,0.12)' }}
      >
        <Info size={13} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
          Webhooks fire after every <code className="mono" style={{ color: '#94A3B8' }}>risk.check.completed</code> event.
          Validate requests by checking the{' '}
          <code className="mono" style={{ color: '#94A3B8' }}>X-Genuinux-Signature</code>{' '}
          header — an HMAC-SHA256 of the raw JSON body signed with your webhook secret.
        </p>
      </div>

      {/* Empty state */}
      {webhooks.length === 0 ? (
        <div className="g-card py-16 text-center">
          <Globe size={24} className="mx-auto mb-3" style={{ color: '#1E2D3D' }} />
          <p className="text-sm font-semibold mb-1.5" style={{ color: '#475569' }}>No webhooks yet</p>
          <p className="text-xs mb-5" style={{ color: '#2D4057' }}>
            Register an endpoint to receive real-time risk analysis results.
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

      {/* Signature verification snippet */}
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
  const sig = req.headers['x-genuinux-signature']
  if (!verifyWebhook(req.body, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature')
  }
  const event = JSON.parse(req.body)
  // handle event.decision, event.risk_level, etc.
  res.sendStatus(200)
})`}</pre>
        </div>
      )}

      {/* Modal */}
      {showModal && orgId && (
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
