import { useT } from '../../lib/themeTokens'

/**
 * Semantic colour roles.
 *
 * A tone names an operational meaning, never a hue — so the palette can be
 * retuned in `themeTokens.ts` without touching a single call site.
 *
 * Lives in its own module so the component files stay component-only and keep
 * working with React Fast Refresh.
 */
export type Tone =
  | 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

export interface ToneColors {
  /** Solid colour: chart marks, meter fills, status dots, icons. */
  fill: string
  /** Contrast-safe colour for text on the page or on `dim`. */
  ink: string
  /** Low-opacity tint for backgrounds. */
  dim: string
  /** Border that pairs with `dim`. */
  bd: string
}

/** Resolves a tone to its fill / ink / tint / border set for the active theme. */
export function useTone(tone: Tone): ToneColors {
  const T = useT()
  switch (tone) {
    case 'brand':   return { fill: T.trust,   ink: T.trustText,   dim: T.trustDim,   bd: T.trustBd }
    case 'success': return { fill: T.success, ink: T.successText, dim: T.successDim, bd: T.successBd }
    case 'warning': return { fill: T.warning, ink: T.warningText, dim: T.warningDim, bd: T.warningBd }
    case 'danger':  return { fill: T.danger,  ink: T.dangerText,  dim: T.dangerDim,  bd: T.dangerBd }
    case 'info':    return { fill: T.info,    ink: T.infoText,    dim: T.infoDim,    bd: T.infoBd }
    case 'accent':  return { fill: T.accent,  ink: T.accentText,  dim: T.accentDim,  bd: T.accentBd }
    default:        return { fill: T.textDim, ink: T.textSec,     dim: T.deep,       bd: T.border }
  }
}
