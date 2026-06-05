/**
 * GET /api/debug/sentry-test
 *
 * Temporary endpoint — DELETE after validating Sentry integration.
 *
 * Sends a test exception + a test message to Sentry and returns the
 * Sentry event ID so you can find it in the dashboard immediately.
 *
 * Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *       (reuses an existing secret you already have in Vercel)
 *
 * Usage:
 *   curl -H "Authorization: Bearer <service_role_key>" \
 *        https://genuinux.vercel.app/api/debug/sentry-test
 */

import * as Sentry from '@sentry/node'
import { captureException, captureMessage } from '../_lib/monitoring.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Require SENTRY_DSN
  if (!process.env.SENTRY_DSN) {
    return res.status(400).json({ error: 'SENTRY_DSN is not configured in this environment' })
  }

  // Auth: service role key as bearer token
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' })
  }

  const authHeader = (req.headers['authorization'] ?? '') as string
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (token !== serviceKey) {
    return res.status(401).json({ error: 'Unauthorized — use SUPABASE_SERVICE_ROLE_KEY as bearer token' })
  }

  // Fire a test exception through monitoring.ts (triggers structured log + Sentry)
  const testError = new Error('[Sentry Test] Genuinux integration verification — safe to ignore')
  captureException(testError, {
    org_id:     'sentry-test',
    request_id: 'test-' + Date.now(),
    source:     'sentry-test-endpoint',
  })

  // Also fire a warning-level message (exercises the captureMessage path)
  captureMessage('[Sentry Test] Warning-level message verification', 'warning', {
    source: 'sentry-test-endpoint',
  })

  // Flush synchronously so events are guaranteed to be sent before response
  await Sentry.flush(3000)

  return res.status(200).json({
    ok: true,
    message: 'Test events sent to Sentry',
    next_steps: [
      '1. Open your Sentry dashboard → Issues',
      '2. Search for: "Genuinux integration verification"',
      '3. Confirm the event appears with org_id=sentry-test tag',
      '4. Delete api/debug/sentry-test.ts after validation',
    ],
  })
}
