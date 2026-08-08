import type { ReactNode, CSSProperties, ElementType } from 'react'
import { useT } from '../../lib/themeTokens'
import { useTone } from './tone'
import type { Tone } from './tone'

/* ═══════════════════════════════════════════════════════════════════════════
   Data display: metrics, meters, tables, empty and loading states.

   The single most important idea here is `Metric.tier`. Before this existed
   every number on a dashboard was rendered at the same size, so nothing was
   ranked and everything competed. Tier makes rank explicit and enforceable.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Metric ───────────────────────────────────────────────────────────────── */

type MetricTier = 'primary' | 'secondary' | 'tertiary'

interface MetricProps {
  label: ReactNode
  value: ReactNode
  /** One line of context — a rate, a comparison, a qualifier. */
  sub?: ReactNode
  /** Colours the value. Leave unset so the number reads in plain ink. */
  tone?: Tone
  tier?: MetricTier
  icon?: ElementType
  /** Period-over-period change, already computed. Sign drives the arrow. */
  delta?: number
  /** For metrics where a rise is bad (fraud, block rate, latency). */
  invertDelta?: boolean
  style?: CSSProperties
}

const TIER = {
  primary:   { value: 't-metric',    label: 11, gap: 6, subSize: 11 },
  secondary: { value: 't-metric-sm', label: 10, gap: 4, subSize: 11 },
  tertiary:  { value: 't-subhead',   label: 10, gap: 3, subSize: 10 },
} as const

/**
 * A single number with its label and context.
 *
 * Renders bare — no border, no background. Put it directly on the page and let
 * whitespace separate it from its neighbours. Wrap in `Card` only when the
 * metric genuinely needs containment.
 */
export function Metric({
  label, value, sub, tone, tier = 'secondary', icon: Icon, delta, invertDelta, style,
}: MetricProps) {
  const T = useT()
  const c = useTone(tone ?? 'neutral')
  const t = TIER[tier]

  const valueColor = tone ? c.ink : T.text
  const good = delta === undefined ? null : invertDelta ? delta < 0 : delta > 0
  const deltaColor = delta === 0 || good === null ? T.textDim : good ? T.successText : T.dangerText

  return (
    <div style={{ minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: t.gap }}>
        {Icon && <Icon size={12} style={{ color: tone ? c.fill : T.textDim, flexShrink: 0 }} />}
        <span
          className="t-label"
          style={{ fontSize: t.label, color: T.textDim, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span className={t.value} style={{ color: valueColor }}>{value}</span>
        {delta !== undefined && Number.isFinite(delta) && (
          <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: deltaColor }}>
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'}
            {delta !== 0 && `${Math.abs(delta).toFixed(1)}%`}
          </span>
        )}
      </div>

      {sub && (
        <p style={{ fontSize: t.subSize, lineHeight: '15px', color: T.textDim, margin: '3px 0 0' }}>{sub}</p>
      )}
    </div>
  )
}

/**
 * Row of metrics separated by hairlines rather than card borders.
 * This is the de-carded replacement for a grid of bordered stat boxes.
 */
export function MetricRow({
  children, columns, style,
}: { children: ReactNode; columns?: number; style?: CSSProperties }) {
  const T = useT()
  const cells = Array.isArray(children) ? children : [children]
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns
          ? `repeat(${columns}, minmax(0, 1fr))`
          : 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 1,
        background: T.border,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Each cell paints its own surface; the 1px grid gap becomes the rule. */}
      {cells.map((child, i) => (
        <div key={i} style={{ background: T.card, padding: '14px 16px' }}>{child}</div>
      ))}
    </div>
  )
}

/* ── Meter ────────────────────────────────────────────────────────────────── */

interface MeterProps {
  label?: ReactNode
  value: number
  max?: number
  /** Printed at the right of the label row. Defaults to the raw value. */
  display?: ReactNode
  color?: string
  height?: number
  /** Percentage override when `value/max` is not the fill ratio you want. */
  pct?: number
}

/** Labelled progress / distribution bar. One implementation, used everywhere. */
export function Meter({ label, value, max = 100, display, color, height = 4, pct }: MeterProps) {
  const T = useT()
  const ratio = pct ?? (max > 0 ? (value / max) * 100 : 0)
  const fill = color ?? T.trust

  return (
    <div>
      {(label || display) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
          <span className="t-caption" style={{ color: T.textSec, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: fill, flexShrink: 0 }}>
            {display ?? value.toLocaleString()}
          </span>
        </div>
      )}
      <div
        className="g-meter"
        style={{ height }}
        role="meter"
        aria-valuenow={Math.round(ratio)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <span style={{ width: `${Math.max(0, Math.min(100, ratio))}%`, background: fill }} />
      </div>
    </div>
  )
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  /** What is missing. */
  title: ReactNode
  /** What will appear here, and what makes it appear. Always say this. */
  children?: ReactNode
  icon?: ElementType
  action?: ReactNode
  /** Drops the border and fill — for use *inside* an existing surface, so an
      empty table does not render a box inside a box. */
  bare?: boolean
}

/**
 * Compact and explanatory. Never a large blank box with "No data" in the
 * middle — an empty region is an opportunity to teach the next step.
 */
export function EmptyState({ title, children, icon: Icon, action, bare }: EmptyStateProps) {
  return (
    <div
      className={bare ? undefined : 'g-empty'}
      style={bare ? { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 18px' } : undefined}
    >
      {Icon && (
        <span className="g-empty-icon">
          <Icon size={14} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="g-empty-title">{title}</p>
        {children && <div className="g-empty-body">{children}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

/* ── Loading ──────────────────────────────────────────────────────────────── */

export function Skeleton({ width, height = 12, radius = 6, style }: {
  width?: number | string; height?: number; radius?: number; style?: CSSProperties
}) {
  return <div className="skeleton" style={{ width: width ?? '100%', height, borderRadius: radius, ...style }} />
}

/** Placeholder that matches the shape of a metric row while data loads. */
export function SkeletonMetrics({ count = 4 }: { count?: number }) {
  const T = useT()
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 1,
        background: T.border,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ background: T.card, padding: '14px 16px' }}>
          <Skeleton width={64} height={9} />
          <Skeleton width={88} height={22} style={{ marginTop: 10 }} />
          <Skeleton width={54} height={9} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  )
}

/* ── Table ────────────────────────────────────────────────────────────────── */

/**
 * Table shell. Owns the horizontal scroll so data-dense tables never force the
 * page body to scroll sideways, and keeps the header pinned while rows move.
 */
export function TableWrap({
  children, minWidth = 720, maxHeight, style,
}: { children: ReactNode; minWidth?: number; maxHeight?: number | string; style?: CSSProperties }) {
  return (
    <div className="g-card g-scroll" style={{ overflow: 'auto', maxHeight, ...style }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  )
}

export function Table({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <table className="g-table" style={style}>{children}</table>
}

/* ── Segmented control ────────────────────────────────────────────────────── */

interface SegmentedProps<T extends string | number> {
  value: T
  options: readonly { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  /** Accessible name for the group, e.g. "Time range". */
  label: string
}

/** Range pickers and small view switches. Replaces ad-hoc button rows. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(opt => (
        <button
          key={String(opt.value)}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className="seg-item"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
