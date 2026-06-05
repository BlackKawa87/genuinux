/**
 * Server-side error monitoring + structured logging.
 *
 * Emits structured JSON logs (always) and forwards to Sentry (when SENTRY_DSN is set).
 *
 * Sensitive data policy:
 *   - Authorization headers, API keys, tokens, secrets are NEVER forwarded to Sentry.
 *   - beforeSend strips auth/cookie headers and sensitive body fields.
 *   - sendDefaultPii: false prevents automatic PII capture.
 *
 * Info-level captureMessage calls are NOT forwarded to Sentry (high volume, not actionable).
 * Only 'warning' and 'error' levels are forwarded.
 */

import * as Sentry from '@sentry/node'

// ─── Initialization ───────────────────────────────────────────────────────────

const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key',
  'x-auth-token', 'x-secret',
])

const SENSITIVE_BODY_FIELDS = new Set([
  'api_key', 'token', 'secret', 'password', 'key', 'private_key', 'access_token',
])

const sentryEnabled = !!process.env.SENTRY_DSN

if (sentryEnabled) {
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.VERCEL_ENV ?? 'development',
    release:          process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.05,  // 5% of requests — low volume during beta
    sendDefaultPii:   false,
    beforeSend(event) {
      // Strip sensitive request headers
      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, string>
        for (const key of Object.keys(headers)) {
          if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
            delete headers[key]
          }
        }
      }
      // Strip sensitive body fields
      if (event.request?.data && typeof event.request.data === 'object') {
        const data = { ...(event.request.data as Record<string, unknown>) }
        for (const field of Object.keys(data)) {
          if (SENSITIVE_BODY_FIELDS.has(field.toLowerCase())) {
            delete data[field]
          }
        }
        event.request.data = data
      }
      return event
    },
  })
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

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

/** Extracts known fields from context as Sentry tags (indexed, filterable). */
function extractSentryTags(context?: Record<string, unknown>): Record<string, string> {
  const tags: Record<string, string> = {}
  if (!context) return tags
  for (const field of ['org_id', 'api_key_id', 'plan', 'request_id', 'shadow_mode'] as const) {
    const val = context[field]
    if (val !== undefined && val !== null) {
      tags[field] = String(val)
    }
  }
  return tags
}

// ─── Public API ───────────────────────────────────────────────────────────────

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

  if (!sentryEnabled) return

  Sentry.withScope(scope => {
    const tags = extractSentryTags(context)
    for (const [k, v] of Object.entries(tags)) scope.setTag(k, v)
    if (context) scope.setExtras(context)
    Sentry.captureException(err)
  })
  // Fire-and-forget flush — ensures event is sent before Vercel freezes the function
  void Sentry.flush(2000)
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

  // Info-level messages are high-volume (one per risk check) — skip Sentry to preserve quota
  if (!sentryEnabled || level === 'info') return

  Sentry.withScope(scope => {
    const tags = extractSentryTags(context)
    for (const [k, v] of Object.entries(tags)) scope.setTag(k, v)
    if (context) scope.setExtras(context)
    Sentry.captureMessage(message, level)
  })
}

/**
 * Sets per-request Sentry tags on the global scope.
 * Call once per handler after org_id and plan are known.
 * In Vercel serverless, each function instance is single-threaded —
 * tags are overwritten per request with no concurrency risk.
 */
export interface SentryRequestContext {
  org_id?:     string
  api_key_id?: string
  plan?:       string
  request_id?: string
}

export function setSentryTags(ctx: SentryRequestContext): void {
  if (!sentryEnabled) return
  if (ctx.org_id)     Sentry.setTag('org_id',     ctx.org_id)
  if (ctx.api_key_id) Sentry.setTag('api_key_id', ctx.api_key_id)
  if (ctx.plan)       Sentry.setTag('plan',        ctx.plan)
  if (ctx.request_id) Sentry.setTag('request_id',  ctx.request_id)
}
