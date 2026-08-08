import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode, ElementType, CSSProperties } from 'react'
import { useT } from '../../lib/themeTokens'
import { useTone } from './tone'
import type { Tone } from './tone'

/* ═══════════════════════════════════════════════════════════════════════════
   Surfaces, buttons and status marks.

   Visual rules these encode:
   • A surface is either a card, a recessed well, or nothing. Never a card
     inside a card — use `Section` to group without drawing another box.
   • Buttons share one height scale so toolbars never look ragged.
   • Status colour is semantic. `tone` names an operational meaning, never a
     hue, so the palette can shift without touching call sites.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Button ───────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Renders a spinner and blocks interaction. */
  loading?: boolean
  /** Square icon-only button. Supply `aria-label` when using this. */
  iconOnly?: boolean
  block?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, iconOnly, block, className = '', disabled, children, ...rest },
  ref,
) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size !== 'md' && `btn-${size}`,
    iconOnly && 'btn-icon',
    block && 'btn-block',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size={size === 'lg' ? 14 : 12} />}
      {children}
    </button>
  )
})

/** Bare spinner — same geometry everywhere it appears. */
export function Spinner({ size = 14, color }: { size?: number; color?: string }) {
  const T = useT()
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${T.border}`,
        borderTopColor: color ?? T.trust,
        animation: 'spin 0.7s linear infinite',
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

interface SurfaceProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Padding step. `none` when the child controls its own edges (tables). */
  pad?: 'none' | 'sm' | 'md' | 'lg'
  as?: ElementType
}

const PAD = { none: 0, sm: 12, md: 16, lg: 20 } as const

/** The one bordered surface. Reach for `Section` before reaching for this. */
export function Card({ children, className = '', style, pad = 'md', as: As = 'div' }: SurfaceProps) {
  return (
    <As className={`g-card ${className}`} style={{ padding: PAD[pad], ...style }}>
      {children}
    </As>
  )
}

/** Recessed region *inside* an existing surface. Never nest one in another. */
export function Well({ children, className = '', style, pad = 'sm', as: As = 'div' }: SurfaceProps) {
  return (
    <As className={`g-well ${className}`} style={{ padding: PAD[pad], ...style }}>
      {children}
    </As>
  )
}

/* ── Section: grouping without a container ────────────────────────────────── */

interface SectionProps {
  title?: ReactNode
  /** One quiet line of explanation. Omit when the title carries it alone. */
  description?: ReactNode
  /** Right-aligned controls: filters, range pickers, a single primary action. */
  actions?: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Draws a hairline under the heading. Use for long scrolling regions. */
  divided?: boolean
}

/**
 * Groups content with type and space instead of a border. This is the default
 * way to structure a page — cards are the exception, not the rule.
 */
export function Section({ title, description, actions, children, className = '', style, divided }: SectionProps) {
  const T = useT()
  const hasHead = Boolean(title || description || actions)

  return (
    <section className={className} style={style}>
      {hasHead && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: divided ? 12 : 14,
            paddingBottom: divided ? 10 : 0,
            borderBottom: divided ? `1px solid ${T.border}` : undefined,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && <h2 className="t-section" style={{ color: T.text, margin: 0 }}>{title}</h2>}
            {description && (
              <p className="t-caption" style={{ color: T.textDim, margin: '3px 0 0' }}>{description}</p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* ── Page header ──────────────────────────────────────────────────────────── */

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Small status marks that belong beside the title, not inside the body. */
  meta?: ReactNode
  actions?: ReactNode
  icon?: ElementType
  iconColor?: string
}

/** Every screen opens the same way, at the same size, on the same baseline. */
export function PageHeader({ title, description, meta, actions, icon: Icon, iconColor }: PageHeaderProps) {
  const T = useT()
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap',
        marginBottom: 24,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {Icon && <Icon size={17} style={{ color: iconColor ?? T.textDim, flexShrink: 0 }} />}
          <h1 className="t-title" style={{ color: T.text, margin: 0 }}>{title}</h1>
          {meta}
        </div>
        {description && (
          <p className="t-meta" style={{ color: T.textDim, margin: '5px 0 0' }}>{description}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>
      )}
    </header>
  )
}

/* ── Status marks ─────────────────────────────────────────────────────────── */

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  /** Solid reads louder — reserve it for a single decisive state per view. */
  variant?: 'soft' | 'outline' | 'solid'
  /** Leading dot, for live/status semantics. */
  dot?: boolean
  className?: string
  style?: CSSProperties
  title?: string
}

export function Badge({ children, tone = 'neutral', variant = 'soft', dot, className = '', style, title }: BadgeProps) {
  const c = useTone(tone)
  const T = useT()

  const skin =
    variant === 'solid'
      ? { background: c.fill, color: tone === 'neutral' ? T.card : '#04120C', borderColor: c.fill }
      : variant === 'outline'
        ? { background: 'transparent', color: c.ink, borderColor: c.bd }
        : { background: c.dim, color: c.ink, borderColor: c.bd }

  return (
    <span
      title={title}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: 6,
        border: '1px solid',
        fontSize: 10,
        lineHeight: '15px',
        fontWeight: 600,
        letterSpacing: '0.005em',
        whiteSpace: 'nowrap',
        ...skin,
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: 5, height: 5, borderRadius: 999, flexShrink: 0,
            background: variant === 'solid' ? 'currentColor' : c.fill,
          }}
        />
      )}
      {children}
    </span>
  )
}

/** Live/idle indicator. The pulse is the only always-on motion in the product. */
export function StatusDot({ tone = 'success', pulse = true, label }: { tone?: Tone; pulse?: boolean; label?: ReactNode }) {
  const c = useTone(tone)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: c.ink }}>
      <span
        className={pulse ? 'pulse-dot' : undefined}
        style={{ width: 6, height: 6, borderRadius: 999, background: c.fill, flexShrink: 0 }}
      />
      {label}
    </span>
  )
}

/* ── Inline notice ────────────────────────────────────────────────────────── */

interface NoticeProps {
  children: ReactNode
  tone?: Tone
  title?: ReactNode
  icon?: ElementType
  actions?: ReactNode
}

/** Contextual message. Quiet tint, one hairline, never a shouting banner. */
export function Notice({ children, tone = 'info', title, icon: Icon, actions }: NoticeProps) {
  const c = useTone(tone)
  const T = useT()
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 8,
        background: c.dim,
        border: `1px solid ${c.bd}`,
      }}
    >
      {Icon && <Icon size={14} style={{ color: c.fill, flexShrink: 0, marginTop: 1 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <p className="t-subhead" style={{ color: c.ink, margin: 0 }}>{title}</p>}
        <div className="t-caption" style={{ color: T.textSec, marginTop: title ? 2 : 0 }}>{children}</div>
      </div>
      {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
    </div>
  )
}

export function Divider({ spacing = 0 }: { spacing?: number }) {
  return <hr className="g-divider" style={{ margin: `${spacing}px 0` }} />
}
