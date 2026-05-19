import { useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  Building2, Users, ShieldCheck, CreditCard, Lock,
  RefreshCw, Save, CheckCircle2, AlertTriangle, Info,
  Copy, Check, Cpu, Mail, Send, X,
  Clock, KeyRound, Webhook, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Organization, Profile, AuditLog } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'org' | 'team' | 'risk' | 'billing' | 'security'

interface RiskPrefs {
  medium_action:    'allow' | 'review' | 'block'
  high_action:      'review' | 'block'
  critical_action:  'review' | 'block'
  review_threshold: number
  block_threshold:  number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PREFS: RiskPrefs = {
  medium_action:    'review',
  high_action:      'review',
  critical_action:  'block',
  review_threshold: 40,
  block_threshold:  70,
}

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'org',      label: 'Organization',     icon: <Building2   size={13} /> },
  { id: 'team',     label: 'Team',             icon: <Users       size={13} /> },
  { id: 'risk',     label: 'Risk Preferences', icon: <ShieldCheck size={13} /> },
  { id: 'billing',  label: 'Billing',          icon: <CreditCard  size={13} /> },
  { id: 'security', label: 'Security',         icon: <Lock        size={13} /> },
]

const PLANS = [
  { id: 'free',       name: 'Free',       price: '$0 / mo',    highlight: false,
    features: ['10,000 events / month', '2-day event history', '1 API key', 'Core RiskScore API', 'Community support'] },
  { id: 'growth',     name: 'Growth',     price: 'Contact us', highlight: true,
    features: ['500,000 events / month', '90-day history', 'All modules', 'Webhook delivery', 'Custom rules', 'Team members (up to 25)', 'Email support'] },
  { id: 'enterprise', name: 'Enterprise', price: 'Contact sales', highlight: false,
    features: ['Unlimited events', 'Full data retention', 'Dedicated SLA & support', 'SSO & advanced audit logs', 'Custom integrations'] },
]

const ROLE_META: Record<string, { color: string; bg: string }> = {
  owner:  { color: '#16C784', bg: 'rgba(22,199,132,0.1)'  },
  admin:  { color: '#818CF8', bg: 'rgba(129,140,248,0.1)' },
  member: { color: '#94A3B8', bg: 'rgba(148,163,184,0.08)' },
}

const INDUSTRIES = [
  'Fintech', 'E-commerce', 'Gaming', 'Crypto / Web3', 'Marketplaces',
  'SaaS', 'Healthcare', 'Insurance', 'Travel', 'Other',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
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

function formatAction(action: string): string {
  const map: Record<string, string> = {
    'api_key.created':      'API key created',
    'api_key.revoked':      'API key revoked',
    'rule.created':         'Rule created',
    'rule.updated':         'Rule updated',
    'rule.deleted':         'Rule deleted',
    'review.approved':      'Event approved',
    'review.blocked':       'Event blocked',
    'review.escalated':     'Event escalated',
    'review.reopened':      'Review reopened',
    'review.note_added':    'Review note added',
    'webhook.created':      'Webhook created',
    'webhook.updated':      'Webhook updated',
    'webhook.deleted':      'Webhook deleted',
    'org.updated':          'Organization updated',
  }
  return map[action] ?? action.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' › ')
}

// ─── Primitive components ─────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94A3B8' }}>{label}</label>
      {children}
      {hint && <p className="text-[10px] mt-1.5" style={{ color: '#475569' }}>{hint}</p>}
    </div>
  )
}

function SectionCard({ title, subtitle, children, action }: {
  title: string; subtitle?: string; children: ReactNode; action?: ReactNode
}) {
  return (
    <div className="g-card p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>{title}</h3>
          {subtitle && <p className="text-xs mt-1" style={{ color: '#475569' }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function SaveBtn({ loading, saved, disabled }: { loading: boolean; saved: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity"
      style={{
        background: saved ? 'rgba(22,199,132,0.15)' : '#16C784',
        color: saved ? '#16C784' : '#050B14',
        opacity: disabled ? 0.4 : 1,
        border: saved ? '1px solid rgba(22,199,132,0.3)' : 'none',
      }}
    >
      {loading ? <RefreshCw size={13} className="animate-spin" /> :
       saved   ? <CheckCircle2 size={13} /> : <Save size={13} />}
      {saved ? 'Saved' : 'Save changes'}
    </button>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors"
      style={{ border: '1px solid #1E2D3D', color: copied ? '#16C784' : '#475569' }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-lg"
      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}
    >
      <Info size={13} style={{ color: '#818CF8', flexShrink: 0, marginTop: 1 }} />
      <p className="text-xs" style={{ color: '#94A3B8' }}>{children}</p>
    </div>
  )
}

// ─── Tab: Organization ────────────────────────────────────────────────────────

function OrgTab({
  org, isOwner, onSaved,
}: {
  org: Organization
  isOwner: boolean
  onSaved: (o: Organization) => void
}) {
  const { user } = useAuth()
  const [name,     setName]     = useState(org.name)
  const [website,  setWebsite]  = useState(org.website   ?? '')
  const [industry, setIndustry] = useState(org.industry  ?? '')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [errMsg,   setErrMsg]   = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isOwner || !name.trim()) return
    setSaving(true); setErrMsg(null)
    const { data, error } = await supabase
      .from('organizations')
      .update({ name: name.trim(), website: website.trim() || null, industry: industry.trim() || null })
      .eq('id', org.id)
      .select()
      .single()
    setSaving(false)
    if (error) { setErrMsg(error.message); return }
    void supabase.from('audit_logs').insert({
      organization_id: org.id,
      user_id: user?.id ?? null,
      action: 'org.updated',
      metadata_json: { name: name.trim(), website: website.trim() || null, industry: industry.trim() || null },
    })
    setSaved(true)
    onSaved(data as Organization)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <SectionCard
        title="Organization Details"
        subtitle="Basic information visible to your team and in API responses."
      >
        <div className="space-y-4">
          <Field label="Organization name *">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Acme Corp"
              disabled={!isOwner}
              className="g-input text-sm w-full"
              style={{ opacity: isOwner ? 1 : 0.6 }}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Website" hint="Used for reference only.">
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://example.com"
                disabled={!isOwner}
                className="g-input text-sm w-full"
                style={{ opacity: isOwner ? 1 : 0.6 }}
              />
            </Field>
            <Field label="Industry">
              <select
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                disabled={!isOwner}
                className="g-input text-sm w-full"
                style={{ opacity: isOwner ? 1 : 0.6 }}
              >
                <option value="">Select industry…</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
          </div>
        </div>
        {errMsg && (
          <p className="text-xs mt-3" style={{ color: '#EF4444' }}>{errMsg}</p>
        )}
        {!isOwner && (
          <p className="text-xs mt-3" style={{ color: '#475569' }}>
            Only the organization owner can edit these settings.
          </p>
        )}
      </SectionCard>

      {/* Read-only info */}
      <SectionCard title="Organization Info">
        <div className="space-y-3">
          {[
            { label: 'Organization ID', value: org.id, copy: true },
            { label: 'Plan',            value: org.plan.toUpperCase() },
            { label: 'Member since',    value: formatTs(org.created_at) },
          ].map(({ label, value, copy }) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <span className="text-xs" style={{ color: '#475569' }}>{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs mono" style={{ color: '#94A3B8' }}>{value}</span>
                {copy && <CopyButton text={value} />}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {isOwner && (
        <div className="flex justify-end">
          <SaveBtn loading={saving} saved={saved} disabled={!name.trim()} />
        </div>
      )}
    </form>
  )
}

// ─── Tab: Team ────────────────────────────────────────────────────────────────

const INVITE_MIGRATION_SQL = `-- Run in Supabase SQL editor (Settings → Team requires this table)
CREATE TABLE IF NOT EXISTS pending_invites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email            text NOT NULL,
  role             text NOT NULL DEFAULT 'member',
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS pending_invites_org  ON pending_invites (organization_id);
CREATE INDEX IF NOT EXISTS pending_invites_email ON pending_invites (email);`

function TeamTab({ members, currentProfile }: { members: Profile[]; currentProfile: Profile | null }) {
  const { session } = useAuth()
  const [showInvite,   setShowInvite]   = useState(false)
  const [showMigration, setShowMigration] = useState(false)
  const [invEmail,     setInvEmail]     = useState('')
  const [invRole,      setInvRole]      = useState<'admin' | 'member'>('member')
  const [invLoading,   setInvLoading]   = useState(false)
  const [invSuccess,   setInvSuccess]   = useState(false)
  const [invError,     setInvError]     = useState<string | null>(null)

  const isOwnerOrAdmin = currentProfile?.role === 'owner' || currentProfile?.role === 'admin'

  const sorted = [...members].sort((a, b) => {
    const order = { owner: 0, admin: 1, member: 2 }
    return (order[a.role] ?? 3) - (order[b.role] ?? 3)
  })

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.access_token) return
    setInvLoading(true); setInvError(null)

    const res = await fetch('/api/team/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email: invEmail, role: invRole }),
    })
    const json = await res.json() as { success?: boolean; error?: string; code?: string }
    setInvLoading(false)

    if (!res.ok) {
      if (json.code === 'TABLE_MISSING') setShowMigration(true)
      setInvError(json.error ?? 'Failed to send invite.')
      return
    }
    setInvSuccess(true)
    setInvEmail('')
    setTimeout(() => { setInvSuccess(false); setShowInvite(false) }, 2500)
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Team Members"
        subtitle={`${members.length} member${members.length !== 1 ? 's' : ''} in this organization`}
        action={
          isOwnerOrAdmin ? (
            <button
              onClick={() => { setShowInvite(true); setInvError(null); setInvSuccess(false) }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ border: '1px solid #1E2D3D', color: '#94A3B8' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#16C784')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}
            >
              <Mail size={11} />
              Invite member
            </button>
          ) : undefined
        }
      >
        <div className="overflow-x-auto -mx-6">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #1E2D3D' }}>
                {['Member', 'Role', 'Joined'].map(h => (
                  <th key={h} className="px-6 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: '#2D4057' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => {
                const meta = ROLE_META[m.role] ?? ROLE_META.member
                const isMe = m.user_id === currentProfile?.user_id
                return (
                  <tr
                    key={m.id}
                    style={{ borderBottom: i < sorted.length - 1 ? '1px solid #0D1B2A' : 'none' }}
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {(m.full_name ?? m.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#E2E8F0' }}>
                            {m.full_name ?? '—'}
                            {isMe && (
                              <span className="ml-2 text-[10px] mono px-1.5 py-0.5 rounded"
                                style={{ background: '#0B1220', color: '#475569', border: '1px solid #1E2D3D' }}>
                                you
                              </span>
                            )}
                          </p>
                          <p className="text-xs" style={{ color: '#475569' }}>{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="text-xs mono" style={{ color: '#94A3B8' }}>{formatTs(m.created_at)}</p>
                      <p className="text-[10px] mono mt-0.5" style={{ color: '#2D4057' }}>{relativeTime(m.created_at)}</p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Role reference */}
      <SectionCard title="Role Permissions" subtitle="What each role can do in the dashboard.">
        <div className="space-y-2.5">
          {[
            { role: 'owner',  perms: 'Full access — manage API keys, webhooks, billing, team, and all settings.' },
            { role: 'admin',  perms: 'Manage rules, review queue, events. Cannot manage API keys or billing.' },
            { role: 'member', perms: 'Read-only access to events, queue, and reports.' },
          ].map(({ role, perms }) => {
            const meta = ROLE_META[role]
            return (
              <div key={role} className="flex items-start gap-3 px-4 py-3 rounded-lg"
                style={{ background: '#050B14', border: '1px solid #1E2D3D' }}>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 mt-0.5"
                  style={{ background: meta.bg, color: meta.color }}>
                  {role}
                </span>
                <p className="text-xs" style={{ color: '#475569' }}>{perms}</p>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* DB migration hint */}
      <div className="g-card overflow-hidden" style={{ border: '1px solid #1E2D3D' }}>
        <button
          onClick={() => setShowMigration(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2">
            <Info size={12} style={{ color: '#475569' }} />
            <span className="text-xs font-semibold" style={{ color: '#475569' }}>
              Required: pending_invites DB migration
            </span>
          </div>
          {showMigration
            ? <ChevronUp size={12} style={{ color: '#475569' }} />
            : <ChevronDown size={12} style={{ color: '#475569' }} />}
        </button>
        {showMigration && (
          <div className="px-5 pb-5">
            <p className="text-xs mb-3" style={{ color: '#475569' }}>
              Run once in your Supabase SQL editor to enable team invites:
            </p>
            <div className="relative">
              <pre className="text-[11px] mono leading-relaxed p-4 rounded-lg overflow-x-auto"
                style={{ background: '#050B14', color: '#94A3B8', border: '1px solid #1E2D3D' }}>
                {INVITE_MIGRATION_SQL}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={INVITE_MIGRATION_SQL} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <>
          <div className="fixed inset-0 z-40"
            style={{ background: 'rgba(5,11,20,0.7)', backdropFilter: 'blur(3px)' }}
            onClick={() => setShowInvite(false)}
          />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-xl p-6 w-full max-w-md"
            style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.2)' }}>
                  <Mail size={14} style={{ color: '#16C784' }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>Invite team member</h3>
                  <p className="text-xs" style={{ color: '#475569' }}>They'll receive an email to join your org</p>
                </div>
              </div>
              <button onClick={() => setShowInvite(false)} style={{ color: '#475569' }}>
                <X size={16} />
              </button>
            </div>

            {invSuccess ? (
              <div className="flex items-center gap-3 px-4 py-4 rounded-lg"
                style={{ background: 'rgba(22,199,132,0.06)', border: '1px solid rgba(22,199,132,0.2)' }}>
                <CheckCircle2 size={14} style={{ color: '#16C784' }} />
                <p className="text-sm" style={{ color: '#16C784' }}>Invite sent!</p>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94A3B8' }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={invEmail}
                    onChange={e => setInvEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    required
                    className="g-input text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94A3B8' }}>
                    Role
                  </label>
                  <select
                    value={invRole}
                    onChange={e => setInvRole(e.target.value as 'admin' | 'member')}
                    className="g-input text-sm w-full"
                  >
                    <option value="member">Member — read-only access</option>
                    <option value="admin">Admin — manage rules and queue</option>
                  </select>
                </div>

                {invError && (
                  <p className="text-xs px-3 py-2.5 rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.06)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                    {invError}
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowInvite(false)}
                    className="flex-1 py-2 rounded-lg text-sm"
                    style={{ background: '#0F1929', color: '#94A3B8', border: '1px solid #1E2D3D' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={invLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: '#16C784', color: '#050B14' }}
                  >
                    {invLoading
                      ? <RefreshCw size={13} className="animate-spin" />
                      : <Send size={13} />}
                    Send invite
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab: Risk Preferences ────────────────────────────────────────────────────

function RiskTab({ prefs, orgId, isOwner }: { prefs: RiskPrefs; orgId: string; isOwner: boolean }) {
  const [local,   setLocal]   = useState<RiskPrefs>(prefs)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [errMsg,  setErrMsg]  = useState<string | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)

  const set = <K extends keyof RiskPrefs>(key: K, val: RiskPrefs[K]) =>
    setLocal(p => ({ ...p, [key]: val }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isOwner) return
    setSaving(true); setErrMsg(null); setNeedsMigration(false)

    const { error } = await supabase
      .from('organizations')
      .update({ settings_json: local } as Record<string, unknown>)
      .eq('id', orgId)

    setSaving(false)
    if (error) {
      if (error.code === '42703' || error.message.includes('settings_json')) {
        setNeedsMigration(true)
      } else {
        setErrMsg(error.message)
      }
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const actionOpts: { value: string; label: string }[] = [
    { value: 'allow',  label: 'Allow — approve automatically' },
    { value: 'review', label: 'Review — flag for manual review' },
    { value: 'block',  label: 'Block — reject automatically'  },
  ]
  const strictOpts = actionOpts.filter(o => o.value !== 'allow')

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <InfoBanner>
        These preferences are saved to your organization and will be applied by the risk engine
        on the next deployment. Currently the engine uses its built-in thresholds as defaults.
      </InfoBanner>

      <SectionCard title="Default Actions" subtitle="What decision to take when an event falls into each risk level.">
        <div className="space-y-4">
          {[
            { key: 'medium_action'   as const, label: 'Medium risk',   opts: actionOpts },
            { key: 'high_action'     as const, label: 'High risk',     opts: strictOpts },
            { key: 'critical_action' as const, label: 'Critical risk', opts: strictOpts },
          ].map(({ key, label, opts }) => (
            <div key={key} className="flex items-center justify-between gap-6">
              <div>
                <p className="text-sm font-medium" style={{ color: '#E2E8F0' }}>{label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#475569' }}>
                  {key === 'medium_action'   && 'Fraud score 26–55'}
                  {key === 'high_action'     && 'Fraud score 56–80'}
                  {key === 'critical_action' && 'Fraud score 81–100'}
                </p>
              </div>
              <select
                value={local[key]}
                onChange={e => set(key, e.target.value as RiskPrefs[typeof key])}
                disabled={!isOwner}
                className="g-input text-xs"
                style={{ width: 240, opacity: isOwner ? 1 : 0.6 }}
              >
                {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Score Thresholds"
        subtitle="Fraud score cutoffs that trigger review or block decisions."
      >
        <div className="space-y-6">
          {[
            { key: 'review_threshold' as const, label: 'Review threshold', color: '#F59E0B',
              hint: 'Events with fraud score ≥ this value are flagged for manual review.' },
            { key: 'block_threshold'  as const, label: 'Block threshold',  color: '#EF4444',
              hint: 'Events with fraud score ≥ this value are automatically blocked.' },
          ].map(({ key, label, color, hint }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold" style={{ color: '#94A3B8' }}>{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0} max={100}
                    value={local[key]}
                    onChange={e => set(key, Math.min(100, Math.max(0, Number(e.target.value))))}
                    disabled={!isOwner}
                    className="g-input text-sm mono text-center"
                    style={{ width: 60, opacity: isOwner ? 1 : 0.6 }}
                  />
                  <span className="text-xs mono" style={{ color: '#475569' }}>/ 100</span>
                </div>
              </div>
              <div className="relative" style={{ height: 6, borderRadius: 3, background: '#1E2D3D' }}>
                <div
                  className="absolute top-0 left-0 h-full rounded-full"
                  style={{ width: `${local[key]}%`, background: color, transition: 'width 0.2s' }}
                />
                <input
                  type="range"
                  min={0} max={100}
                  value={local[key]}
                  onChange={e => set(key, Number(e.target.value))}
                  disabled={!isOwner}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  style={{ height: 6 }}
                />
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: '#475569' }}>{hint}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {needsMigration && (
        <div className="g-card p-5 space-y-3"
          style={{ border: '1px solid rgba(245,158,11,0.3)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} style={{ color: '#F59E0B' }} />
            <p className="text-sm font-semibold" style={{ color: '#F59E0B' }}>Database migration required</p>
          </div>
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            Run the following SQL in your Supabase SQL editor to enable risk preference storage:
          </p>
          <pre className="text-xs mono p-3 rounded-lg overflow-x-auto"
            style={{ background: '#050B14', color: '#16C784', border: '1px solid #1E2D3D' }}>
            {`ALTER TABLE organizations\n  ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}';`}
          </pre>
        </div>
      )}

      {errMsg && <p className="text-xs" style={{ color: '#EF4444' }}>{errMsg}</p>}

      {!isOwner && (
        <p className="text-xs" style={{ color: '#475569' }}>
          Only the organization owner can modify risk preferences.
        </p>
      )}

      {isOwner && (
        <div className="flex justify-end">
          <SaveBtn loading={saving} saved={saved} />
        </div>
      )}
    </form>
  )
}

// ─── Tab: Billing ─────────────────────────────────────────────────────────────

const STRIPE_MIGRATION_SQL = `-- Run in Supabase SQL editor to enable Stripe billing
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;`

function BillingTab({ plan }: { plan: string; orgId: string }) {
  const { session } = useAuth()
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [showStripeMigration, setShowStripeMigration] = useState(false)

  const handleUpgrade = async (planId: string) => {
    if (!session?.access_token) return
    setUpgrading(planId); setBillingError(null)

    const res  = await fetch('/api/billing/checkout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body:    JSON.stringify({ plan: planId }),
    })
    const json = await res.json() as { url?: string; error?: string; code?: string }
    setUpgrading(null)

    if (!res.ok) {
      setBillingError(json.error ?? 'Checkout failed.')
      return
    }
    if (json.url) window.location.href = json.url
  }

  const handlePortal = async () => {
    if (!session?.access_token) return
    setPortalLoading(true); setBillingError(null)

    const res  = await fetch('/api/billing/portal', {
      method:  'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const json = await res.json() as { url?: string; error?: string }
    setPortalLoading(false)

    if (!res.ok) { setBillingError(json.error ?? 'Portal failed.'); return }
    if (json.url) window.location.href = json.url
  }

  const isPaid = plan !== 'free'

  return (
    <div className="space-y-5">
      <SectionCard
        title="Current Plan"
        action={
          isPaid ? (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ border: '1px solid #1E2D3D', color: '#94A3B8' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#16C784')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}
            >
              {portalLoading
                ? <RefreshCw size={11} className="animate-spin" />
                : <ExternalLink size={11} />}
              Manage subscription
            </button>
          ) : undefined
        }
      >
        <div className="flex items-center gap-4">
          <span
            className="text-sm font-bold px-3 py-1.5 rounded-lg"
            style={{
              background: 'rgba(22,199,132,0.1)',
              color: '#16C784',
              border: '1px solid rgba(22,199,132,0.2)',
            }}
          >
            {plan.toUpperCase()}
          </span>
          <p className="text-xs" style={{ color: '#475569' }}>
            {isPaid
              ? `Active ${plan} subscription. Manage invoices and payment methods via the Stripe portal.`
              : `You're on the free plan. Upgrade to unlock higher limits and additional features.`}
          </p>
        </div>
      </SectionCard>

      <div className="grid grid-cols-3 gap-3">
        {PLANS.map(p => {
          const isCurrent   = p.id === plan
          const isUpgrading = upgrading === p.id
          const isContact   = p.id === 'growth' || p.id === 'enterprise'

          return (
            <div
              key={p.id}
              className="rounded-xl p-5 flex flex-col gap-4 transition-colors"
              style={{
                background: isCurrent ? 'rgba(22,199,132,0.05)' : '#0B1220',
                border: isCurrent
                  ? '1px solid rgba(22,199,132,0.3)'
                  : p.highlight
                  ? '1px solid rgba(99,102,241,0.3)'
                  : '1px solid #1E2D3D',
              }}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold" style={{ color: '#E2E8F0' }}>{p.name}</span>
                  {isCurrent && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(22,199,132,0.15)', color: '#16C784' }}>
                      current
                    </span>
                  )}
                  {p.highlight && !isCurrent && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(99,102,241,0.15)', color: '#818CF8' }}>
                      popular
                    </span>
                  )}
                </div>
                <p className="text-lg font-bold mono" style={{ color: isCurrent ? '#16C784' : '#E2E8F0' }}>
                  {p.price}
                </p>
              </div>
              <ul className="space-y-1.5 flex-1">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-[11px]" style={{ color: '#94A3B8' }}>
                    <CheckCircle2 size={11} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button disabled
                  className="w-full py-2 rounded-lg text-xs font-semibold"
                  style={{ background: '#0F1929', color: '#475569', border: '1px solid #1E2D3D', opacity: 0.7 }}>
                  Current plan
                </button>
              ) : isContact ? (
                <a href="mailto:sales@genuinux.io"
                  className="w-full flex items-center justify-center py-2 rounded-lg text-xs font-semibold"
                  style={{ background: '#0F1929', color: '#94A3B8', border: '1px solid #1E2D3D' }}>
                  Contact us
                </a>
              ) : (
                <button
                  disabled={isUpgrading}
                  onClick={() => handleUpgrade(p.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: '#16C784', color: '#050B14' }}
                >
                  {isUpgrading && <RefreshCw size={11} className="animate-spin" />}
                  Upgrade
                </button>
              )}
            </div>
          )
        })}
      </div>

      {billingError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle size={13} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-xs" style={{ color: '#EF4444' }}>{billingError}</p>
            {billingError.includes('STRIPE_NOT_CONFIGURED') && (
              <p className="text-[11px] mt-1" style={{ color: '#475569' }}>
                Add <span className="mono" style={{ color: '#94A3B8' }}>STRIPE_SECRET_KEY</span>,{' '}
                <span className="mono" style={{ color: '#94A3B8' }}>STRIPE_PRICE_STARTER</span>, and{' '}
                <span className="mono" style={{ color: '#94A3B8' }}>STRIPE_PRICE_PRO</span>{' '}
                to your Vercel environment variables to enable billing.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stripe DB migration */}
      <div className="g-card overflow-hidden" style={{ border: '1px solid #1E2D3D' }}>
        <button
          onClick={() => setShowStripeMigration(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2">
            <Info size={12} style={{ color: '#475569' }} />
            <span className="text-xs font-semibold" style={{ color: '#475569' }}>
              Required: Stripe DB migration
            </span>
          </div>
          {showStripeMigration
            ? <ChevronUp size={12} style={{ color: '#475569' }} />
            : <ChevronDown size={12} style={{ color: '#475569' }} />}
        </button>
        {showStripeMigration && (
          <div className="px-5 pb-5">
            <p className="text-xs mb-3" style={{ color: '#475569' }}>
              Run once in your Supabase SQL editor to store Stripe customer IDs:
            </p>
            <div className="relative">
              <pre className="text-[11px] mono p-4 rounded-lg overflow-x-auto"
                style={{ background: '#050B14', color: '#94A3B8', border: '1px solid #1E2D3D' }}>
                {STRIPE_MIGRATION_SQL}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={STRIPE_MIGRATION_SQL} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-3 px-5 py-4 rounded-xl"
        style={{ background: '#0B1220', border: '1px solid #1E2D3D' }}
      >
        <CreditCard size={16} style={{ color: '#475569', flexShrink: 0 }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: '#94A3B8' }}>Enterprise & custom pricing</p>
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
            Need a custom volume deal, SLA guarantee, or dedicated support? Contact{' '}
            <a href="mailto:billing@genuinux.io" style={{ color: '#16C784' }}>billing@genuinux.io</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Security ────────────────────────────────────────────────────────────

function SecurityTab({ auditLogs }: { auditLogs: AuditLog[] }) {
  const verifySnippet = `const crypto = require('crypto')

function verifyWebhook(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  )
}

// In your Express handler:
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-genuinux-signature']
  if (!verifyWebhook(req.body, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature')
  }
  // Process event...
  res.json({ received: true })
})`

  return (
    <div className="space-y-5">
      {/* Audit log */}
      <SectionCard
        title="Audit Log"
        subtitle="Recent actions performed by team members in this organization."
      >
        {auditLogs.length === 0 ? (
          <div className="py-8 text-center">
            <Clock size={20} className="mx-auto mb-2" style={{ color: '#1E2D3D' }} />
            <p className="text-sm" style={{ color: '#475569' }}>No audit events recorded yet.</p>
            <p className="text-xs mt-1" style={{ color: '#2D4057' }}>
              Actions like creating API keys, managing rules, and reviewing events will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #1E2D3D' }}>
                  {['Action', 'User', 'When'].map(h => (
                    <th key={h} className="px-6 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: '#2D4057' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log, i) => (
                  <tr
                    key={log.id}
                    style={{ borderBottom: i < auditLogs.length - 1 ? '1px solid #0D1B2A' : 'none' }}
                  >
                    <td className="px-6 py-3">
                      <p className="text-xs font-medium" style={{ color: '#94A3B8' }}>
                        {formatAction(log.action)}
                      </p>
                      {log.metadata_json && Object.keys(log.metadata_json).length > 0 && (
                        <p className="text-[10px] mono mt-0.5" style={{ color: '#2D4057' }}>
                          {JSON.stringify(log.metadata_json).slice(0, 60)}
                          {JSON.stringify(log.metadata_json).length > 60 ? '…' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-[10px] mono" style={{ color: '#475569' }}>
                        {log.user_id ? log.user_id.slice(0, 8) + '…' : '—'}
                      </p>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <p className="text-[10px] mono" style={{ color: '#94A3B8' }}>{formatTs(log.created_at)}</p>
                      <p className="text-[10px] mono mt-0.5" style={{ color: '#2D4057' }}>{relativeTime(log.created_at)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* API key security */}
      <SectionCard title="API Key Security" subtitle="How Genuinux protects your API keys.">
        <div className="space-y-3">
          {[
            { icon: <KeyRound size={13} />, title: 'SHA-256 hashing',
              desc: 'API keys are never stored in plaintext. Only a SHA-256 hash is persisted in the database. The full key is shown once at creation and cannot be recovered.' },
            { icon: <Cpu size={13} />,  title: 'Prefix-based lookup',
              desc: 'Each key has a prefix (e.g. gnx_live_K9x2m) to identify it in logs without exposing the full key.' },
            { icon: <Lock size={13} />, title: 'Revocation',
              desc: 'Keys can be revoked instantly from the API Keys page. Revoked keys return 401 on all subsequent requests.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 px-4 py-3 rounded-lg"
              style={{ background: '#050B14', border: '1px solid #1E2D3D' }}>
              <span style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: '#E2E8F0' }}>{title}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: '#475569' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Webhook security */}
      <SectionCard
        title="Webhook Security"
        subtitle="All outbound webhook payloads are signed with HMAC-SHA256."
        action={<CopyButton text={verifySnippet} />}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg"
            style={{ background: '#050B14', border: '1px solid #1E2D3D' }}>
            <Webhook size={13} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
            <div className="space-y-1">
              <p className="text-xs font-semibold" style={{ color: '#E2E8F0' }}>Signature header</p>
              <p className="text-[11px] leading-relaxed" style={{ color: '#475569' }}>
                Every request includes <span className="mono" style={{ color: '#94A3B8' }}>X-Genuinux-Signature: sha256=&lt;hex&gt;</span>.
                Verify it using your webhook secret to ensure the payload was not tampered with.
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>Node.js verification example</p>
            <pre
              className="text-[10px] mono leading-relaxed rounded-lg overflow-x-auto p-4"
              style={{ background: '#050B14', color: '#94A3B8', border: '1px solid #1E2D3D' }}
            >
              {verifySnippet}
            </pre>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth()
  const [tab,       setTab]       = useState<TabId>('org')
  const [org,       setOrg]       = useState<Organization | null>(null)
  const [profile,   setProfile]   = useState<Profile | null>(null)
  const [members,   setMembers]   = useState<Profile[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [riskPrefs, setRiskPrefs] = useState<RiskPrefs>(DEFAULT_PREFS)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!profileData?.organization_id) {
      setError('No organization linked to this account.')
      setLoading(false)
      return
    }

    setProfile(profileData as Profile)
    const orgId = profileData.organization_id as string

    const [orgRes, membersRes, logsRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).single(),
      supabase.from('profiles').select('*').eq('organization_id', orgId),
      supabase
        .from('audit_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (orgRes.data) {
      setOrg(orgRes.data as Organization)
      const raw = (orgRes.data as Record<string, unknown>)['settings_json']
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        setRiskPrefs(prev => ({ ...prev, ...(raw as Partial<RiskPrefs>) }))
      }
    }

    if (membersRes.data) setMembers(membersRes.data as Profile[])
    if (logsRes.data)    setAuditLogs(logsRes.data as AuditLog[])

    setLoading(false)
  }, [user])

  useEffect(() => { void loadAll() }, [loadAll])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: '#475569' }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading settings…</span>
    </div>
  )

  if (error || !org || !profile) return (
    <div className="p-8">
      <div className="g-card p-5 text-sm" style={{ color: '#EF4444' }}>
        {error ?? 'Failed to load settings.'}
      </div>
    </div>
  )

  const isOwner = profile.role === 'owner'

  return (
    <div className="p-7 max-w-4xl">

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: '#E2E8F0' }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: '#475569' }}>
          Manage your organization, team, and risk configuration.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 flex-wrap" style={{ borderBottom: '1px solid #1E2D3D', paddingBottom: 0 }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors relative"
              style={{
                color: active ? '#E2E8F0' : '#475569',
                borderBottom: active ? '2px solid #16C784' : '2px solid transparent',
                marginBottom: -1,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#94A3B8' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#475569' }}
            >
              <span style={{ color: active ? '#16C784' : 'inherit' }}>{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Section content */}
      {tab === 'org' && (
        <OrgTab org={org} isOwner={isOwner} onSaved={setOrg} />
      )}
      {tab === 'team' && (
        <TeamTab members={members} currentProfile={profile} />
      )}
      {tab === 'risk' && (
        <RiskTab prefs={riskPrefs} orgId={org.id} isOwner={isOwner} />
      )}
      {tab === 'billing' && (
        <BillingTab plan={org.plan} orgId={org.id} />
      )}
      {tab === 'security' && (
        <SecurityTab auditLogs={auditLogs} />
      )}
    </div>
  )
}
