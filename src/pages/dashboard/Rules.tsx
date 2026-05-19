import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, X, RefreshCw,
  Info, Shield,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Rule, Decision, RuleStatus } from '../../types'

// ─── Condition type config ────────────────────────────────────────────────────

interface CondType {
  value: string
  label: string
  cat: string
  opType: 'numeric' | 'string'
  valType: 'number' | 'text' | 'select'
  hint?: string
  opts?: string[]
}

const COND_TYPES: CondType[] = [
  { value: 'fraud_score',        label: 'Fraud Score',               cat: 'Scores',   opType: 'numeric', valType: 'number', hint: '0 – 100' },
  { value: 'trust_score',        label: 'Trust Score',               cat: 'Scores',   opType: 'numeric', valType: 'number', hint: '0 – 100' },
  { value: 'risk_level',         label: 'Risk Level',                cat: 'Scores',   opType: 'string',  valType: 'select', opts: ['low', 'medium', 'high', 'critical'] },
  { value: 'event_type',         label: 'Event Type',                cat: 'Event',    opType: 'string',  valType: 'select', opts: ['signup', 'login', 'transaction', 'withdrawal', 'referral', 'checkout', 'custom'] },
  { value: 'country',            label: 'Country Code',              cat: 'Location', opType: 'string',  valType: 'text',   hint: 'ISO 2-letter code, e.g. BR' },
  { value: 'ip_user_count_1h',   label: 'Distinct users / IP (1h)', cat: 'Velocity', opType: 'numeric', valType: 'number', hint: 'distinct user count' },
  { value: 'ip_signup_count_1h', label: 'Signups from same IP (1h)', cat: 'Velocity', opType: 'numeric', valType: 'number', hint: 'signup count' },
  { value: 'device_user_count',  label: 'Distinct users / device',   cat: 'Velocity', opType: 'numeric', valType: 'number', hint: 'distinct user count' },
]

const NUMERIC_OPS = [
  { value: 'gt',  label: 'greater than', sym: '>'  },
  { value: 'gte', label: 'at least',     sym: '>=' },
  { value: 'lt',  label: 'less than',    sym: '<'  },
  { value: 'lte', label: 'at most',      sym: '<=' },
  { value: 'eq',  label: 'equals',       sym: '='  },
]

const STRING_OPS = [
  { value: 'eq',  label: 'equals',     sym: '=' },
  { value: 'neq', label: 'not equals', sym: '≠' },
]

// Category order for optgroups
const CAT_ORDER = ['Scores', 'Event', 'Location', 'Velocity']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCV(cv: string): { operator: string; value: string } {
  const idx = cv.indexOf(':')
  return idx === -1
    ? { operator: 'eq', value: cv }
    : { operator: cv.slice(0, idx), value: cv.slice(idx + 1) }
}

function opsFor(ct: CondType | undefined) {
  return ct?.opType === 'numeric' ? NUMERIC_OPS : STRING_OPS
}

function ruleToSentence(rule: Rule): string {
  const ct = COND_TYPES.find(c => c.value === rule.condition_type)
  const { operator, value } = parseCV(rule.condition_value)
  const ops = opsFor(ct)
  const op  = ops.find(o => o.value === operator)
  return `If ${ct?.label ?? rule.condition_type} ${op?.sym ?? operator} ${value}`
}

function actionMeta(action: Decision) {
  if (action === 'allow')  return { label: 'Approve', color: '#16C784', bg: 'rgba(22,199,132,0.10)'  }
  if (action === 'review') return { label: 'Review',  color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' }
  return                          { label: 'Block',   color: '#EF4444', bg: 'rgba(239,68,68,0.10)'   }
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, loading, onChange }: { checked: boolean; loading?: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={loading}
      style={{
        flexShrink: 0,
        position: 'relative',
        width: 36, height: 20,
        borderRadius: 10,
        background: checked ? '#16C784' : '#1E2D3D',
        border: `1px solid ${checked ? '#16C784' : '#2D4057'}`,
        opacity: loading ? 0.5 : 1,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2, left: checked ? 17 : 2,
          width: 14, height: 14,
          borderRadius: '50%',
          background: '#ffffff',
          transition: 'left 0.2s ease',
        }}
      />
    </button>
  )
}

// ─── Rule modal (create / edit) ───────────────────────────────────────────────

interface RuleForm { name: string; condition_type: string; operator: string; value: string; action: Decision | '' }

const EMPTY_FORM: RuleForm = { name: '', condition_type: '', operator: 'gt', value: '', action: '' }

function initForm(rule?: Rule): RuleForm {
  if (!rule) return EMPTY_FORM
  const { operator, value } = parseCV(rule.condition_value)
  return { name: rule.name, condition_type: rule.condition_type, operator, value, action: rule.action }
}

function RuleModal({ rule, orgId, onSave, onClose }: {
  rule?: Rule
  orgId: string
  onSave: (saved: Rule) => void
  onClose: () => void
}) {
  const [form,   setForm]   = useState<RuleForm>(() => initForm(rule))
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  const ct     = COND_TYPES.find(c => c.value === form.condition_type)
  const ops    = opsFor(ct)
  const isValid =
    form.name.trim().length >= 2 &&
    form.condition_type !== '' &&
    form.operator !== '' &&
    form.value.trim() !== '' &&
    form.action !== ''

  // When condition type changes, reset operator to first valid one + clear value
  const handleCondTypeChange = (type: string) => {
    const newCt  = COND_TYPES.find(c => c.value === type)
    const newOps = opsFor(newCt)
    setForm(p => ({ ...p, condition_type: type, operator: newOps[0].value, value: '' }))
  }

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setErr(null)

    const payload = {
      name:             form.name.trim(),
      condition_type:   form.condition_type,
      condition_value:  `${form.operator}:${form.value.trim()}`,
      action:           form.action as Decision,
      status:           'active' as RuleStatus,
      organization_id:  orgId,
    }

    const { data, error } = rule
      ? await supabase.from('rules').update(payload).eq('id', rule.id).select().single()
      : await supabase.from('rules').insert(payload).select().single()

    if (error) { setErr(error.message); setSaving(false); return }
    onSave(data as Rule)
    onClose()
  }

  // Live preview sentence
  const previewOp     = ops.find(o => o.value === form.operator)
  const previewAction = form.action ? actionMeta(form.action as Decision) : null
  const hasPreview    = form.condition_type && form.operator && form.value.trim() && form.action

  // Groups for optgroup
  const grouped = CAT_ORDER.map(cat => ({
    cat,
    types: COND_TYPES.filter(c => c.cat === cat),
  }))

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4"
        style={{ background: 'rgba(5,11,20,0.8)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        {/* Card — stop propagation so clicking inside doesn't close */}
        <div
          className="w-full flex flex-col"
          style={{
            maxWidth: 500,
            background: '#07111F',
            border: '1px solid #1E2D3D',
            borderRadius: 20,
            maxHeight: '90vh',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-5 flex-shrink-0"
            style={{ borderBottom: '1px solid #1E2D3D' }}
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#2D4057' }}>
                {rule ? 'Edit Rule' : 'New Rule'}
              </p>
              <p className="text-sm font-bold" style={{ color: '#E2E8F0', fontFamily: 'Syne, sans-serif' }}>
                {rule ? 'Update this rule' : 'Create a custom rule'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: '#0B1220', border: '1px solid #1E2D3D', color: '#475569' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#E2E8F0')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            >
              <X size={13} />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

            {/* Rule name */}
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>
                Rule Name
              </label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. High Fraud Score Block"
                className="g-input text-sm"
              />
            </div>

            {/* Condition */}
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>
                Condition
              </label>
              <div className="space-y-2">
                {/* Condition type */}
                <select
                  value={form.condition_type}
                  onChange={e => handleCondTypeChange(e.target.value)}
                  className="g-input text-sm"
                >
                  <option value="">Select condition…</option>
                  {grouped.map(g => (
                    <optgroup key={g.cat} label={g.cat}>
                      {g.types.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {/* Operator + value (only when condition type chosen) */}
                {form.condition_type && (
                  <div className="flex items-center gap-2">
                    <select
                      value={form.operator}
                      onChange={e => setForm(p => ({ ...p, operator: e.target.value }))}
                      className="g-input text-sm"
                      style={{ width: 160, flexShrink: 0 }}
                    >
                      {ops.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>

                    {ct?.valType === 'select' ? (
                      <select
                        value={form.value}
                        onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                        className="g-input text-sm flex-1"
                      >
                        <option value="">Select value…</option>
                        {ct.opts?.map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex-1">
                        <input
                          type={ct?.valType === 'number' ? 'number' : 'text'}
                          value={form.value}
                          onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                          placeholder={ct?.hint ?? 'Value…'}
                          className="g-input text-sm w-full"
                          min={ct?.valType === 'number' ? 0 : undefined}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action */}
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>
                Then → Action
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'allow',  label: 'Approve', color: '#16C784', bg: 'rgba(22,199,132,0.08)',  border: 'rgba(22,199,132,0.3)'  },
                  { value: 'review', label: 'Review',  color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)'  },
                  { value: 'block',  label: 'Block',   color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)'   },
                ].map(a => (
                  <button
                    key={a.value}
                    onClick={() => setForm(p => ({ ...p, action: a.value as Decision }))}
                    className="py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: form.action === a.value ? a.bg : 'transparent',
                      color: form.action === a.value ? a.color : '#475569',
                      border: `1px solid ${form.action === a.value ? a.border : '#1E2D3D'}`,
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live preview */}
            {hasPreview && (
              <div
                className="px-4 py-3 rounded-xl"
                style={{ background: '#050B14', border: '1px solid #1E2D3D' }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#2D4057' }}>
                  Rule Preview
                </p>
                <p className="text-xs mono" style={{ color: '#94A3B8' }}>
                  If{' '}
                  <span style={{ color: '#E2E8F0' }}>{ct?.label}</span>
                  {' '}<span style={{ color: '#475569' }}>{previewOp?.sym}</span>{' '}
                  <span style={{ color: '#E2E8F0' }}>{form.value}</span>
                  {' '}→ {' '}
                  {previewAction && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                      style={{ background: previewAction.bg, color: previewAction.color }}
                    >
                      {previewAction.label.toUpperCase()}
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Error */}
            {err && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                {err}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0"
            style={{ borderTop: '1px solid #1E2D3D' }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm transition-colors"
              style={{ border: '1px solid #1E2D3D', color: '#475569' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!isValid || saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: isValid ? '#16C784' : '#1E2D3D', color: isValid ? '#000000' : '#475569' }}
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : null}
              {rule ? 'Save changes' : 'Create rule'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Rules() {
  const { user }  = useAuth()
  const [orgId,   setOrgId]   = useState<string | null>(null)
  const [rules,   setRules]   = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [showModal,   setShowModal]   = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | undefined>(undefined)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [toggling,    setToggling]    = useState<Set<string>>(new Set())

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

  const fetchRules = useCallback(async () => {
    if (!orgId) return
    const { data, error: err } = await supabase
      .from('rules')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setRules((data ?? []) as Rule[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { void fetchRules() }, [fetchRules])

  const handleToggle = async (rule: Rule) => {
    setToggling(prev => new Set(prev).add(rule.id))
    const newStatus: RuleStatus = rule.status === 'active' ? 'paused' : 'active'

    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: newStatus } : r))

    const { error } = await supabase
      .from('rules')
      .update({ status: newStatus })
      .eq('id', rule.id)

    if (error) {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: rule.status } : r))
    } else if (orgId) {
      void supabase.from('audit_logs').insert({
        organization_id: orgId,
        user_id: user?.id ?? null,
        action: 'rule.updated',
        metadata_json: { rule_id: rule.id, name: rule.name, status: newStatus },
      })
    }

    setToggling(prev => { const s = new Set(prev); s.delete(rule.id); return s })
  }

  const handleDelete = async (id: string) => {
    const deleted = rules.find(r => r.id === id)
    await supabase.from('rules').delete().eq('id', id)
    if (orgId && deleted) {
      void supabase.from('audit_logs').insert({
        organization_id: orgId,
        user_id: user?.id ?? null,
        action: 'rule.deleted',
        metadata_json: { rule_id: id, name: deleted.name },
      })
    }
    setRules(prev => prev.filter(r => r.id !== id))
    setDeletingId(null)
  }

  const handleSaved = (saved: Rule) => {
    setRules(prev => {
      const idx = prev.findIndex(r => r.id === saved.id)
      const action = idx >= 0 ? 'rule.updated' : 'rule.created'
      if (orgId) {
        void supabase.from('audit_logs').insert({
          organization_id: orgId,
          user_id: user?.id ?? null,
          action,
          metadata_json: { rule_id: saved.id, name: saved.name, action: saved.action },
        })
      }
      return idx >= 0
        ? prev.map(r => r.id === saved.id ? saved : r)
        : [...prev, saved]
    })
  }

  const openCreate = () => { setEditingRule(undefined); setShowModal(true) }
  const openEdit   = (rule: Rule) => { setEditingRule(rule); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditingRule(undefined) }

  const activeCount = rules.filter(r => r.status === 'active').length

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3" style={{ color: '#475569' }}>
      <RefreshCw size={15} className="animate-spin" />
      <span className="text-sm">Loading rules…</span>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <div className="g-card p-5 text-sm" style={{ color: '#EF4444' }}>{error}</div>
    </div>
  )

  return (
    <div className="p-7" style={{ maxWidth: 960 }}>

      {/* Sub-header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: '#475569' }}>
          {activeCount > 0
            ? <><span style={{ color: '#16C784', fontWeight: 600 }}>{activeCount} active</span> rule{activeCount !== 1 ? 's' : ''}</>
            : 'No active rules'}
          <span style={{ color: '#2D4057' }}> · {rules.length} total</span>
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
          style={{ background: '#16C784', color: '#000000' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <Plus size={14} />
          New Rule
        </button>
      </div>

      {/* Info banner */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6"
        style={{ background: 'rgba(22,199,132,0.05)', border: '1px solid rgba(22,199,132,0.12)' }}
      >
        <Info size={13} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
          Rules run <strong style={{ color: '#94A3B8' }}>after</strong> the base Risk Engine score is calculated.
          The first matching rule overrides the final decision. Rules are evaluated in creation order — oldest first.
        </p>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="g-card py-16 text-center">
          <Shield size={24} className="mx-auto mb-3" style={{ color: '#1E2D3D' }} />
          <p className="text-sm font-semibold mb-1.5" style={{ color: '#475569' }}>No rules yet</p>
          <p className="text-xs mb-5" style={{ color: '#2D4057' }}>
            Create your first rule to customize fraud decisions.
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: '#16C784', color: '#000000' }}
          >
            <Plus size={13} />
            New Rule
          </button>
        </div>
      ) : (
        <div className="g-card overflow-hidden">
          {/* Table header */}
          <div
            className="grid px-5 py-3"
            style={{
              gridTemplateColumns: '44px 1fr auto auto',
              borderBottom: '1px solid #1E2D3D',
              background: '#07111F',
              gap: '12px',
            }}
          >
            {['', 'Rule / Condition', 'Action', 'Created'].map((h, i) => (
              <p
                key={i}
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: '#2D4057' }}
              >
                {h}
              </p>
            ))}
          </div>

          {rules.map((rule, i) => {
            const meta       = actionMeta(rule.action)
            const isActive   = rule.status === 'active'
            const isToggling = toggling.has(rule.id)
            const isDeleting = deletingId === rule.id

            return (
              <div
                key={rule.id}
                className="group grid px-5 py-4 items-center transition-colors duration-100"
                style={{
                  gridTemplateColumns: '44px 1fr auto auto',
                  gap: '12px',
                  borderBottom: i < rules.length - 1 ? '1px solid #0D1B2A' : 'none',
                  borderLeft: `3px solid ${isActive ? meta.color : '#1E2D3D'}`,
                  background: 'transparent',
                  opacity: isActive ? 1 : 0.55,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0A1828')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Toggle */}
                <div className="flex items-center">
                  <Toggle
                    checked={isActive}
                    loading={isToggling}
                    onChange={() => void handleToggle(rule)}
                  />
                </div>

                {/* Name + condition */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold mb-0.5" style={{ color: '#E2E8F0' }}>
                    {rule.name}
                  </p>
                  <p className="text-xs mono" style={{ color: '#475569' }}>
                    {ruleToSentence(rule)}
                  </p>
                </div>

                {/* Action badge */}
                <div>
                  <span
                    className="text-[10px] px-2.5 py-1 rounded-full font-semibold mono whitespace-nowrap"
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    → {meta.label.toUpperCase()}
                  </span>
                </div>

                {/* Created + actions */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] mono whitespace-nowrap" style={{ color: '#2D4057' }}>
                    {new Date(rule.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>

                  {!isDeleting ? (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button
                        onClick={() => openEdit(rule)}
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                        style={{ color: '#475569' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                        title="Edit"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => setDeletingId(rule.id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                        style={{ color: '#475569' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-[10px] px-2 py-1 rounded-md transition-colors"
                        style={{ color: '#475569', border: '1px solid #1E2D3D' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void handleDelete(rule.id)}
                        className="text-[10px] px-2 py-1 rounded-md font-semibold transition-colors"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Examples hint */}
      {rules.length > 0 && (
        <div className="mt-4 px-1">
          <p className="text-[11px]" style={{ color: '#2D4057' }}>
            Example rules:{' '}
            <span style={{ color: '#475569' }}>
              "If fraud_score {'>'} 80 → Block" · "If country = RU → Review" · "If device_user_count {'>'} 3 → Review"
            </span>
          </p>
        </div>
      )}

      {/* Modal */}
      {showModal && orgId && (
        <RuleModal
          rule={editingRule}
          orgId={orgId}
          onSave={handleSaved}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
