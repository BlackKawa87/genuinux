import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './themeContextValue'
import type { Theme } from './themeContextValue'


export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('gnx-theme') as Theme | null
      return saved === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('gnx-theme', theme) } catch { /* storage unavailable */ }
  }, [theme])

  /* Stable identity: `useT()` memoises on `toggle`, so a fresh function every
     render would rebuild the whole token object on every render of every
     screen that reads it. */
  const toggle = useCallback(() => setTheme(t => t === 'light' ? 'dark' : 'light'), [])
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
