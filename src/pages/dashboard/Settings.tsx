import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Building2, Users, ShieldCheck, CreditCard, Lock,
  RefreshCw, Save, CheckCircle2, AlertTriangle, Info,
  Copy, Check, Cpu, Mail, Send, X, Trash2, Pencil,
  Clock, KeyRound, Webhook, ExternalLink, ChevronDown, ChevronUp,
  ClipboardList, Eye,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can, ROLE_META, ROLE_ORDER, ASSIGNABLE_ROLES, ADMIN_ASSIGNABLE_ROLES } from '../../lib/permissions'
import type { Role } from '../../lib/permissions'
import type { Organization, Profile, AuditLog } from '../../types'
import { useT } from '../../lib/themeTokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'org' | 'team' | 'risk' | 'billing' | 'security' | 'audit'
type AuditCategory = 'all' | 'auth' | 'api_key' | 'rule' | 'webhook' | 'review' | 'org'
type AuditDateRange = 'today' | '7d' | '30d' | 'all'

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
  { id: 'org',      label: 'Organization',     icon: <Building2    size={13} /> },
  { id: 'team',     label: 'Team',             icon: <Users        size={13} /> },
  { id: 'risk',     label: 'Risk Preferences', icon: <ShieldCheck  size={13} /> },
  { id: 'billing',  label: 'Billing',          icon: <CreditCard   size={13} /> },
  { id: 'security', label: 'Security',         icon: <Lock         size={13} /> },
  { id: 'audit',    label: 'Audit Logs',       icon: <ClipboardList size={13} /> },
]

const AUDIT_CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'auth',     label: 'Auth' },
  { id: 'api_key',  label: 'API Keys' },
  { id: 'rule',     label: 'Rules' },
  { id: 'webhook',  label: 'Webhooks' },
  { id: 'review',   label: 'Review Queue' },
  { id: 'org',      label: 'Organization' },
]

const DATE_RANGES: { id: AuditDateRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d',    label: 'Last 7 days' },
  { id: '30d',   label: 'Last 30 days' },
  { id: 'all',   label: 'All time' },
]

const PLANS = [
  { id: 'free',       name: 'Free',       price: '$0 / mo',    highlight: false,
    features: ['10,000 events / month', '2-day event history', '1 API key', 'Core RiskScore API', 'Community support'] },
  { id: 'growth',     name: 'Growth',     price: 'Contact us', highlight: true,
    features: ['500,000 events / month', '90-day history', 'All modules', 'Webhook delivery', 'Custom rules', 'Team members (up to 25)', 'Email support'] },
  { id: 'enterprise', name: 'Enterprise', price: 'Contact sales', highlight: false,
    features: ['Unlimited events', 'Full data retention', 'Dedicated SLA & support', 'SSO & advanced audit logs', 'Custom integrations'] },
]

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
    'auth.login':           'Signed in',
    'auth.logout':          'Signed out',
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
    'member.role_changed':  'Member role changed',
    'member.removed':       'Member removed',
    'member.invited':       'Member invited',
  }
  return map[action] ?? action.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' › ')
}

function getActionIcon(action: string): ReactNode {
  if (action.startsWith('auth.'))    return <Lock size={11} />
  if (action.startsWith('api_key.')) return <KeyRound size={11} />
  if (action.startsWith('rule.'))    return <ShieldCheck size={11} />
  if (action.startsWith('webhook.')) return <Webhook size={11} />
  if (action.startsWith('review.'))  return <CheckCircle2 size={11} />
  if (action.startsWith('org.'))     return <Building2 size={11} />
  if (action.startsWith('member.'))  return <Users size={11} />
  return <Clock size={11} />
}

function getActionColor(action: string): string {
  if (action.startsWith('auth.'))    return '#818CF8'
  if (action.startsWith('api_key.')) return '#16C784'
  if (action.startsWith('rule.'))    return '#F59E0B'
  if (action.startsWith('webhook.')) return '#38BDF8'
  if (action.startsWith('review.'))  return '#A78BFA'
  if (action.startsWith('org.'))     return '#94A3B8'
  if (action.startsWith('member.'))  return '#38BDF8'
  return '#475569'
}

function getTargetFromMetadata(log: AuditLog): string {
  const m = log.metadata_json
  if (!m) return ''
  if (m.key_name)        return `key · ${String(m.key_name)}`
  if (m.name && m.rule_id) return `rule · ${String(m.name)}`
  if (m.endpoint_url)    return `${String(m.endpoint_url).replace(/^https?:\/\//, '').slice(0, 40)}`
  if (m.risk_event_id)   return `event · ${String(m.risk_event_id).slice(0, 8)}…`
  if (m.queue_item_id)   return `queue · ${String(m.queue_item_id).slice(0, 8)}…`
  if (m.external_user_id) return `user · ${String(m.external_user_id)}`
  return ''
}

// ─── Primitive components ─────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const T = useT()
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: T.textSec }}>{label}</label>
      {children}
      {hint && <p className="text-[10px] mt-1.5" style={{ color: T.textDim }}>{hint}</p>}
    </div>
  )
}

function SectionCard({ title, subtitle, children, action }: {
  title: string; subtitle?: string; children: ReactNode; action?: ReactNode
}) {
  const T = useT()
  return (
    <div className="g-card p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: T.text }}>{title}</h3>
          {subtitle && <p className="text-xs mt-1" style={{ color: T.textDim }}>{subtitle}</p>}
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
  const T = useT()
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
      style={{ border: `1px solid ${T.border}`, color: copied ? '#16C784' : T.textDim }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function InfoBanner({ children }: { children: ReactNode }) {
  const T = useT()
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-lg"
      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}
    >
      <Info size={13} style={{ color: '#818CF8', flexShrink: 0, marginTop: 1 }} />
      <p className="text-xs" style={{ color: T.textSec }}>{children}</p>
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
  const T = useT()
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
          <p className="text-xs mt-3" style={{ color: T.textDim }}>
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
              <span className="text-xs" style={{ color: T.textDim }}>{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs mono" style={{ color: T.textSec }}>{value}</span>
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
  role             text NOT NULL DEFAULT 'analyst',
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS pending_invites_org   ON pending_invites (organization_id);
CREATE INDEX IF NOT EXISTS pending_invites_email ON pending_invites (email);
ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_invites"  ON pending_invites FOR SELECT
  USING (organization_id = current_org_id());
CREATE POLICY "org_admins_manage_invites" ON pending_invites FOR ALL
  USING (organization_id = current_org_id() AND current_user_role() IN ('owner', 'admin'))
  WITH CHECK (organization_id = current_org_id() AND current_user_role() IN ('owner', 'admin'));`

const ROLE_PERMS = [
  { role: 'owner',   perms: ['Full access', 'Manage billing', 'Create/revoke API keys', 'Manage members', 'Edit settings'] },
  { role: 'admin',   perms: ['Manage rules', 'Manage webhooks', 'Review events', 'View all dashboard'] },
  { role: 'analyst', perms: ['View risk events', 'Act on review queue', 'Add notes', 'Submit feedback'] },
  { role: 'viewer',  perms: ['View dashboard', 'View risk events (read-only)'] },
]

function TeamTab({ members, currentProfile, onMembersChange }: {
  members: Profile[]
  currentProfile: Profile | null
  onMembersChange: (m: Profile[]) => void
}) {
  const T = useT()
  const { session } = useAuth()
  const [showInvite,    setShowInvite]    = useState(false)
  const [showMigration, setShowMigration] = useState(false)
  const [invEmail,      setInvEmail]      = useState('')
  const [invRole,       setInvRole]       = useState<Role>('analyst')
  const [invLoading,    setInvLoading]    = useState(false)
  const [invSuccess,    setInvSuccess]    = useState(false)
  const [invError,      setInvError]      = useState<string | null>(null)
  const [editingRole,   setEditingRole]   = useState<string | null>(null)  // profile.id
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)  // profile.id
  const [actionLoading, setActionLoading] = useState<string | null>(null)  // profile.id

  const myRole  = currentProfile?.role ?? 'viewer'
  const isOwner = myRole === 'owner'
  const isAdmin = myRole === 'admin'

  const canChangeRole = (target: Profile) => {
    if (target.user_id === currentProfile?.user_id) return false
    if (isOwner) return target.role !== 'owner'
    if (isAdmin) return target.role !== 'owner' && target.role !== 'admin'
    return false
  }

  const canRemove = (target: Profile) => {
    if (target.user_id === currentProfile?.user_id) return false
    if (isOwner) return target.role !== 'owner'
    if (isAdmin) return target.role !== 'owner' && target.role !== 'admin'
    return false
  }

  const assignableRoles = isOwner ? ASSIGNABLE_ROLES : ADMIN_ASSIGNABLE_ROLES

  const sorted = [...members].sort((a, b) => (ROLE_ORDER[a.role] ?? 5) - (ROLE_ORDER[b.role] ?? 5))

  const handleRoleChange = async (target: Profile, newRole: string) => {
    setActionLoading(target.id)
    try {
      await supabase.from('profiles').update({ role: newRole }).eq('id', target.id)
      await supabase.from('audit_logs').insert({
        organization_id: currentProfile!.organization_id,
        user_id:         currentProfile!.user_id,
        action:          'member.role_changed',
        target_type:     'profile',
        target_id:       target.id,
        user_agent:      navigator.userAgent,
        metadata_json:   { member_email: target.email, old_role: target.role, new_role: newRole },
      })
      onMembersChange(members.map(m => m.id === target.id ? { ...m, role: newRole as Profile['role'] } : m))
      setEditingRole(null)
    } catch {
      // silent — user can retry
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemove = async (target: Profile) => {
    setActionLoading(target.id)
    try {
      await supabase.from('profiles').delete().eq('id', target.id)
      await supabase.from('audit_logs').insert({
        organization_id: currentProfile!.organization_id,
        user_id:         currentProfile!.user_id,
        action:          'member.removed',
        target_type:     'profile',
        target_id:       target.id,
        user_agent:      navigator.userAgent,
        metadata_json:   { member_email: target.email, member_role: target.role },
      })
      onMembersChange(members.filter(m => m.id !== target.id))
      setConfirmRemove(null)
    } catch {
      // silent — user can retry
    } finally {
      setActionLoading(null)
    }
  }

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

    void supabase.from('audit_logs').insert({
      organization_id: currentProfile!.organization_id,
      user_id:         currentProfile!.user_id,
      action:          'member.invited',
      user_agent:      navigator.userAgent,
      metadata_json:   { invited_email: invEmail, invited_role: invRole },
    })

    setInvSuccess(true)
    setInvEmail('')
    setTimeout(() => { setInvSuccess(false); setShowInvite(false) }, 2500)
  }

  const showActions = isOwner || isAdmin

  return (
    <div className="space-y-5">
      <SectionCard
        title="Team Members"
        subtitle={`${members.length} member${members.length !== 1 ? 's' : ''} in this workspace`}
        action={
          showActions ? (
            <button
              onClick={() => { setShowInvite(true); setInvError(null); setInvSuccess(false) }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ border: `1px solid ${T.border}`, color: T.textSec }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#16C784')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}
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
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {['Member', 'Role', 'Joined', ...(showActions ? ['Actions'] : [])].map(h => (
                  <th key={h} className="px-6 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: T.dark ? '#2D4057' : T.textDim, width: h === 'Actions' ? '120px' : undefined }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => {
                const meta  = ROLE_META[m.role] ?? ROLE_META.viewer
                const isMe  = m.user_id === currentProfile?.user_id
                const isBusy = actionLoading === m.id
                const isConfirmingRemove = confirmRemove === m.id
                const isEditingThisRole  = editingRole   === m.id
                return (
                  <tr
                    key={m.id}
                    style={{ borderBottom: i < sorted.length - 1 ? `1px solid ${T.dark ? '#0D1B2A' : T.border}` : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = T.dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {/* Member */}
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {(m.full_name ?? m.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: T.text }}>
                            {m.full_name ?? '—'}
                            {isMe && (
                              <span className="ml-2 text-[10px] mono px-1.5 py-0.5 rounded"
                                style={{ background: T.card, color: T.textDim, border: `1px solid ${T.border}` }}>
                                you
                              </span>
                            )}
                          </p>
                          <p className="text-xs" style={{ color: T.textDim }}>{m.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role — pill or editable dropdown */}
                    <td className="px-6 py-3.5">
                      {isEditingThisRole ? (
                        <select
                          autoFocus
                          defaultValue={m.role}
                          disabled={isBusy}
                          className="g-input text-xs"
                          style={{ minWidth: '110px' }}
                          onChange={e => void handleRoleChange(m, e.target.value)}
                          onBlur={() => !isBusy && setEditingRole(null)}
                        >
                          {assignableRoles.map(r => (
                            <option key={r} value={r}>{ROLE_META[r]?.label ?? r}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      )}
                    </td>

                    {/* Joined */}
                    <td className="px-6 py-3.5">
                      <p className="text-xs mono" style={{ color: T.textSec }}>{formatTs(m.created_at)}</p>
                      <p className="text-[10px] mono mt-0.5" style={{ color: T.dark ? '#2D4057' : T.textDim }}>{relativeTime(m.created_at)}</p>
                    </td>

                    {/* Actions */}
                    {showActions && (
                      <td className="px-6 py-3.5">
                        {isConfirmingRemove ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px]" style={{ color: '#EF4444' }}>Remove?</span>
                            <button
                              onClick={() => void handleRemove(m)}
                              disabled={isBusy}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}
                            >
                              {isBusy ? '…' : 'Yes'}
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              className="text-[10px] px-2 py-0.5 rounded"
                              style={{ color: T.textDim }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {canChangeRole(m) && !isEditingThisRole && (
                              <button
                                onClick={() => setEditingRole(m.id)}
                                className="p-1.5 rounded transition-colors"
                                style={{ color: T.dark ? '#2D4057' : T.textDim }}
                                title="Change role"
                                onMouseEnter={e => (e.currentTarget.style.color = '#818CF8')}
                                onMouseLeave={e => (e.currentTarget.style.color = T.dark ? '#2D4057' : T.textDim)}
                              >
                                <Pencil size={11} />
                              </button>
                            )}
                            {canRemove(m) && (
                              <button
                                onClick={() => setConfirmRemove(m.id)}
                                className="p-1.5 rounded transition-colors"
                                style={{ color: T.dark ? '#2D4057' : T.textDim }}
                                title="Remove member"
                                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                                onMouseLeave={e => (e.currentTarget.style.color = T.dark ? '#2D4057' : T.textDim)}
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Role permissions reference */}
      <SectionCard title="Role Permissions" subtitle="What each role can do in this workspace.">
        <div className="space-y-2.5">
          {ROLE_PERMS.map(({ role, perms }) => {
            const meta = ROLE_META[role]
            return (
              <div key={role} className="flex items-start gap-3 px-4 py-3 rounded-lg"
                style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 mt-0.5"
                  style={{ background: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {perms.map(p => (
                    <span key={p} className="text-[11px] flex items-center gap-1" style={{ color: T.textDim }}>
                      <span style={{ color: meta.color }}>·</span> {p}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* DB migration hint */}
      <div className="g-card overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
        <button
          onClick={() => setShowMigration(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2">
            <Info size={12} style={{ color: T.textDim }} />
            <span className="text-xs font-semibold" style={{ color: T.textDim }}>
              Required: team invites DB migration
            </span>
          </div>
          {showMigration
            ? <ChevronUp  size={12} style={{ color: T.textDim }} />
            : <ChevronDown size={12} style={{ color: T.textDim }} />}
        </button>
        {showMigration && (
          <div className="px-5 pb-5">
            <p className="text-xs mb-3" style={{ color: T.textDim }}>
              Run once in your Supabase SQL editor to enable team invites:
            </p>
            <div className="relative">
              <pre className="text-[11px] mono leading-relaxed p-4 rounded-lg overflow-x-auto"
                style={{ background: T.codeBg, color: T.codeText, border: `1px solid ${T.border}` }}>
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
            style={{ background: T.card, border: `1px solid ${T.border}` }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.2)' }}>
                  <Mail size={14} style={{ color: '#16C784' }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: T.text }}>Invite team member</h3>
                  <p className="text-xs" style={{ color: T.textDim }}>They'll receive an email to join your workspace</p>
                </div>
              </div>
              <button onClick={() => setShowInvite(false)} style={{ color: T.textDim }}>
                <X size={16} />
              </button>
            </div>

            {invSuccess ? (
              <div className="flex items-center gap-3 px-4 py-4 rounded-lg"
                style={{ background: 'rgba(22,199,132,0.06)', border: '1px solid rgba(22,199,132,0.2)' }}>
                <CheckCircle2 size={14} style={{ color: '#16C784' }} />
                <p className="text-sm" style={{ color: '#16C784' }}>Invite sent successfully!</p>
              </div>
            ) : (
              <form onSubmit={e => void handleInvite(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: T.textSec }}>
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
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: T.textSec }}>
                    Role
                  </label>
                  <select
                    value={invRole}
                    onChange={e => setInvRole(e.target.value as Role)}
                    className="g-input text-sm w-full"
                  >
                    {(isOwner ? ASSIGNABLE_ROLES : ADMIN_ASSIGNABLE_ROLES).map(r => (
                      <option key={r} value={r}>
                        {ROLE_META[r]?.label} — {ROLE_META[r]?.desc}
                      </option>
                    ))}
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
                    style={{ background: T.elevated, color: T.textSec, border: `1px solid ${T.border}` }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={invLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: '#16C784', color: '#050B14' }}
                  >
                    {invLoading ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
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

function RiskTab({ prefs, orgId, isOwner, shadowMode: initialShadowMode }: {
  prefs: RiskPrefs; orgId: string; isOwner: boolean; shadowMode: boolean
}) {
  const T = useT()
  const [local,           setLocal]           = useState<RiskPrefs>(prefs)
  const [shadowMode,      setShadowMode]      = useState(initialShadowMode)
  const [saving,          setSaving]          = useState(false)
  const [saved,           setSaved]           = useState(false)
  const [errMsg,          setErrMsg]          = useState<string | null>(null)
  const [needsMigration,  setNeedsMigration]  = useState(false)
  const [showLiveConfirm, setShowLiveConfirm] = useState(false)

  const set = <K extends keyof RiskPrefs>(key: K, val: RiskPrefs[K]) =>
    setLocal(p => ({ ...p, [key]: val }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isOwner) return
    setSaving(true); setErrMsg(null); setNeedsMigration(false)

    const { error } = await supabase
      .from('organizations')
      .update({ settings_json: local, shadow_mode: shadowMode } as Record<string, unknown>)
      .eq('id', orgId)

    setSaving(false)
    if (error) {
      if (error.code === '42703' || error.message.includes('settings_json') || error.message.includes('shadow_mode')) {
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
                <p className="text-sm font-medium" style={{ color: T.text }}>{label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: T.textDim }}>
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
                <label className="text-xs font-semibold" style={{ color: T.textSec }}>{label}</label>
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
                  <span className="text-xs mono" style={{ color: T.textDim }}>/ 100</span>
                </div>
              </div>
              <div className="relative" style={{ height: 6, borderRadius: 3, background: T.border }}>
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
              <p className="text-[10px] mt-1.5" style={{ color: T.textDim }}>{hint}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Decision Mode"
        subtitle="Control whether Genuinux actually blocks/reviews users or only simulates decisions."
      >
        <div className="grid grid-cols-2 gap-3">
          {([
            {
              mode: false,
              label: 'Live Mode',
              icon: <ShieldCheck size={16} />,
              desc: 'Decisions are enforced. Block and review outcomes affect real users.',
              accent: '#16C784',
              accentBg: 'rgba(22,199,132,0.08)',
              accentBorder: 'rgba(22,199,132,0.25)',
            },
            {
              mode: true,
              label: 'Shadow Mode',
              icon: <Eye size={16} />,
              desc: 'Engine runs fully but every live decision is "allow". Suggested decisions are recorded for analysis.',
              accent: '#38BDF8',
              accentBg: 'rgba(56,189,248,0.08)',
              accentBorder: 'rgba(56,189,248,0.25)',
            },
          ] as const).map(({ mode, label, icon, desc, accent, accentBg, accentBorder }) => {
            const selected = shadowMode === mode
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (!isOwner) return
                  if (mode === false && shadowMode === true) {
                    setShowLiveConfirm(true)
                  } else {
                    setShadowMode(mode)
                  }
                }}
                disabled={!isOwner}
                className="text-left p-4 rounded-lg transition-all"
                style={{
                  background: selected ? accentBg : T.deep,
                  border: `1px solid ${selected ? accentBorder : T.border}`,
                  cursor: isOwner ? 'pointer' : 'default',
                  opacity: !isOwner ? 0.6 : 1,
                }}
              >
                <div className="flex items-center gap-2 mb-2" style={{ color: selected ? accent : T.textDim }}>
                  {icon}
                  <span className="text-sm font-semibold" style={{ color: selected ? accent : T.textSec }}>
                    {label}
                  </span>
                  {selected && (
                    <span
                      className="ml-auto text-[9px] mono px-1.5 py-0.5 rounded"
                      style={{ background: accentBg, color: accent, border: `1px solid ${accentBorder}` }}
                    >
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: T.textDim }}>{desc}</p>
              </button>
            )
          })}
        </div>
        {shadowMode && (
          <div
            className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
            style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)', color: T.textSec }}
          >
            <Info size={12} className="flex-shrink-0 mt-0.5" style={{ color: '#38BDF8' }} />
            <span>
              Shadow Mode is active. All users will be allowed through. Check the Overview dashboard
              for a breakdown of what <em>would have been</em> blocked.
            </span>
          </div>
        )}
      </SectionCard>

      {/* Live Mode confirmation dialog */}
      {showLiveConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-md mx-4 p-6 rounded-xl space-y-4"
            style={{ background: T.card, border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <ShieldCheck size={18} style={{ color: '#EF4444' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: T.text }}>Enable Live Mode?</p>
                <p className="text-[11px] mt-0.5" style={{ color: T.textDim }}>
                  This will enforce real decisions immediately.
                </p>
              </div>
            </div>
            <div
              className="px-3 py-2.5 rounded-lg text-xs space-y-1"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <p style={{ color: '#EF4444' }} className="font-semibold">Production consequences:</p>
              <ul className="space-y-0.5 list-disc list-inside" style={{ color: T.textSec }}>
                <li>Block decisions will reject real users in real time</li>
                <li>Review decisions will queue real users for manual review</li>
                <li>Webhooks will fire with live outcomes</li>
              </ul>
            </div>
            <p className="text-xs" style={{ color: T.textSec }}>
              Only switch to Live Mode when you have validated your rules and thresholds
              using Shadow Mode data. You can revert at any time from this Settings page.
            </p>
            <div className="flex gap-3 justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowLiveConfirm(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium"
                style={{ background: T.elevated, color: T.textSec, border: `1px solid ${T.border}` }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShadowMode(false); setShowLiveConfirm(false) }}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: '#EF4444', color: '#FFFFFF', border: 'none' }}
              >
                Yes, enable Live Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {needsMigration && (
        <div className="g-card p-5 space-y-3"
          style={{ border: '1px solid rgba(245,158,11,0.3)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} style={{ color: '#F59E0B' }} />
            <p className="text-sm font-semibold" style={{ color: '#F59E0B' }}>Database migration required</p>
          </div>
          <p className="text-xs" style={{ color: T.textSec }}>
            Run the following SQL in your Supabase SQL editor to enable risk preference storage:
          </p>
          <pre className="text-xs mono p-3 rounded-lg overflow-x-auto"
            style={{ background: T.codeBg, color: '#16C784', border: `1px solid ${T.border}` }}>
            {`ALTER TABLE organizations\n  ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}';\nALTER TABLE organizations\n  ADD COLUMN IF NOT EXISTS shadow_mode boolean NOT NULL DEFAULT false;\nALTER TABLE risk_events\n  ADD COLUMN IF NOT EXISTS shadow_mode boolean NOT NULL DEFAULT false,\n  ADD COLUMN IF NOT EXISTS suggested_decision text;`}
          </pre>
        </div>
      )}

      {errMsg && <p className="text-xs" style={{ color: '#EF4444' }}>{errMsg}</p>}

      {!isOwner && (
        <p className="text-xs" style={{ color: T.textDim }}>
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

function BillingTab({ plan, billingSuccess }: { plan: string; orgId: string; billingSuccess?: boolean }) {
  const T = useT()
  const { session } = useAuth()
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [showStripeMigration, setShowStripeMigration] = useState(false)
  const [showSuccess, setShowSuccess] = useState(billingSuccess ?? false)

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

      {showSuccess && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg"
          style={{ background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.25)' }}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={14} style={{ color: '#16C784' }} />
            <span className="text-sm font-semibold" style={{ color: '#16C784' }}>Subscription activated!</span>
            <span className="text-xs" style={{ color: T.textSec }}>Your plan has been updated. Welcome aboard.</span>
          </div>
          <button onClick={() => setShowSuccess(false)} style={{ color: T.textDim }}>
            <X size={13} />
          </button>
        </div>
      )}

      <SectionCard
        title="Current Plan"
        action={
          isPaid ? (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ border: `1px solid ${T.border}`, color: T.textSec }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#16C784')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}
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
          <p className="text-xs" style={{ color: T.textDim }}>
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
                background: isCurrent ? 'rgba(22,199,132,0.05)' : T.card,
                border: isCurrent
                  ? '1px solid rgba(22,199,132,0.3)'
                  : p.highlight
                  ? '1px solid rgba(99,102,241,0.3)'
                  : `1px solid ${T.border}`,
              }}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold" style={{ color: T.text }}>{p.name}</span>
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
                <p className="text-lg font-bold mono" style={{ color: isCurrent ? '#16C784' : T.text }}>
                  {p.price}
                </p>
              </div>
              <ul className="space-y-1.5 flex-1">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-[11px]" style={{ color: T.textSec }}>
                    <CheckCircle2 size={11} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button disabled
                  className="w-full py-2 rounded-lg text-xs font-semibold"
                  style={{ background: T.elevated, color: T.textDim, border: `1px solid ${T.border}`, opacity: 0.7 }}>
                  Current plan
                </button>
              ) : isContact ? (
                <a href="mailto:sales@genuinux.io"
                  className="w-full flex items-center justify-center py-2 rounded-lg text-xs font-semibold"
                  style={{ background: T.elevated, color: T.textSec, border: `1px solid ${T.border}` }}>
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
              <p className="text-[11px] mt-1" style={{ color: T.textDim }}>
                Add <span className="mono" style={{ color: T.textSec }}>STRIPE_SECRET_KEY</span>,{' '}
                <span className="mono" style={{ color: T.textSec }}>STRIPE_PRICE_STARTER</span>, and{' '}
                <span className="mono" style={{ color: T.textSec }}>STRIPE_PRICE_PRO</span>{' '}
                to your Vercel environment variables to enable billing.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stripe DB migration */}
      <div className="g-card overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
        <button
          onClick={() => setShowStripeMigration(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2">
            <Info size={12} style={{ color: T.textDim }} />
            <span className="text-xs font-semibold" style={{ color: T.textDim }}>
              Required: Stripe DB migration
            </span>
          </div>
          {showStripeMigration
            ? <ChevronUp size={12} style={{ color: T.textDim }} />
            : <ChevronDown size={12} style={{ color: T.textDim }} />}
        </button>
        {showStripeMigration && (
          <div className="px-5 pb-5">
            <p className="text-xs mb-3" style={{ color: T.textDim }}>
              Run once in your Supabase SQL editor to store Stripe customer IDs:
            </p>
            <div className="relative">
              <pre className="text-[11px] mono p-4 rounded-lg overflow-x-auto"
                style={{ background: T.codeBg, color: T.codeText, border: `1px solid ${T.border}` }}>
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
        style={{ background: T.card, border: `1px solid ${T.border}` }}
      >
        <CreditCard size={16} style={{ color: T.textDim, flexShrink: 0 }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: T.textSec }}>Enterprise & custom pricing</p>
          <p className="text-xs mt-0.5" style={{ color: T.textDim }}>
            Need a custom volume deal, SLA guarantee, or dedicated support? Contact{' '}
            <a href="mailto:billing@genuinux.io" style={{ color: '#16C784' }}>billing@genuinux.io</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Audit Logs ─────────────────────────────────────────────────────────

function AuditTab({ orgId, members }: { orgId: string; members: Profile[] }) {
  const T = useT()
  const [logs,      setLogs]      = useState<AuditLog[]>([])
  const [loading,   setLoading]   = useState(true)
  const [category,  setCategory]  = useState<AuditCategory>('all')
  const [userId,    setUserId]    = useState<string>('all')
  const [dateRange, setDateRange] = useState<AuditDateRange>('30d')
  const [expanded,  setExpanded]  = useState<string | null>(null)

  const memberMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    members.forEach(p => { m[p.user_id] = p.email })
    return m
  }, [members])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let since: string | null = null
    if (dateRange !== 'all') {
      const d = new Date()
      if (dateRange === 'today') d.setHours(0, 0, 0, 0)
      else if (dateRange === '7d') d.setDate(d.getDate() - 7)
      else d.setDate(d.getDate() - 30)
      since = d.toISOString()
    }

    const base = supabase
      .from('audit_logs')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(500)

    const { data } = since ? await base.gte('created_at', since) : await base
    setLogs((data ?? []) as AuditLog[])
    setLoading(false)
  }, [orgId, dateRange])

  useEffect(() => { void fetchLogs() }, [fetchLogs])

  const filtered = useMemo(() => logs.filter(log => {
    if (category !== 'all' && !log.action.startsWith(category === 'api_key' ? 'api_key' : category)) return false
    if (userId !== 'all' && log.user_id !== userId) return false
    return true
  }), [logs, category, userId])

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {AUDIT_CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className="px-3 py-1 rounded-full text-[11px] font-semibold transition-colors"
              style={{
                background: category === c.id ? 'rgba(22,199,132,0.15)' : 'transparent',
                color: category === c.id ? '#16C784' : T.textDim,
                border: `1px solid ${category === c.id ? 'rgba(22,199,132,0.3)' : T.border}`,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <select
          value={userId}
          onChange={e => setUserId(e.target.value)}
          className="g-input text-xs"
          style={{ width: 180 }}
        >
          <option value="all">All users</option>
          {members.map(m => (
            <option key={m.user_id} value={m.user_id}>{m.email}</option>
          ))}
        </select>

        <select
          value={dateRange}
          onChange={e => setDateRange(e.target.value as AuditDateRange)}
          className="g-input text-xs"
          style={{ width: 140 }}
        >
          {DATE_RANGES.map(d => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>

      <SectionCard
        title="Audit Log"
        subtitle={loading ? 'Loading…' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}
      >
        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2" style={{ color: T.textDim }}>
            <RefreshCw size={14} className="animate-spin" />
            <span className="text-sm">Loading logs…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <Clock size={20} className="mx-auto mb-2" style={{ color: T.border }} />
            <p className="text-sm" style={{ color: T.textDim }}>No audit events found.</p>
            <p className="text-xs mt-1" style={{ color: T.dark ? '#2D4057' : T.textDim }}>
              Try changing the date range or category filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {['Action', 'Actor', 'Target', 'When'].map(h => (
                    <th key={h} className="px-6 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: T.dark ? '#2D4057' : T.textDim }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              {filtered.map((log, i) => {
                const isLast    = i === filtered.length - 1
                const isOpen    = expanded === log.id
                const color     = getActionColor(log.action)
                const actorEmail = log.user_id
                  ? (memberMap[log.user_id] ?? log.user_id.slice(0, 8) + '…')
                  : '—'
                const target = log.target_type
                  ? `${log.target_type}${log.target_id ? ` · ${log.target_id.slice(0, 8)}…` : ''}`
                  : getTargetFromMetadata(log)

                return (
                  <Fragment key={log.id}>
                    <tbody>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : log.id)}
                        className="cursor-pointer transition-colors"
                        style={{
                          borderBottom: isLast && !isOpen ? 'none' : `1px solid ${T.dark ? '#0D1B2A' : T.border}`,
                          background: isOpen ? 'rgba(22,199,132,0.025)' : undefined,
                        }}
                        onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = T.dark ? '#050B14' : 'rgba(0,0,0,0.02)' }}
                        onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = '' }}
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span style={{ color, flexShrink: 0 }}>{getActionIcon(log.action)}</span>
                            <span className="text-xs font-medium" style={{ color: T.textSec }}>
                              {formatAction(log.action)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <p className="text-xs mono" style={{ color: T.textDim }}>{actorEmail}</p>
                        </td>
                        <td className="px-6 py-3">
                          {target && (
                            <p className="text-[10px] mono" style={{ color: T.dark ? '#2D4057' : T.textDim }}>{target}</p>
                          )}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          <p className="text-[10px] mono" style={{ color: T.textSec }}>{formatTs(log.created_at)}</p>
                          <p className="text-[10px] mono mt-0.5" style={{ color: T.dark ? '#2D4057' : T.textDim }}>{relativeTime(log.created_at)}</p>
                        </td>
                      </tr>
                    </tbody>
                    {isOpen && (
                      <tbody>
                        <tr style={{ borderBottom: isLast ? 'none' : `1px solid ${T.dark ? '#0D1B2A' : T.border}`, background: 'rgba(22,199,132,0.02)' }}>
                          <td colSpan={4} className="px-6 pb-4 pt-1">
                            <div className="rounded-lg p-3 space-y-2.5"
                              style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                <div>
                                  <p className="text-[10px] mb-0.5" style={{ color: T.dark ? '#2D4057' : T.textDim }}>Log ID</p>
                                  <p className="text-[11px] mono" style={{ color: T.textDim }}>{log.id}</p>
                                </div>
                                {log.user_id && (
                                  <div>
                                    <p className="text-[10px] mb-0.5" style={{ color: T.dark ? '#2D4057' : T.textDim }}>User ID</p>
                                    <p className="text-[11px] mono" style={{ color: T.textDim }}>{log.user_id}</p>
                                  </div>
                                )}
                              </div>
                              {log.user_agent && (
                                <div>
                                  <p className="text-[10px] mb-0.5" style={{ color: T.dark ? '#2D4057' : T.textDim }}>User Agent</p>
                                  <p className="text-[11px] mono break-all leading-relaxed" style={{ color: T.textDim }}>
                                    {log.user_agent}
                                  </p>
                                </div>
                              )}
                              {log.metadata_json && Object.keys(log.metadata_json).length > 0 && (
                                <div>
                                  <p className="text-[10px] mb-1" style={{ color: T.dark ? '#2D4057' : T.textDim }}>Details</p>
                                  <pre className="text-[10px] mono leading-relaxed overflow-x-auto"
                                    style={{ color: T.textSec }}>
                                    {JSON.stringify(log.metadata_json, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </Fragment>
                )
              })}
            </table>
          </div>
        )}
      </SectionCard>

      {!loading && filtered.length >= 500 && (
        <p className="text-[11px] text-center" style={{ color: T.dark ? '#2D4057' : T.textDim }}>
          Showing up to 500 most recent events. Narrow the date range to see older logs.
        </p>
      )}
    </div>
  )
}

// ─── Tab: Security ────────────────────────────────────────────────────────────

function SecurityTab() {
  const T = useT()
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
              style={{ background: T.bg, border: `1px solid ${T.border}` }}>
              <span style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: T.text }}>{title}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: T.textDim }}>{desc}</p>
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
            style={{ background: T.bg, border: `1px solid ${T.border}` }}>
            <Webhook size={13} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
            <div className="space-y-1">
              <p className="text-xs font-semibold" style={{ color: T.text }}>Signature header</p>
              <p className="text-[11px] leading-relaxed" style={{ color: T.textDim }}>
                Every request includes <span className="mono" style={{ color: T.textSec }}>X-Genuinux-Signature: sha256=&lt;hex&gt;</span>.
                Verify it using your webhook secret to ensure the payload was not tampered with.
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: T.textSec }}>Node.js verification example</p>
            <pre
              className="text-[10px] mono leading-relaxed rounded-lg overflow-x-auto p-4"
              style={{ background: T.codeBg, color: T.codeText, border: `1px solid ${T.border}` }}
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
  const T = useT()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabId | null) ?? 'org'
  const billingSuccess = searchParams.get('success') === '1' && initialTab === 'billing'
  const [tab,       setTab]       = useState<TabId>(TABS.some(t => t.id === initialTab) ? initialTab : 'org')
  const [org,       setOrg]       = useState<Organization | null>(null)
  const [profile,   setProfile]   = useState<Profile | null>(null)
  const [members,   setMembers]   = useState<Profile[]>([])
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

    const [orgRes, membersRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).single(),
      supabase.from('profiles').select('*').eq('organization_id', orgId),
    ])

    if (orgRes.data) {
      setOrg(orgRes.data as Organization)
      const raw = (orgRes.data as Record<string, unknown>)['settings_json']
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        setRiskPrefs(prev => ({ ...prev, ...(raw as Partial<RiskPrefs>) }))
      }
    }

    if (membersRes.data) setMembers(membersRes.data as Profile[])

    setLoading(false)
  }, [user])

  useEffect(() => { void loadAll() }, [loadAll])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: T.textDim }}>
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
        <h1 className="text-lg font-bold" style={{ color: T.text }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: T.textDim }}>
          Manage your organization, team, and risk configuration.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 flex-wrap" style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 0 }}>
        {TABS.filter(t => {
          if (t.id === 'billing')  return profile.role === 'owner'
          if (t.id === 'team')     return can(profile.role, 'manage_members') || profile.role === 'admin'
          if (t.id === 'risk')     return can(profile.role, 'manage_rules')
          if (t.id === 'audit')    return can(profile.role, 'review_events')
          return true
        }).map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors relative"
              style={{
                color: active ? T.text : T.textDim,
                borderBottom: active ? '2px solid #16C784' : '2px solid transparent',
                marginBottom: -1,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.textSec }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.textDim }}
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
        <TeamTab members={members} currentProfile={profile} onMembersChange={setMembers} />
      )}
      {tab === 'risk' && (
        <RiskTab prefs={riskPrefs} orgId={org.id} isOwner={isOwner} shadowMode={org.shadow_mode} />
      )}
      {tab === 'billing' && (
        <BillingTab plan={org.plan} orgId={org.id} billingSuccess={billingSuccess} />
      )}
      {tab === 'security' && (
        <SecurityTab />
      )}
      {tab === 'audit' && (
        <AuditTab orgId={org.id} members={members} />
      )}
    </div>
  )
}
