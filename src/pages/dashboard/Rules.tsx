import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, X, RefreshCw,
  Info, Shield, ChevronDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Rule, RuleAction, RuleStatus, ConditionGroup, ConditionOperator } from '../../types'

// ─── Condition field definitions ──────────────────────────────────────────────

interface CondField {
  value:   string
  label:   string
  cat:     string
  valType: 'number' | 'text' | 'select'
  hint?:   string
  opts?:   string[]
}

const COND_FIELDS: CondField[] = [
  { value: 'fraud_score',          label: 'Fraud Score',                cat: 'Scores',   valType: 'number', hint: '0–100' },
  { value: 'trust_score',          label: 'Trust Score',                cat: 'Scores',   valType: 'number', hint: '0–100' },
  { value: 'risk_level',           label: 'Risk Level',                 cat: 'Scores',   valType: 'select', opts: ['low', 'medium', 'high', 'critical'] },
  { value: 'event_type',           label: 'Event Type',                 cat: 'Event',    valType: 'select', opts: ['signup', 'login', 'transaction', 'withdrawal', 'referral', 'checkout', 'custom'] },
  { value: 'country',              label: 'Country Code',               cat: 'Location', valType: 'text',   hint: 'ISO 2-letter, e.g. BR' },
  { value: 'email_domain',         label: 'Email Domain',               cat: 'Identity', valType: 'text',   hint: 'e.g. gmail.com' },
  { value: 'ip_user_count_1h',     label: 'Distinct users / IP (1h)',   cat: 'Velocity', valType: 'number', hint: 'distinct user count' },
  { value: 'ip_signup_count_1h',   label: 'Signups from same IP (1h)',  cat: 'Velocity', valType: 'number', hint: 'signup count' },
  { value: 'device_account_count', label: 'Accounts on device',         cat: 'Device',   valType: 'number', hint: 'distinct user count' },
  { value: 'metadata',             label: 'Metadata field',             cat: 'Custom',   valType: 'text',   hint: 'field value' },
]

const NUMERIC_OPS: { value: ConditionOperator; label: string; sym: string }[] = [
  { value: 'gt',  label: 'greater than', sym: '>' },
  { value: 'gte', label: 'at least',     sym: '≥' },
  { value: 'lt',  label: 'less than',    sym: '<' },
  { value: 'lte', label: 'at most',      sym: '≤' },
  { value: 'eq',  label: 'equals',       sym: '=' },
]

const STRING_OPS: { value: ConditionOperator; label: string; sym: string }[] = [
  { value: 'eq',       label: 'equals',     sym: '=' },
  { value: 'neq',      label: 'not equals', sym: '≠' },
  { value: 'contains', label: 'contains',   sym: '⊇' },
]

const CAT_ORDER = ['Scores', 'Event', 'Location', 'Identity', 'Velocity', 'Device', 'Custom']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function opsFor(fieldValue: string) {
  const cf = COND_FIELDS.find(f => f.value === fieldValue)
  return cf?.valType === 'number' ? NUMERIC_OPS : STRING_OPS
}

function parseCV(cv: string): { operator: string; value: string } {
  const idx = cv.indexOf(':')
  return idx === -1
    ? { operator: 'eq', value: cv }
    : { operator: cv.slice(0, idx), value: cv.slice(idx + 1) }
}

interface ConditionForm {
  field:    string
  metaKey:  string
  operator: string
  value:    string
}

function emptyCondition(): ConditionForm {
  return { field: 'fraud_score', metaKey: '', operator: 'gt', value: '' }
}

function ruleToConditions(rule: Rule): ConditionForm[] {
  if (rule.condition_group?.conditions?.length) {
    return rule.condition_group.conditions.map(c => {
      const isMeta = c.field.startsWith('metadata.')
      return {
        field:    isMeta ? 'metadata' : c.field,
        metaKey:  isMeta ? c.field.slice('metadata.'.length) : '',
        operator: c.operator,
        value:    c.value,
      }
    })
  }
  if (rule.condition_type) {
    const { operator, value } = parseCV(rule.condition_value)
    return [{ field: rule.condition_type, metaKey: '', operator, value }]
  }
  return [emptyCondition()]
}

function conditionToSentencePart(cond: ConditionForm): string {
  const cf  = COND_FIELDS.find(f => f.value === (cond.field === 'metadata' ? 'metadata' : cond.field))
  const ops = opsFor(cond.field)
  const op  = ops.find(o => o.value === cond.operator)
  const fieldLabel = cond.field === 'metadata' && cond.metaKey
    ? `metadata.${cond.metaKey}`
    : (cf?.label ?? cond.field)
  return `${fieldLabel} ${op?.sym ?? cond.operator} ${cond.value}`
}

function ruleToSentence(rule: Rule): string {
  if (rule.condition_group?.conditions?.length) {
    const conditions = ruleToConditions(rule)
    const joiner = rule.condition_group.match === 'all' ? ' AND ' : ' OR '
    return 'If ' + conditions.map(conditionToSentencePart).join(joiner)
  }
  if (!rule.condition_type) return 'No conditions'
  const cf = COND_FIELDS.find(c => c.value === rule.condition_type)
  const { operator, value } = parseCV(rule.condition_value)
  const ops = opsFor(rule.condition_type)
  const op  = ops.find(o => o.value === operator)
  return `If ${cf?.label ?? rule.condition_type} ${op?.sym ?? operator} ${value}`
}

function actionMeta(action: RuleAction | string) {
  switch (action) {
    case 'allow':                return { label: 'Approve',     color: '#16C784', bg: 'rgba(22,199,132,0.10)'  }
    case 'review':               return { label: 'Review',      color: '#F59E0B', bg: 'rgba(245,158,11,0.10)'  }
    case 'block':                return { label: 'Block',       color: '#EF4444', bg: 'rgba(239,68,68,0.10)'   }
    case 'require_verification': return { label: 'Verify',      color: '#818CF8', bg: 'rgba(129,140,248,0.10)' }
    default:                     return { label: String(action), color: '#94A3B8', bg: 'rgba(148,163,184,0.10)' }
  }
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, loading, onChange }: { checked: boolean; loading?: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={loading}
      style={{
        flexShrink: 0, position: 'relative',
        width: 36, height: 20, borderRadius: 10,
        background: checked ? '#16C784' : '#1E2D3D',
        border: `1px solid ${checked ? '#16C784' : '#2D4057'}`,
        opacity: loading ? 0.5 : 1,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 17 : 2,
        width: 14, height: 14, borderRadius: '50%', background: '#ffffff',
        transition: 'left 0.2s ease',
      }} />
    </button>
  )
}

// ─── Rule modal ───────────────────────────────────────────────────────────────

interface RuleForm {
  name:        string
  description: string
  priority:    number
  match:       'all' | 'any'
  conditions:  ConditionForm[]
  action:      RuleAction | ''
}

const EMPTY_FORM: RuleForm = {
  name: '', description: '', priority: 0,
  match: 'all', conditions: [emptyCondition()], action: '',
}

function initForm(rule?: Rule): RuleForm {
  if (!rule) return EMPTY_FORM
  return {
    name:        rule.name,
    description: rule.description ?? '',
    priority:    rule.priority ?? 0,
    match:       rule.condition_group?.match ?? 'all',
    conditions:  ruleToConditions(rule),
    action:      rule.action,
  }
}

function buildConditionGroup(form: RuleForm): ConditionGroup {
  return {
    match: form.match,
    conditions: form.conditions.map(c => ({
      field:    c.field === 'metadata' ? `metadata.${c.metaKey.trim()}` : c.field,
      operator: c.operator as ConditionOperator,
      value:    c.value.trim(),
    })).filter(c => c.field && c.value),
  }
}

function RuleModal({ rule, orgId, onSave, onClose }: {
  rule?:    Rule
  orgId:    string
  onSave:   (saved: Rule) => void
  onClose:  () => void
}) {
  const [form,   setForm]   = useState<RuleForm>(() => initForm(rule))
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  const isValid =
    form.name.trim().length >= 2 &&
    form.action !== '' &&
    form.conditions.length > 0 &&
    form.conditions.every(c =>
      c.field !== '' &&
      (c.field !== 'metadata' || c.metaKey.trim() !== '') &&
      c.value.trim() !== ''
    )

  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const updateCond = (i: number, patch: Partial<ConditionForm>) =>
    setForm(p => ({
      ...p,
      conditions: p.conditions.map((c, j) => j === i ? { ...c, ...patch } : c),
    }))

  const addCond = () => setForm(p => ({
    ...p, conditions: [...p.conditions, emptyCondition()],
  }))

  const removeCond = (i: number) => setForm(p => ({
    ...p, conditions: p.conditions.filter((_, j) => j !== i),
  }))

  const handleFieldChange = (i: number, field: string) => {
    const ops = opsFor(field)
    updateCond(i, { field, operator: ops[0].value, value: '', metaKey: '' })
  }

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setErr(null)

    const group = buildConditionGroup(form)
    const payload = {
      name:            form.name.trim(),
      description:     form.description.trim() || null,
      condition_group: group,
      condition_type:  '',
      condition_value: '',
      action:          form.action as RuleAction,
      priority:        form.priority,
      status:          'active' as RuleStatus,
      organization_id: orgId,
    }

    const { data, error } = rule
      ? await supabase.from('rules').update(payload).eq('id', rule.id).select().single()
      : await supabase.from('rules').insert(payload).select().single()

    if (error) { setErr(error.message); setSaving(false); return }
    onSave(data as Rule)
    onClose()
  }

  const grouped = CAT_ORDER.map(cat => ({ cat, fields: COND_FIELDS.filter(f => f.cat === cat) }))

  const previewParts = form.conditions
    .filter(c => c.field && c.value.trim() && (c.field !== 'metadata' || c.metaKey.trim()))
    .map(conditionToSentencePart)

  const hasPreview = previewParts.length > 0 && form.action !== ''

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4"
        style={{ background: 'rgba(5,11,20,0.85)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <div
          className="w-full flex flex-col"
          style={{ maxWidth: 640, background: '#07111F', border: '1px solid #1E2D3D', borderRadius: 20, maxHeight: '92vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #1E2D3D' }}>
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

            {/* Name + Description */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>
                  Rule Name *
                </label>
                <input
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. High-Risk Country Block"
                  className="g-input text-sm w-full"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>
                  Description <span style={{ color: '#2D4057', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="What does this rule protect against?"
                  className="g-input text-sm w-full"
                />
              </div>
            </div>

            {/* Condition group */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <label className="text-xs font-semibold" style={{ color: '#94A3B8' }}>Conditions</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: '#475569' }}>Match</span>
                  <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #1E2D3D' }}>
                    {(['all', 'any'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => set('match', m)}
                        className="px-3 py-1 text-xs font-semibold transition-colors"
                        style={{
                          background: form.match === m ? '#16C784' : 'transparent',
                          color: form.match === m ? '#050B14' : '#475569',
                        }}
                      >
                        {m === 'all' ? 'ALL' : 'ANY'}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs" style={{ color: '#475569' }}>conditions</span>
                </div>
              </div>

              <div className="space-y-2">
                {form.conditions.map((cond, i) => {
                  const cf  = COND_FIELDS.find(f => f.value === cond.field)
                  const ops = opsFor(cond.field)

                  return (
                    <div key={i} className="flex items-start gap-2">
                      {/* Field selector */}
                      <div className="relative" style={{ flexShrink: 0 }}>
                        <select
                          value={cond.field}
                          onChange={e => handleFieldChange(i, e.target.value)}
                          className="g-input text-xs pr-6"
                          style={{ width: 180 }}
                        >
                          {grouped.map(g => (
                            <optgroup key={g.cat} label={g.cat}>
                              {g.fields.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      {/* Metadata key input */}
                      {cond.field === 'metadata' && (
                        <input
                          value={cond.metaKey}
                          onChange={e => updateCond(i, { metaKey: e.target.value })}
                          placeholder="field name"
                          className="g-input text-xs"
                          style={{ width: 110, flexShrink: 0 }}
                        />
                      )}

                      {/* Operator */}
                      <select
                        value={cond.operator}
                        onChange={e => updateCond(i, { operator: e.target.value })}
                        className="g-input text-xs"
                        style={{ width: 130, flexShrink: 0 }}
                      >
                        {ops.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>

                      {/* Value */}
                      {cf?.valType === 'select' ? (
                        <select
                          value={cond.value}
                          onChange={e => updateCond(i, { value: e.target.value })}
                          className="g-input text-xs flex-1"
                        >
                          <option value="">Select…</option>
                          {cf.opts?.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={cf?.valType === 'number' ? 'number' : 'text'}
                          value={cond.value}
                          onChange={e => updateCond(i, { value: e.target.value })}
                          placeholder={cf?.hint ?? 'Value…'}
                          className="g-input text-xs flex-1"
                          min={cf?.valType === 'number' ? 0 : undefined}
                        />
                      )}

                      {/* Remove condition */}
                      {form.conditions.length > 1 && (
                        <button
                          onClick={() => removeCond(i)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
                          style={{ border: '1px solid #1E2D3D', color: '#475569' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                onClick={addCond}
                className="mt-2 flex items-center gap-1.5 text-xs transition-colors"
                style={{ color: '#475569' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#16C784')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
              >
                <Plus size={11} />
                Add condition
              </button>
            </div>

            {/* Action + Priority */}
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>
                  Then → Action *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'allow',                label: 'Approve', color: '#16C784', bg: 'rgba(22,199,132,0.08)',  border: 'rgba(22,199,132,0.3)'  },
                    { value: 'review',               label: 'Review',  color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)'  },
                    { value: 'block',                label: 'Block',   color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)'   },
                    { value: 'require_verification', label: 'Verify',  color: '#818CF8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.3)' },
                  ].map(a => (
                    <button
                      key={a.value}
                      onClick={() => set('action', a.value as RuleAction)}
                      className="py-2 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: form.action === a.value ? a.bg      : 'transparent',
                        color:      form.action === a.value ? a.color   : '#475569',
                        border:     `1px solid ${form.action === a.value ? a.border : '#1E2D3D'}`,
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>
                  Priority
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.priority}
                  onChange={e => set('priority', Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="g-input text-sm mono w-full"
                />
                <p className="text-[10px] mt-1.5" style={{ color: '#2D4057' }}>
                  Higher = evaluated first (0–100)
                </p>
              </div>
            </div>

            {/* Live preview */}
            {hasPreview && (
              <div className="px-4 py-3 rounded-xl" style={{ background: '#050B14', border: '1px solid #1E2D3D' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#2D4057' }}>
                  Rule Preview
                </p>
                <p className="text-xs mono leading-relaxed" style={{ color: '#94A3B8' }}>
                  If{' '}
                  {previewParts.map((part, i) => (
                    <span key={i}>
                      {i > 0 && (
                        <span className="mx-1 font-bold" style={{ color: '#475569' }}>
                          {form.match === 'all' ? 'AND' : 'OR'}
                        </span>
                      )}
                      <span style={{ color: '#E2E8F0' }}>{part}</span>
                    </span>
                  ))}
                  {' '}→ {' '}
                  {form.action && (() => {
                    const m = actionMeta(form.action)
                    return (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: m.bg, color: m.color }}>
                        {m.label.toUpperCase()}
                      </span>
                    )
                  })()}
                </p>
              </div>
            )}

            {err && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                {err}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #1E2D3D' }}>
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
              {saving && <RefreshCw size={13} className="animate-spin" />}
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
  const { user } = useAuth()
  const [orgId,      setOrgId]      = useState<string | null>(null)
  const [rules,      setRules]      = useState<Rule[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [showModal,  setShowModal]  = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | undefined>(undefined)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toggling,   setToggling]   = useState<Set<string>>(new Set())

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
      .order('priority',   { ascending: false })
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else     setRules((data ?? []) as Rule[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { void fetchRules() }, [fetchRules])

  const handleToggle = async (rule: Rule) => {
    setToggling(prev => new Set(prev).add(rule.id))
    const newStatus: RuleStatus = rule.status === 'active' ? 'paused' : 'active'
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: newStatus } : r))

    const { error } = await supabase.from('rules').update({ status: newStatus }).eq('id', rule.id)
    if (error) {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: rule.status } : r))
    } else if (orgId) {
      void supabase.from('audit_logs').insert({
        organization_id: orgId, user_id: user?.id ?? null,
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
        organization_id: orgId, user_id: user?.id ?? null,
        action: 'rule.deleted',
        metadata_json: { rule_id: id, name: deleted.name },
      })
    }
    setRules(prev => prev.filter(r => r.id !== id))
    setDeletingId(null)
  }

  const handleSaved = (saved: Rule) => {
    setRules(prev => {
      const idx    = prev.findIndex(r => r.id === saved.id)
      const action = idx >= 0 ? 'rule.updated' : 'rule.created'
      if (orgId) {
        void supabase.from('audit_logs').insert({
          organization_id: orgId, user_id: user?.id ?? null,
          action,
          metadata_json: { rule_id: saved.id, name: saved.name, action: saved.action },
        })
      }
      if (idx >= 0) return prev.map(r => r.id === saved.id ? saved : r)
      return [...prev, saved].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
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
    <div className="p-7" style={{ maxWidth: 1000 }}>

      {/* Sub-header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: '#475569' }}>
          {activeCount > 0
            ? <><span style={{ color: '#16C784', fontWeight: 600 }}>{activeCount} active</span>{' '}rule{activeCount !== 1 ? 's' : ''}</>
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
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6"
        style={{ background: 'rgba(22,199,132,0.05)', border: '1px solid rgba(22,199,132,0.12)' }}>
        <Info size={13} style={{ color: '#16C784', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
          Rules run <strong style={{ color: '#94A3B8' }}>after</strong> the base Risk Engine score.
          The highest-priority matching rule overrides the final decision.
          Rules support AND/OR condition groups with 10+ signal types.
        </p>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="g-card py-16 text-center">
          <Shield size={24} className="mx-auto mb-3" style={{ color: '#1E2D3D' }} />
          <p className="text-sm font-semibold mb-1.5" style={{ color: '#475569' }}>No rules yet</p>
          <p className="text-xs mb-5" style={{ color: '#2D4057' }}>
            Create your first rule to customize fraud decisions for your business.
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
          <div className="grid px-5 py-3"
            style={{ gridTemplateColumns: '44px 1fr auto auto 80px', borderBottom: '1px solid #1E2D3D', background: '#07111F', gap: '12px' }}>
            {['', 'Rule / Conditions', 'Action', 'Priority', 'Date'].map((h, i) => (
              <p key={i} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#2D4057' }}>{h}</p>
            ))}
          </div>

          {rules.map((rule, i) => {
            const meta       = actionMeta(rule.action)
            const isActive   = rule.status === 'active'
            const isToggling = toggling.has(rule.id)
            const isDeleting = deletingId === rule.id
            const condCount  = rule.condition_group?.conditions?.length ?? 1
            const matchLabel = condCount > 1 ? ` (${rule.condition_group?.match === 'all' ? 'ALL' : 'ANY'})` : ''

            return (
              <div
                key={rule.id}
                className="group grid px-5 py-4 items-start transition-colors duration-100"
                style={{
                  gridTemplateColumns: '44px 1fr auto auto 80px',
                  gap: '12px',
                  borderBottom: i < rules.length - 1 ? '1px solid #0D1B2A' : 'none',
                  borderLeft: `3px solid ${isActive ? meta.color : '#1E2D3D'}`,
                  opacity: isActive ? 1 : 0.55,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0A1828')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Toggle */}
                <div className="flex items-center pt-0.5">
                  <Toggle checked={isActive} loading={isToggling} onChange={() => void handleToggle(rule)} />
                </div>

                {/* Name + sentence */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>{rule.name}</p>
                    {condCount > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold mono"
                        style={{ background: '#0B1220', color: '#475569', border: '1px solid #1E2D3D' }}>
                        {condCount} conditions{matchLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mono" style={{ color: '#475569' }}>{ruleToSentence(rule)}</p>
                  {rule.description && (
                    <p className="text-[11px] mt-0.5" style={{ color: '#2D4057' }}>{rule.description}</p>
                  )}
                </div>

                {/* Action badge */}
                <div className="pt-0.5">
                  <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold mono whitespace-nowrap"
                    style={{ background: meta.bg, color: meta.color }}>
                    → {meta.label.toUpperCase()}
                  </span>
                </div>

                {/* Priority */}
                <div className="flex items-center gap-1 pt-0.5">
                  {(rule.priority ?? 0) > 0
                    ? <ArrowUp size={10} style={{ color: '#16C784' }} />
                    : <ArrowDown size={10} style={{ color: '#2D4057' }} />}
                  <span className="text-xs mono" style={{ color: (rule.priority ?? 0) > 0 ? '#16C784' : '#2D4057' }}>
                    {rule.priority ?? 0}
                  </span>
                </div>

                {/* Date + actions */}
                <div className="flex items-center gap-2 pt-0.5">
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
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => setDeletingId(rule.id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                        style={{ color: '#475569' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDeletingId(null)}
                        className="text-[10px] px-2 py-1 rounded-md"
                        style={{ color: '#475569', border: '1px solid #1E2D3D' }}>
                        Cancel
                      </button>
                      <button onClick={() => void handleDelete(rule.id)}
                        className="text-[10px] px-2 py-1 rounded-md font-semibold"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>
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

      {/* DB migration hint */}
      {rules.length >= 0 && (
        <details className="mt-5">
          <summary className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: '#2D4057' }}>
            <ChevronDown size={11} />
            Required: DB migration for advanced rules
          </summary>
          <div className="mt-2 px-4 py-3 rounded-lg" style={{ background: '#050B14', border: '1px solid #1E2D3D' }}>
            <p className="text-[11px] mb-2" style={{ color: '#475569' }}>
              Run once in your Supabase SQL editor to enable condition groups, descriptions, and priority:
            </p>
            <pre className="text-[11px] mono overflow-x-auto" style={{ color: '#94A3B8' }}>{`ALTER TABLE rules
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS condition_group jsonb,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

ALTER TABLE risk_events
  ADD COLUMN IF NOT EXISTS applied_rule_id text,
  ADD COLUMN IF NOT EXISTS applied_rule_name text;`}</pre>
          </div>
        </details>
      )}

      {showModal && orgId && (
        <RuleModal rule={editingRule} orgId={orgId} onSave={handleSaved} onClose={closeModal} />
      )}
    </div>
  )
}
