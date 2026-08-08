/**
 * Genuinux UI primitives.
 *
 * Import from here, not from the individual modules, so the internal file
 * layout can change without touching every screen.
 *
 * Design rules these components enforce:
 *   Surfaces   Card > Well. Never a card inside a card — use Section.
 *   Hierarchy  Metric `tier` ranks numbers; not everything is primary.
 *   Colour     `tone` names an operational meaning, never a hue.
 *   Controls   One height scale, one radius, one focus ring.
 */
export {
  Button, Spinner,
  Card, Well, Section, PageHeader,
  Badge, StatusDot, Notice, Divider,
} from './primitives'

export { useTone } from './tone'
export type { Tone, ToneColors } from './tone'

export {
  Metric, MetricRow, Meter,
  EmptyState, Skeleton, SkeletonMetrics,
  TableWrap, Table, Segmented,
} from './data'

export {
  Field, Input, Textarea, Select, Switch, Toolbar,
} from './forms'
