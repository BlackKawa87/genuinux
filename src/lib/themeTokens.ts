import { useTheme } from '../contexts/ThemeContext'

export function useT() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return {
    dark,
    toggle,
    bg:           dark ? '#07080C'                     : '#F1F4FA',
    card:         dark ? '#0B1016'                     : '#FFFFFF',
    deep:         dark ? '#050709'                     : '#E8ECF4',
    elevated:     dark ? '#101721'                     : '#ECF0F7',
    border:       dark ? '#182030'                     : '#D8DCEC',
    borderLight:  dark ? '#1C2838'                     : '#E4E8F2',
    text:         dark ? '#ECF0FA'                     : '#07090F',
    textSec:      dark ? '#8B9BB8'                     : '#5B6480',
    textDim:      dark ? '#475569'                     : '#9BA4BC',
    trust:        '#16C784',
    trustDim:     'rgba(22,199,132,0.09)',
    trustBd:      'rgba(22,199,132,0.22)',
    headerBg:     dark ? 'rgba(7,8,12,0.96)'           : 'rgba(255,255,255,0.95)',
    inputBg:      dark ? '#07080C'                     : '#F1F4FA',
    scrollbarBg:  dark ? '#0B1016'                     : '#E8ECF4',
    codeBg:       dark ? '#07080C'                     : '#07090F',
    codeText:     '#ECF0FA',
  }
}
