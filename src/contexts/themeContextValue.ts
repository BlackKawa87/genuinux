import { createContext } from 'react'

export type Theme = 'light' | 'dark'

export interface ThemeContextType {
  theme: Theme
  toggle: () => void
}

/**
 * The single ThemeContext instance.
 *
 * It lives in its own module so `ThemeContext.tsx` can export only a component
 * (Fast Refresh requirement) and `useTheme.ts` can export only the hook —
 * while both still share ONE context object. Duplicating this `createContext`
 * call would make the hook read a different context than the provider writes,
 * which fails silently at runtime.
 */
export const ThemeContext = createContext<ThemeContextType>({ theme: 'light', toggle: () => {} })
