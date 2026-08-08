import { useMemo } from 'react'
import { useTheme } from '../contexts/ThemeContext'

/**
 * Runtime mirror of the CSS custom properties declared in `index.css`.
 *
 * Screens style themselves with inline `style={{}}` objects, so they need the
 * token values as JS strings. Keep this file and the `:root` / `[data-theme]`
 * blocks in `index.css` in lockstep — they are the same design system expressed
 * twice, once for CSS classes and once for inline styles.
 *
 * Every key that existed before is still here with the same meaning, so no
 * screen needs to change to benefit from a token refinement.
 */
export function useT() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'

  return useMemo(() => ({
    dark,
    toggle,

    /* ── Surfaces: canvas < recessed < surface < raised ─────────────────── */
    bg:          dark ? '#07080C' : '#F4F6FA',
    card:        dark ? '#0C0F16' : '#FFFFFF',
    deep:        dark ? '#090B10' : '#EDF0F6',
    elevated:    dark ? '#141A26' : '#E7EBF3',
    raised:      dark ? '#111621' : '#FFFFFF',

    /* ── Lines ─────────────────────────────────────────────────────────── */
    border:       dark ? '#1B2230' : '#DEE3ED',
    borderLight:  dark ? '#151B27' : '#E8EBF3',
    borderStrong: dark ? '#2A3346' : '#C7CEDD',

    /* ── Ink: three real tiers ─────────────────────────────────────────── */
    text:        dark ? '#ECF0FA' : '#080B12',
    textSec:     dark ? '#94A0B8' : '#59627A',
    textDim:     dark ? '#626D85' : '#8B94AA',

    /* ── Brand ─────────────────────────────────────────────────────────── */
    trust:       '#16C784',
    /** Brand as *text*. `trust` on white is ~2.1:1 and fails AA — use this. */
    trustText:   dark ? '#2DD79A' : '#0A8F5D',
    trustHover:  dark ? '#34D89C' : '#12B075',
    trustDim:    dark ? 'rgba(22,199,132,0.10)' : 'rgba(22,199,132,0.08)',
    trustBd:     dark ? 'rgba(22,199,132,0.22)' : 'rgba(22,199,132,0.24)',
    trustRing:   dark ? 'rgba(22,199,132,0.20)' : 'rgba(22,199,132,0.16)',

    /* ── Semantic states ───────────────────────────────────────────────── */
    success:     '#16C784',
    successText: dark ? '#2DD79A' : '#0A8F5D',
    successDim:  dark ? 'rgba(22,199,132,0.10)' : 'rgba(22,199,132,0.09)',
    successBd:   'rgba(22,199,132,0.22)',

    warning:     '#F59E0B',
    warningText: dark ? '#F5B544' : '#A15C07',
    warningDim:  dark ? 'rgba(245,158,11,0.11)' : 'rgba(245,158,11,0.10)',
    warningBd:   'rgba(245,158,11,0.24)',

    danger:      '#EF4444',
    dangerText:  dark ? '#F98080' : '#C62828',
    dangerDim:   dark ? 'rgba(239,68,68,0.11)' : 'rgba(239,68,68,0.09)',
    dangerBd:    'rgba(239,68,68,0.22)',

    info:        '#38BDF8',
    infoText:    dark ? '#5CCBFA' : '#0369A1',
    infoDim:     dark ? 'rgba(56,189,248,0.11)' : 'rgba(56,189,248,0.10)',
    infoBd:      'rgba(56,189,248,0.26)',

    /** ML / model domain. */
    accent:      '#A78BFA',
    accentText:  dark ? '#B9A2FB' : '#6D4AD6',
    accentDim:   dark ? 'rgba(167,139,250,0.12)' : 'rgba(167,139,250,0.10)',
    accentBd:    'rgba(167,139,250,0.26)',

    /* ── Risk ladder: ordered and distinguishable ──────────────────────── */
    riskLow:   '#16C784',
    riskLowT:  dark ? '#2DD79A' : '#0A8F5D',
    riskMed:   '#F59E0B',
    riskMedT:  dark ? '#F5B544' : '#A15C07',
    riskHigh:  '#F97316',
    riskHighT: dark ? '#FB923C' : '#B44708',
    riskCrit:  '#EF4444',
    riskCritT: dark ? '#F98080' : '#C62828',

    /* ── Chrome ────────────────────────────────────────────────────────── */
    headerBg:    dark ? 'rgba(12,15,22,0.90)' : 'rgba(255,255,255,0.90)',
    inputBg:     dark ? '#0C0F16' : '#FFFFFF',
    scrollbarBg: dark ? '#0C0F16' : '#EDF0F6',
    hoverBg:     dark ? 'rgba(236,240,250,0.045)' : 'rgba(8,11,18,0.045)',
    overlay:     dark ? 'rgba(0,0,0,0.62)' : 'rgba(10,14,22,0.44)',
    codeBg:      dark ? '#07080C' : '#0A0D14',
    codeText:    '#ECF0FA',

    /* ── Elevation ─────────────────────────────────────────────────────── */
    shSm: dark ? 'none' : '0 1px 2px rgba(10,14,24,0.05)',
    shMd: dark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 4px 12px rgba(10,14,24,0.07), 0 1px 3px rgba(10,14,24,0.05)',
    shLg: dark ? '0 24px 60px rgba(0,0,0,0.6)'  : '0 16px 40px rgba(10,14,24,0.12), 0 2px 8px rgba(10,14,24,0.06)',

    /* ── Radius ────────────────────────────────────────────────────────── */
    rXs: 4, rSm: 6, rMd: 8, rLg: 10, rXl: 14, rFull: 999,

    /* ── Motion ────────────────────────────────────────────────────────── */
    dFast: '120ms', dBase: '180ms', dSlow: '240ms',
    ease: 'cubic-bezier(0.22, 0.61, 0.36, 1)',

    /* ── Type families ─────────────────────────────────────────────────── */
    fDisplay: "'Inter Tight', 'DM Sans', system-ui, sans-serif",
    fBody:    "'DM Sans', system-ui, -apple-system, sans-serif",
    fMono:    "'IBM Plex Mono', 'SF Mono', monospace",
  }), [dark, toggle])
}

export type Tokens = ReturnType<typeof useT>

/** Colour for a risk level, as a fill (chart bars, dots, meters). */
export function riskFill(level: string, T: Tokens): string {
  if (level === 'critical') return T.riskCrit
  if (level === 'high')     return T.riskHigh
  if (level === 'medium')   return T.riskMed
  return T.riskLow
}

/** Contrast-safe colour for a risk level used as text. */
export function riskInk(level: string, T: Tokens): string {
  if (level === 'critical') return T.riskCritT
  if (level === 'high')     return T.riskHighT
  if (level === 'medium')   return T.riskMedT
  return T.riskLowT
}

/** Colour for a decision, as a fill. */
export function decisionFill(decision: string, T: Tokens): string {
  if (decision === 'block')  return T.danger
  if (decision === 'review') return T.warning
  if (decision === 'allow' || decision === 'approve') return T.success
  return T.textDim
}

/** Contrast-safe colour for a decision used as text. */
export function decisionInk(decision: string, T: Tokens): string {
  if (decision === 'block')  return T.dangerText
  if (decision === 'review') return T.warningText
  if (decision === 'allow' || decision === 'approve') return T.successText
  return T.textDim
}

/**
 * Trust score reads high-is-good; fraud score reads high-is-bad. Keeping both
 * mappings here stops screens from inventing their own thresholds.
 */
export function trustInk(score: number, T: Tokens): string {
  if (score >= 70) return T.successText
  if (score >= 45) return T.warningText
  return T.dangerText
}

export function fraudInk(score: number, T: Tokens): string {
  if (score >= 70) return T.dangerText
  if (score >= 40) return T.warningText
  return T.successText
}
