/**
 * Frontend error monitoring — Priority 6.
 *
 * Structured console output captured by Vercel and any log drain.
 * Zero dependencies — works without any SDK installed.
 *
 * To enable full Sentry:
 *   1. npm install @sentry/react
 *   2. Add VITE_SENTRY_DSN to .env.local and Vercel environment variables
 *   3. Call Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN }) in src/main.tsx
 *      and wrap <App /> with <Sentry.ErrorBoundary>
 */

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err)
  const stack   = err instanceof Error ? err.stack   : undefined
  console.error('[Genuinux Error]', { message, stack, ...context })
}

export function captureMessage(msg: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if      (level === 'error')   console.error('[Genuinux]', msg)
  else if (level === 'warning') console.warn('[Genuinux]', msg)
  else                          console.info('[Genuinux]', msg)
}
