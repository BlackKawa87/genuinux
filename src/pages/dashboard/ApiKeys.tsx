import { useState, useEffect, useRef } from 'react'
import {
  Key, Copy, Trash2, Plus, CheckCircle,
  AlertTriangle, Terminal, ChevronRight,
  Code2, RefreshCw, Shield,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'
import type { ApiKey } from '../../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

async function generateApiKey(): Promise<{ fullKey: string; prefix: string; hash: string }> {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  const fullKey = `gnx_live_${hex}`

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fullKey))
  const hash = Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')

  // Keep first 18 chars visible, mask the rest
  const prefix = fullKey.slice(0, 18) + '••••••••••••••••••'
  return { fullKey, prefix, hash }
}

// ─── Code examples ────────────────────────────────────────────────────────────

const EXAMPLES = {
  curl: `curl -X POST https://genuinux.vercel.app/api/risk/check \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_user_id": "user_12345",
    "event_type": "signup",
    "email": "user@example.com",
    "ip_address": "203.0.113.42",
    "device_id": "dev_abc123"
  }'`,

  node: `const res = await fetch(
  'https://genuinux.vercel.app/api/risk/check',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_user_id: 'user_12345',
      event_type: 'signup',
      email: 'user@example.com',
      ip_address: req.ip,
      device_id: 'dev_abc123',
    }),
  }
)
const { decision, trust_score, signals } = await res.json()`,

  python: `import httpx

r = httpx.post(
    "https://genuinux.vercel.app/api/risk/check",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "external_user_id": "user_12345",
        "event_type": "signup",
        "email": "user@example.com",
        "ip_address": "203.0.113.42",
        "device_id": "dev_abc123",
    },
)
data = r.json()
decision = data["decision"]  # "approve" | "review" | "block"`,
}

const RESPONSE_EXAMPLE = `{
  "event_id": "evt_1748123456789",
  "trust_score": 82,
  "fraud_score": 18,
  "risk_level": "low",
  "decision": "approve",
  "signals": [],
  "summary": "No fraud signals detected. User appears legitimate.",
  "processing_time_ms": 47
}`

const PAYLOAD_FIELDS = [
  { field: 'external_user_id', type: 'string', req: true,  desc: 'Your internal user identifier' },
  { field: 'event_type',       type: 'enum',   req: true,  desc: 'signup · login · transaction · withdrawal · referral · checkout · custom' },
  { field: 'email',            type: 'string', req: false, desc: 'User email address' },
  { field: 'ip_address',       type: 'string', req: false, desc: 'IPv4 or IPv6 of the request' },
  { field: 'device_id',        type: 'string', req: false, desc: 'Device fingerprint or persistent identifier' },
  { field: 'user_agent',       type: 'string', req: false, desc: 'Browser or app user agent string' },
  { field: 'phone',            type: 'string', req: false, desc: 'Phone number in E.164 format' },
  { field: 'country',          type: 'string', req: false, desc: 'ISO 3166-1 alpha-2 country code' },
  { field: 'metadata',         type: 'object', req: false, desc: 'Any additional key-value data' },
]

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'curl' | 'node' | 'python'

export default function ApiKeys() {
  const { user } = useAuth()
  const T = useT()

  const [keys,     setKeys]     = useState<ApiKey[]>([])
  const [loading,  setLoading]  = useState(true)
  const [orgId,    setOrgId]    = useState<string | null>(null)
  const [freePlan, setFreePlan] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Create flow
  const [showCreate, setShowCreate]     = useState(false)
  const [newKeyName, setNewKeyName]     = useState('')
  const [creating, setCreating]         = useState(false)
  const [createError, setCreateError]   = useState<string | null>(null)

  // Show full key exactly once
  const [revealedKey, setRevealedKey] = useState<{
    id: string; name: string; fullKey: string
  } | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)

  // Revoke confirmation (2-click)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [revoking, setRevoking]           = useState<string | null>(null)
  const revokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Integration docs
  const [tab, setTab]           = useState<Tab>('curl')
  const [codeCopied, setCodeCopied] = useState<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, organizations(plan)')
        .eq('user_id', user.id)
        .single()

      const oid  = profile?.organization_id ?? null
      const orgs = profile?.organizations as unknown as { plan: string }[] | { plan: string } | null
      const plan = Array.isArray(orgs) ? orgs[0]?.plan : orgs?.plan
      setOrgId(oid)
      setFreePlan(plan === 'free')

      if (oid) {
        const { data, error: err } = await supabase
          .from('api_keys')
          .select('*')
          .eq('organization_id', oid)
          .order('created_at', { ascending: false })

        if (err) setError(err.message)
        else setKeys(data ?? [])
      }

      setLoading(false)
    })()
  }, [user])

  async function refreshKeys(oid: string) {
    const { data } = await supabase
      .from('api_keys')
      .select('*')
      .eq('organization_id', oid)
      .order('created_at', { ascending: false })
    setKeys(data ?? [])
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!newKeyName.trim() || !orgId) return
    setCreating(true)
    setCreateError(null)
    try {
      const { fullKey, prefix, hash } = await generateApiKey()
      const { data, error: err } = await supabase
        .from('api_keys')
        .insert({ organization_id: orgId, name: newKeyName.trim(), key_hash: hash, key_prefix: prefix, status: 'active' })
        .select('*')
        .single()

      if (err) {
        setCreateError(err.message)
      } else {
        void supabase.from('audit_logs').insert({
          organization_id: orgId,
          user_id: user?.id ?? null,
          action: 'api_key.created',
          metadata_json: { key_id: data.id, key_name: data.name, key_prefix: prefix },
        })
        setRevealedKey({ id: data.id, name: data.name, fullKey })
        setShowCreate(false)
        setNewKeyName('')
        await refreshKeys(orgId)
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Key generation failed')
    } finally {
      setCreating(false)
    }
  }

  // ── Revoke ────────────────────────────────────────────────────────────────

  function initiateRevoke(id: string) {
    if (confirmRevoke === id) {
      void executeRevoke(id)
    } else {
      setConfirmRevoke(id)
      if (revokeTimer.current) clearTimeout(revokeTimer.current)
      revokeTimer.current = setTimeout(() => setConfirmRevoke(null), 3000)
    }
  }

  async function executeRevoke(id: string) {
    setConfirmRevoke(null)
    setRevoking(id)
    const { error: err } = await supabase
      .from('api_keys')
      .update({ status: 'revoked' })
      .eq('id', id)

    if (err) {
      setError(err.message)
    } else {
      const revokedKey = keys.find(k => k.id === id)
      void supabase.from('audit_logs').insert({
        organization_id: orgId,
        user_id: user?.id ?? null,
        action: 'api_key.revoked',
        metadata_json: { key_id: id, key_name: revokedKey?.name ?? null },
      })
      setKeys(prev => prev.map(k => k.id === id ? { ...k, status: 'revoked' as const } : k))
    }
    setRevoking(null)
  }

  // ── Copy helpers ──────────────────────────────────────────────────────────

  function copyText(text: string, cb: () => void) {
    void navigator.clipboard.writeText(text)
    cb()
  }

  function copyCode(id: string, text: string) {
    copyText(text, () => {
      setCodeCopied(id)
      setTimeout(() => setCodeCopied(null), 2000)
    })
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2" style={{ color: T.textDim }}>
        <RefreshCw size={14} className="animate-spin" />
        <span className="text-sm">Loading API keys…</span>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-8" style={{ maxWidth: '900px' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'Inter, sans-serif', color: T.text }}
          >
            API Keys
          </h1>
          <p className="text-sm mt-1" style={{ color: T.textSec }}>
            Authenticate your server-side integration with Genuinux
          </p>
        </div>
        {orgId && !showCreate && (() => {
          const activeKeys = keys.filter(k => k.status === 'active').length
          const atLimit    = freePlan && activeKeys >= 1
          return (
            <div className="flex items-center gap-3">
              {atLimit && (
                <p className="text-xs" style={{ color: '#475569' }}>
                  Free plan: 1 API key limit.{' '}
                  <a href="mailto:sales@genuinux.io" style={{ color: '#16C784' }}>Upgrade</a>
                </p>
              )}
              <button
                onClick={() => { if (!atLimit) { setShowCreate(true); setCreateError(null) } }}
                disabled={atLimit}
                className="btn-trust flex items-center gap-2 px-4 py-2 text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                New API key
              </button>
            </div>
          )
        })()}
      </div>

      {/* ── Revealed key banner ─────────────────────────────────────────────── */}
      {revealedKey && (
        <div
          className="mb-6 rounded-xl p-5"
          style={{
            background: 'rgba(234,179,8,0.05)',
            border: '1px solid rgba(234,179,8,0.22)',
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle
              size={15}
              style={{ color: '#EAB308', marginTop: 1, flexShrink: 0 }}
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#EAB308' }}>
                Save your API key — it will not be shown again
              </p>
              <p className="text-xs mt-0.5" style={{ color: T.textSec }}>
                Copy and store this key in a secure location such as an environment variable.
                Once dismissed, only the prefix is visible.
              </p>
            </div>
          </div>

          {/* Key display */}
          <div
            className="flex items-center gap-3 rounded-lg px-4 py-3"
            style={{ background: T.codeBg, border: `1px solid ${T.border}` }}
          >
            <code
              className="flex-1 text-sm mono overflow-x-auto"
              style={{ color: '#E2E8F0', letterSpacing: '0.02em', userSelect: 'all' }}
            >
              {revealedKey.fullKey}
            </code>
            <button
              onClick={() => copyText(revealedKey.fullKey, () => {
                setKeyCopied(true)
                setTimeout(() => setKeyCopied(false), 2000)
              })}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-150"
              style={{
                background: keyCopied ? 'rgba(22,199,132,0.1)' : 'rgba(255,255,255,0.05)',
                border: '1px solid',
                borderColor: keyCopied ? 'rgba(22,199,132,0.3)' : 'rgba(255,255,255,0.08)',
                color: keyCopied ? '#16C784' : '#94A3B8',
              }}
            >
              {keyCopied ? <CheckCircle size={12} /> : <Copy size={12} />}
              {keyCopied ? 'Copied!' : 'Copy key'}
            </button>
          </div>

          <button
            onClick={() => setRevealedKey(null)}
            className="mt-3 text-xs transition-colors"
            style={{ color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >
            I've saved my key — dismiss
          </button>
        </div>
      )}

      {/* ── Create form ─────────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="g-card p-5 mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: '#475569' }}>
            New API key
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleCreate()}
              placeholder="Key name  (e.g. Production, Staging)"
              className="g-input flex-1"
              autoFocus
              disabled={creating}
              maxLength={64}
            />
            <button
              onClick={() => void handleCreate()}
              disabled={!newKeyName.trim() || creating}
              className="btn-trust flex items-center gap-2 px-4 py-2 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating && <RefreshCw size={12} className="animate-spin" />}
              {creating ? 'Generating…' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setCreateError(null); setNewKeyName('') }}
              className="btn-outline px-4 py-2 text-sm rounded-lg"
              disabled={creating}
            >
              Cancel
            </button>
          </div>
          {createError && (
            <p className="mt-3 text-xs" style={{ color: '#EF4444' }}>{createError}</p>
          )}
        </div>
      )}

      {/* ── Global error ─────────────────────────────────────────────────────── */}
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-xl text-xs"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}
        >
          {error}
        </div>
      )}

      {/* ── No org ──────────────────────────────────────────────────────────── */}
      {!orgId && (
        <div className="g-card p-12 text-center">
          <Shield size={28} className="mx-auto mb-3" style={{ color: '#1E2D3D' }} />
          <p className="text-sm font-semibold mb-1" style={{ color: '#94A3B8' }}>
            Organization not configured
          </p>
          <p className="text-xs" style={{ color: '#475569' }}>
            Your account is not linked to an organization yet.
            Contact your admin or set up your workspace in Settings.
          </p>
        </div>
      )}

      {/* ── Keys list ───────────────────────────────────────────────────────── */}
      {orgId && (
        <>
          {/* Column headers */}
          {keys.length > 0 && (
            <div
              className="hidden md:flex items-center px-5 mb-2 text-xs font-medium uppercase tracking-wide"
              style={{ color: '#2D4057' }}
            >
              <div style={{ flex: '1 1 0', minWidth: 0 }}>Name</div>
              <div style={{ width: 72 }}>Status</div>
              <div style={{ width: 120 }}>Created</div>
              <div style={{ width: 100 }}>Last used</div>
              <div style={{ width: 80, textAlign: 'right' }}>Requests</div>
              <div style={{ width: 96 }} />
            </div>
          )}

          <div className="space-y-2">
            {keys.map(key => {
              const isActive  = key.status === 'active'
              const isPending = confirmRevoke === key.id
              const isRevoking = revoking === key.id

              return (
                <div
                  key={key.id}
                  className="g-card flex items-center gap-4 px-5 py-4 transition-opacity duration-200"
                  style={{ opacity: isActive ? 1 : 0.45 }}
                >
                  {/* Icon */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: isActive
                        ? 'rgba(22,199,132,0.08)' : 'rgba(71,85,105,0.1)',
                      border: `1px solid ${isActive
                        ? 'rgba(22,199,132,0.15)' : 'rgba(71,85,105,0.18)'}`,
                    }}
                  >
                    <Key
                      size={13}
                      style={{ color: isActive ? '#16C784' : '#475569' }}
                    />
                  </div>

                  {/* Name + prefix */}
                  <div style={{ flex: '1 1 0', minWidth: 0 }}>
                    <p className="text-sm font-semibold truncate" style={{ color: '#FFFFFF' }}>
                      {key.name}
                    </p>
                    <p className="text-xs mono truncate mt-0.5" style={{ color: '#2D4057' }}>
                      {key.key_prefix}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="hidden md:block" style={{ width: 72 }}>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full mono font-medium${isActive ? ' badge-allow' : ''}`}
                      style={isActive ? {} : {
                        background: 'rgba(71,85,105,0.12)',
                        color: '#475569',
                        border: '1px solid rgba(71,85,105,0.2)',
                      }}
                    >
                      {key.status}
                    </span>
                  </div>

                  {/* Created */}
                  <div className="hidden md:block" style={{ width: 120 }}>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>
                      {formatDate(key.created_at)}
                    </p>
                  </div>

                  {/* Last used */}
                  <div className="hidden md:block" style={{ width: 100 }}>
                    <p className="text-xs" style={{ color: key.last_used_at ? '#94A3B8' : '#2D4057' }}>
                      {key.last_used_at ? relativeTime(key.last_used_at) : '—'}
                    </p>
                  </div>

                  {/* Requests */}
                  <div className="hidden md:block mono text-right" style={{ width: 80 }}>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>
                      {(key.requests_count ?? 0).toLocaleString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center justify-end gap-2 flex-shrink-0"
                    style={{ width: 96 }}
                  >
                    {isActive && (
                      <button
                        onClick={() => initiateRevoke(key.id)}
                        disabled={isRevoking}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150"
                        style={{
                          background: isPending ? 'rgba(239,68,68,0.08)' : 'transparent',
                          border: '1px solid',
                          borderColor: isPending ? 'rgba(239,68,68,0.25)' : '#1E2D3D',
                          color: isPending ? '#EF4444' : '#475569',
                          minWidth: isPending ? 88 : 'auto',
                        }}
                        onMouseEnter={e => {
                          if (!isPending) {
                            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
                            e.currentTarget.style.color = '#EF4444'
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isPending) {
                            e.currentTarget.style.borderColor = '#1E2D3D'
                            e.currentTarget.style.color = '#475569'
                          }
                        }}
                        title={isPending ? 'Click to confirm revoke' : 'Revoke key'}
                      >
                        {isRevoking
                          ? <RefreshCw size={11} className="animate-spin" />
                          : <Trash2 size={11} />
                        }
                        {isPending && <span style={{ whiteSpace: 'nowrap' }}>Confirm?</span>}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Empty state */}
          {keys.length === 0 && (
            <div
              className="g-card p-14 text-center"
              style={{ borderStyle: 'dashed' }}
            >
              <Key size={26} className="mx-auto mb-3" style={{ color: '#1E2D3D' }} />
              <p className="text-sm font-semibold mb-1" style={{ color: '#94A3B8' }}>
                No API keys yet
              </p>
              <p className="text-xs mb-5" style={{ color: '#475569' }}>
                Create your first key to start sending events to Genuinux
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="btn-trust flex items-center gap-2 px-4 py-2 text-sm rounded-lg mx-auto"
              >
                <Plus size={13} />
                Create your first key
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Security note ────────────────────────────────────────────────────── */}
      <div
        className="mt-8 flex items-start gap-3 p-4 rounded-xl"
        style={{
          background: 'rgba(22,199,132,0.03)',
          border: '1px solid rgba(22,199,132,0.09)',
        }}
      >
        <Shield size={13} style={{ color: '#16C784', marginTop: 1, flexShrink: 0 }} />
        <div>
          <p className="text-xs font-semibold mb-0.5" style={{ color: '#16C784' }}>
            Security guidelines
          </p>
          <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
            Never expose API keys in client-side code, browser bundles, or version control.
            Use server-side environment variables only.
            Rotate immediately if compromised — revoke the old key and create a new one.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Integration section
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="mt-14">

        {/* Section header */}
        <div className="flex items-center gap-3 mb-7">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(22,199,132,0.08)',
              border: '1px solid rgba(22,199,132,0.15)',
            }}
          >
            <Terminal size={14} style={{ color: '#16C784' }} />
          </div>
          <div>
            <h2
              className="text-base font-semibold"
              style={{ fontFamily: 'Inter, sans-serif', color: '#FFFFFF' }}
            >
              Integration
            </h2>
            <p className="text-xs" style={{ color: '#475569' }}>
              One API call returns allow / review / block
            </p>
          </div>
        </div>

        {/* Endpoint */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl mb-5"
          style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}
        >
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded"
            style={{ background: 'rgba(22,199,132,0.12)', color: '#16C784' }}
          >
            POST
          </span>
          <code className="text-sm mono flex-1" style={{ color: '#E2E8F0' }}>
            https://genuinux.vercel.app/api/risk/check
          </code>
          <ChevronRight size={13} style={{ color: '#1E2D3D', flexShrink: 0 }} />
        </div>

        {/* Auth header callout */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6"
          style={{
            background: 'rgba(22,199,132,0.04)',
            border: '1px solid rgba(22,199,132,0.1)',
          }}
        >
          <Key size={12} style={{ color: '#16C784', flexShrink: 0 }} />
          <code className="text-xs mono" style={{ color: '#94A3B8' }}>
            <span style={{ color: '#475569' }}>Authorization:</span>{' '}
            Bearer <span style={{ color: '#16C784' }}>YOUR_API_KEY</span>
          </code>
        </div>

        {/* Code tabs */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid #1E2D3D' }}
        >
          {/* Tab bar + copy */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: '#07111F', borderBottom: '1px solid #1E2D3D' }}
          >
            <div className="flex items-center gap-1">
              {(['curl', 'node', 'python'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-3 py-1.5 rounded-lg text-xs mono font-medium transition-all duration-150"
                  style={tab === t ? {
                    background: '#0B1220',
                    color: '#E2E8F0',
                    border: '1px solid #1E2D3D',
                  } : {
                    background: 'transparent',
                    color: '#475569',
                    border: '1px solid transparent',
                  }}
                >
                  {t === 'node' ? 'Node.js' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={() => copyCode(tab, EXAMPLES[tab])}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150"
              style={{
                background: codeCopied === tab ? 'rgba(22,199,132,0.08)' : 'rgba(255,255,255,0.03)',
                border: '1px solid',
                borderColor: codeCopied === tab ? 'rgba(22,199,132,0.2)' : 'rgba(255,255,255,0.06)',
                color: codeCopied === tab ? '#16C784' : '#475569',
              }}
            >
              {codeCopied === tab ? <CheckCircle size={11} /> : <Copy size={11} />}
              {codeCopied === tab ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Code */}
          <pre
            className="p-5 overflow-x-auto text-xs mono leading-relaxed m-0"
            style={{ background: '#050B14', color: '#94A3B8' }}
          >
            <code>{EXAMPLES[tab]}</code>
          </pre>
        </div>

        {/* Response */}
        <div className="mt-5">
          <div
            className="flex items-center justify-between px-4 py-3 rounded-t-xl"
            style={{
              background: '#07111F',
              border: '1px solid #1E2D3D',
              borderBottom: 'none',
            }}
          >
            <div className="flex items-center gap-2">
              <Code2 size={12} style={{ color: '#475569' }} />
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#475569' }}>
                Response
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded mono"
                style={{ background: 'rgba(22,199,132,0.1)', color: '#16C784' }}
              >
                200 OK
              </span>
            </div>
            <button
              onClick={() => copyCode('response', RESPONSE_EXAMPLE)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150"
              style={{
                background: codeCopied === 'response' ? 'rgba(22,199,132,0.08)' : 'rgba(255,255,255,0.03)',
                border: '1px solid',
                borderColor: codeCopied === 'response' ? 'rgba(22,199,132,0.2)' : 'rgba(255,255,255,0.06)',
                color: codeCopied === 'response' ? '#16C784' : '#475569',
              }}
            >
              {codeCopied === 'response' ? <CheckCircle size={11} /> : <Copy size={11} />}
              {codeCopied === 'response' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre
            className="p-5 overflow-x-auto text-xs mono leading-relaxed m-0 rounded-b-xl"
            style={{ background: '#050B14', color: '#94A3B8', border: '1px solid #1E2D3D', borderTop: 'none' }}
          >
            <code>{RESPONSE_EXAMPLE}</code>
          </pre>
        </div>

        {/* Decision reference */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            {
              d: '"approve"',
              color: '#16C784',
              bg: 'rgba(22,199,132,0.05)',
              border: 'rgba(22,199,132,0.13)',
              desc: 'Low fraud risk. Allow the user to proceed without friction.',
            },
            {
              d: '"review"',
              color: '#F59E0B',
              bg: 'rgba(245,158,11,0.05)',
              border: 'rgba(245,158,11,0.13)',
              desc: 'Medium risk. Add friction (CAPTCHA, 2FA) or flag for manual review.',
            },
            {
              d: '"block"',
              color: '#EF4444',
              bg: 'rgba(239,68,68,0.05)',
              border: 'rgba(239,68,68,0.13)',
              desc: 'High fraud risk. Deny the action and show an error to the user.',
            },
          ].map(({ d, color, bg, border, desc }) => (
            <div
              key={d}
              className="p-4 rounded-xl"
              style={{ background: bg, border: `1px solid ${border}` }}
            >
              <code className="text-xs font-bold mono" style={{ color }}>{d}</code>
              <p className="text-xs leading-relaxed mt-2" style={{ color: '#475569' }}>
                {desc}
              </p>
            </div>
          ))}
        </div>

        {/* Payload fields reference */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Code2 size={13} style={{ color: '#475569' }} />
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>
              Request payload
            </p>
          </div>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid #1E2D3D' }}
          >
            {/* Header row */}
            <div
              className="grid gap-4 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: '#07111F',
                color: '#2D4057',
                gridTemplateColumns: '1fr 70px 48px 1fr',
                borderBottom: '1px solid #1E2D3D',
              }}
            >
              <div>Field</div>
              <div>Type</div>
              <div>Req.</div>
              <div>Description</div>
            </div>
            {PAYLOAD_FIELDS.map((f, i) => (
              <div
                key={f.field}
                className="grid gap-4 px-5 py-3 items-start text-xs"
                style={{
                  gridTemplateColumns: '1fr 70px 48px 1fr',
                  background: i % 2 === 0 ? '#050B14' : '#07111F',
                  borderBottom: i < PAYLOAD_FIELDS.length - 1 ? '1px solid rgba(30,45,61,0.5)' : 'none',
                }}
              >
                <code className="mono font-medium" style={{ color: '#E2E8F0' }}>{f.field}</code>
                <span className="mono" style={{ color: '#475569' }}>{f.type}</span>
                <span style={{ color: f.req ? '#16C784' : '#2D4057' }}>
                  {f.req ? 'Yes' : 'No'}
                </span>
                <span style={{ color: '#475569', lineHeight: '1.5' }}>{f.desc}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
