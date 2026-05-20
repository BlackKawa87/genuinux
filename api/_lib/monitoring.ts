/**
 * Server-side structured error monitoring.
 *
 * Emits structured JSON logs that Vercel ingests natively and that any
 * external log drain (Axiom, Datadog, Logtail) can consume.
 *
 * To enable full Sentry forwarding:
 *   1. npm install @sentry/node
 *   2. Set SENTRY_DSN in Vercel environment variables
 *   3. Uncomment the Sentry blocks below
 *
 * The app works identically with or without SENTRY_DSN.
 */

interface LogEntry {
  level:     'error' | 'warning' | 'info'
  message:   string
  service:   string
  timestamp: string
  context?:  Record<string, unknown>
  stack?:    string
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry)
  if      (entry.level === 'error')   console.error(line)
  else if (entry.level === 'warning') console.warn(line)
  else                                console.info(line)
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err)
  const stack   = err instanceof Error ? err.stack   : undefined
  emit({
    level:     'error',
    message,
    service:   'genuinux-api',
    timestamp: new Date().toISOString(),
    context,
    stack,
  })

  // ── Sentry (uncomment after installing @sentry/node) ────────────────────
  // if (process.env.SENTRY_DSN) {
  //   try {
  //     const Sentry = await import('@sentry/node')
  //     Sentry.captureException(err, { extra: context })
  //   } catch { /* Sentry unavailable — structured log above is sufficient */ }
  // }
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>,
): void {
  emit({
    level,
    message,
    service:   'genuinux-api',
    timestamp: new Date().toISOString(),
    context,
  })
}
