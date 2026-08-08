import { forwardRef, useId } from 'react'
import type {
  InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode, CSSProperties,
} from 'react'
import { useT } from '../../lib/themeTokens'

/* ═══════════════════════════════════════════════════════════════════════════
   Form controls.

   Every control shares one height, one radius, one focus ring. Labels are real
   <label> elements bound by id, and help/error text is wired to the control
   through aria-describedby so screen readers announce it with the field.
   ═══════════════════════════════════════════════════════════════════════════ */

interface FieldShellProps {
  label?: ReactNode
  /** Persistent guidance shown under the control. */
  help?: ReactNode
  /** Replaces `help` when present and marks the control invalid. */
  error?: ReactNode
  required?: boolean
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}

/** Wraps a control with its label, help text and error, correctly associated. */
export function Field({ label, help, error, required, children }: FieldShellProps) {
  const T = useT()
  const id = useId()
  const helpId = `${id}-help`
  const hasMsg = Boolean(error || help)

  return (
    <div>
      {label && (
        <label htmlFor={id} className="g-field-label">
          {label}
          {required && <span style={{ color: T.dangerText, marginLeft: 3 }} aria-hidden="true">*</span>}
        </label>
      )}
      {children({ id, describedBy: hasMsg ? helpId : undefined, invalid: Boolean(error) })}
      {error
        ? <p id={helpId} className="g-field-error" role="alert">{error}</p>
        : help
          ? <p id={helpId} className="g-field-help">{help}</p>
          : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', invalid, ...rest }, ref,
) {
  return (
    <input
      ref={ref}
      className={`g-input ${className}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
})

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = '', invalid, rows = 4, ...rest }, ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`g-textarea ${className}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
})

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }

/**
 * Native select with a drawn chevron. Native is deliberate: it inherits the
 * platform's keyboard handling and mobile picker, which a custom listbox
 * reimplements badly.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = '', invalid, children, style, ...rest }, ref,
) {
  const T = useT()
  const chevron = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${T.textDim}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  )
  return (
    <select
      ref={ref}
      className={`g-select ${className}`}
      aria-invalid={invalid || undefined}
      style={{
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,${chevron}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: 30,
        cursor: 'pointer',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  )
})

/* ── Switch ───────────────────────────────────────────────────────────────── */

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
}

/** Toggle for a setting that applies immediately. */
export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  const T = useT()
  return (
    <label
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 34, height: 20, flexShrink: 0, marginTop: 1,
          borderRadius: 999,
          border: `1px solid ${checked ? T.trust : T.borderStrong}`,
          background: checked ? T.trust : T.deep,
          cursor: 'inherit',
          transition: `background-color ${T.dFast} ${T.ease}, border-color ${T.dFast} ${T.ease}`,
        }}
      >
        <span
          style={{
            position: 'absolute', top: 2, left: checked ? 16 : 2,
            width: 14, height: 14, borderRadius: 999,
            background: checked ? '#04120C' : T.card,
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            transition: `left ${T.dFast} ${T.ease}`,
          }}
        />
      </button>
      {(label || description) && (
        <span style={{ minWidth: 0 }}>
          {label && <span className="t-subhead" style={{ color: T.text, display: 'block' }}>{label}</span>}
          {description && <span className="t-caption" style={{ color: T.textDim, display: 'block', marginTop: 2 }}>{description}</span>}
        </span>
      )}
    </label>
  )
}

/* ── Toolbar ──────────────────────────────────────────────────────────────── */

/**
 * Filter/action strip above a table. Fixed height so controls never jitter as
 * labels change, and wraps rather than overflowing on narrow viewports.
 */
export function Toolbar({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 14,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
