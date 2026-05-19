import { useTheme } from '../contexts/ThemeContext'

export function useT() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return {
    dark,
    toggle,
    bg:           dark ? '#050B14'                     : '#F8FAFC',
    card:         dark ? '#0B1220'                     : '#FFFFFF',
    deep:         dark ? '#07111F'                     : '#F1F5F9',
    elevated:     dark ? '#0F1929'                     : '#F0F4F8',
    border:       dark ? '#1E2D3D'                     : '#E2E8F0',
    borderLight:  dark ? '#243447'                     : '#CBD5E1',
    text:         dark ? '#F1F5F9'                     : '#0F172A',
    textSec:      dark ? '#94A3B8'                     : '#64748B',
    textDim:      dark ? '#475569'                     : '#94A3B8',
    trust:        '#16C784',
    trustDim:     'rgba(22,199,132,0.08)',
    trustBd:      'rgba(22,199,132,0.2)',
    headerBg:     dark ? 'rgba(7,17,31,0.95)'          : 'rgba(255,255,255,0.95)',
    inputBg:      dark ? '#050B14'                     : '#F8FAFC',
    scrollbarBg:  dark ? '#0B1220'                     : '#F1F5F9',
    codeBg:       dark ? '#050B14'                     : '#0F172A',
    codeText:     '#F1F5F9',
  }
}
